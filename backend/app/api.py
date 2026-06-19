import os
from dotenv import load_dotenv
load_dotenv()

import tempfile
import uuid
import logging
import hashlib
import secrets
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import asyncio
import json

# Backend imports lazily loaded in endpoints to prevent port bind timeout on Render
from app.database import get_documents_collection, get_chat_history_collection, get_users_collection
from datetime import datetime

app = FastAPI()

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import networkx as nx
import chromadb

# Initialize global graph and collection for cross-document QA
global_chroma_client = chromadb.PersistentClient(path="./chroma_db_storage")
global_collection = global_chroma_client.get_or_create_collection(name="global_collection")
global_graph = nx.DiGraph()

# Global State
GLOBAL_STATE = {
    "active_doc_id": None,
    "documents": {},
    "sessions": {},
    "global_graph": global_graph,
    "global_collection": global_collection
}

UPLOAD_PROGRESS = {}

class QueryRequest(BaseModel):
    query: str

class SwitchRequest(BaseModel):
    doc_id: str

class AuthRequest(BaseModel):
    email: str
    password: str

def hash_password(password: str, salt: bytes = None) -> dict:
    if salt is None:
        salt = os.urandom(16)
    pwdhash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return {"salt": salt.hex(), "hash": pwdhash.hex()}

def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    pwdhash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return pwdhash.hex() == hash_hex

@app.post("/api/register")
def register(request: AuthRequest):
    users_col = get_users_collection()
    if users_col is None:
        raise HTTPException(status_code=500, detail="Database not configured")
        
    if users_col.find_one({"email": request.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed = hash_password(request.password)
    user_doc = {
        "email": request.email,
        "password_salt": hashed["salt"],
        "password_hash": hashed["hash"],
        "created_at": datetime.utcnow()
    }
    users_col.insert_one(user_doc)
    
    return {"message": "Registration successful", "token": secrets.token_hex(32)}

@app.post("/api/login")
def login(request: AuthRequest):
    users_col = get_users_collection()
    if users_col is None:
        raise HTTPException(status_code=500, detail="Database not configured")
        
    user = users_col.find_one({"email": request.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    if not verify_password(request.password, user["password_salt"], user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    return {"message": "Login successful", "token": secrets.token_hex(32)}

def process_document_task(tmp_path: str, filename: str, size_str: str, doc_id: str):
    try:
        UPLOAD_PROGRESS[doc_id]["progress"] = 20
        UPLOAD_PROGRESS[doc_id]["message"] = "Extracting elements..."
        from app.ingestion_pipeline import process_document
        elements = process_document(tmp_path)
        os.unlink(tmp_path)
        
        if not elements:
            UPLOAD_PROGRESS[doc_id]["status"] = "error"
            UPLOAD_PROGRESS[doc_id]["message"] = "No elements could be extracted."
            return

        UPLOAD_PROGRESS[doc_id]["progress"] = 50
        UPLOAD_PROGRESS[doc_id]["message"] = "Building graph & indexing..."
        
        from app.graph_builder import build_graph_and_index
        graph, collection = build_graph_and_index(
            elements, 
            doc_id, 
            GLOBAL_STATE["global_graph"], 
            GLOBAL_STATE["global_collection"]
        )
        
        UPLOAD_PROGRESS[doc_id]["progress"] = 80
        UPLOAD_PROGRESS[doc_id]["message"] = "Generating summary..."
        
        from app.qa_generator import generate_document_summary
        full_text = "\n".join([getattr(e, "text", str(e)) for e in elements if type(e).__name__ == "TextElement"])
        summary_data = generate_document_summary(full_text)
        
        GLOBAL_STATE["documents"][doc_id] = {
            "graph": graph,
            "collection": collection,
            "elements": elements,
            "doc_name": filename,
            "doc_size": size_str,
            "summary_data": summary_data
        }
        GLOBAL_STATE["active_doc_id"] = doc_id
        GLOBAL_STATE["sessions"][doc_id] = str(uuid.uuid4())

        text_count = sum(1 for e in elements if type(e).__name__ == "TextElement")
        table_count = sum(1 for e in elements if type(e).__name__ == "TableElement")
        image_count = sum(1 for e in elements if type(e).__name__ == "ImageElement")

        max_page = 1
        for e in elements:
            if hasattr(e, "page_number") and e.page_number is not None:
                max_page = max(max_page, e.page_number)

        docs_col = get_documents_collection()
        if docs_col is not None:
            try:
                docs_col.insert_one({
                    "_id": doc_id,
                    "name": filename,
                    "size": size_str,
                    "summary": summary_data,
                    "stats": {
                        "nodes": graph.number_of_nodes(),
                        "edges": graph.number_of_edges(),
                        "text": text_count,
                        "tables": table_count,
                        "images": image_count,
                        "max_page": max_page
                    },
                    "uploaded_at": datetime.utcnow()
                })
            except Exception as mongo_e:
                logging.error(f"Failed to save document to MongoDB: {mongo_e}")
                
        UPLOAD_PROGRESS[doc_id]["progress"] = 100
        UPLOAD_PROGRESS[doc_id]["status"] = "completed"
        UPLOAD_PROGRESS[doc_id]["message"] = "Processing complete."

    except Exception as e:
        UPLOAD_PROGRESS[doc_id]["status"] = "error"
        UPLOAD_PROGRESS[doc_id]["message"] = str(e)


@app.post("/api/upload")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    UPLOAD_PROGRESS[doc_id] = {
        "status": "uploading",
        "progress": 0,
        "message": "Saving file..."
    }
    
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ['.pdf', '.docx']:
            ext = '.pdf'
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        size_bytes = os.path.getsize(tmp_path)
        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

        background_tasks.add_task(process_document_task, tmp_path, file.filename, size_str, doc_id)

        return {
            "message": "Upload started",
            "doc_id": doc_id
        }
        
    except Exception as e:
        UPLOAD_PROGRESS[doc_id] = {"status": "error", "progress": 0, "message": str(e)}
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/upload/stream/{doc_id}")
async def upload_stream(doc_id: str):
    async def event_generator():
        last_progress = -1
        while True:
            if doc_id not in UPLOAD_PROGRESS:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Unknown doc_id'})}\n\n"
                break
                
            state = UPLOAD_PROGRESS[doc_id]
            if state["progress"] != last_progress:
                yield f"data: {json.dumps(state)}\n\n"
                last_progress = state["progress"]
                
            if state["status"] in ["completed", "error"]:
                break
            await asyncio.sleep(0.5)
            
    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/api/switch")
def switch_document(request: SwitchRequest):
    if request.doc_id == "global" or request.doc_id in GLOBAL_STATE["documents"]:
        GLOBAL_STATE["active_doc_id"] = request.doc_id
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="Document graph not currently in memory. Please re-upload.")

@app.get("/api/graph")
def get_graph():
    doc_id = GLOBAL_STATE["active_doc_id"]
    if not doc_id:
        return {"nodes": [], "edges": []}
        
    if doc_id == "global":
        graph = GLOBAL_STATE["global_graph"]
    else:
        if doc_id not in GLOBAL_STATE["documents"]:
            return {"nodes": [], "edges": []}
        graph = GLOBAL_STATE["documents"][doc_id]["graph"]
    
    nodes = []
    edges = []

    type_map = {
        "TextElement": "paragraph",
        "TableElement": "table",
        "ImageElement": "figure"
    }

    for node_id, data in graph.nodes(data=True):
        el_type = data.get("element_type", "TextElement")
        frontend_type = type_map.get(el_type, "paragraph")
        
        content_preview = data.get("content", "")

        nodes.append({
            "id": str(node_id),
            "type": frontend_type,
            "label": f"Page {data.get('page_number', '?')} {frontend_type.capitalize()}",
            "page": data.get("page_number", "?"),
            "content": content_preview,
            "status": "normal"
        })

    for u, v, data in graph.edges(data=True):
        # The frontend graph panel expects 'semantic' for dotted orange links
        rel_type = data.get("relation_type", "structural")
        kind = "semantic" if "semantic" in rel_type else "structural"
        
        edges.append({
            "id": f"e{u}-{v}",
            "source": str(u),
            "target": str(v),
            "kind": kind
        })

    return {"nodes": nodes, "edges": edges}

@app.post("/api/chat")
def chat_endpoint(request: QueryRequest):
    from app.retriever import retrieve_context
    from app.qa_generator import generate_answer, decompose_query
    
    doc_id = GLOBAL_STATE["active_doc_id"]
    if not doc_id:
        raise HTTPException(status_code=400, detail="No active document found.")
        
    if doc_id == "global":
        graph = GLOBAL_STATE["global_graph"]
        collection = GLOBAL_STATE["global_collection"]
    else:
        if doc_id not in GLOBAL_STATE["documents"]:
            raise HTTPException(status_code=400, detail="Document not found.")
        doc_state = GLOBAL_STATE["documents"][doc_id]
        graph = doc_state["graph"]
        collection = doc_state["collection"]
    
    try:
        sub_queries = decompose_query(request.query)
        context_parts = []
        for sq in sub_queries:
            ctx = retrieve_context(sq, collection, graph)
            if ctx and ctx not in context_parts:
                context_parts.append(ctx)
                
        context_str = "\n\n".join(context_parts)
        result = generate_answer(request.query, context_str)
        
        citations = []
        cited_ids = result.get("cited_ids", [])
        
        for i, cid in enumerate(cited_ids):
            if graph.has_node(cid):
                node_data = graph.nodes[cid]
                el_type = node_data.get("element_type", "TextElement")
                frontend_type = "paragraph"
                if el_type == "TableElement":
                    frontend_type = "table"
                elif el_type == "ImageElement":
                    frontend_type = "figure"
                
                content = node_data.get("content", "")

                citations.append({
                    "id": f"c{i}",
                    "nodeId": str(cid),
                    "page": node_data.get("page_number", "?"),
                    "type": frontend_type,
                    "content": content
                })

        session_id = GLOBAL_STATE["sessions"].get(doc_id)
        if not session_id:
            session_id = str(uuid.uuid4())
            GLOBAL_STATE["sessions"][doc_id] = session_id

        chat_col = get_chat_history_collection()
        if chat_col is not None:
            try:
                chat_col.insert_many([
                    {
                        "doc_id": doc_id,
                        "session_id": session_id,
                        "role": "user",
                        "content": request.query,
                        "timestamp": datetime.utcnow()
                    },
                    {
                        "doc_id": doc_id,
                        "session_id": session_id,
                        "role": "assistant",
                        "content": result.get("answer", ""),
                        "citations": citations,
                        "timestamp": datetime.utcnow()
                    }
                ])
            except Exception as mongo_err:
                logging.error(f"Failed to save chat to MongoDB: {mongo_err}")

        return {
            "answer": result.get("answer", ""),
            "citations": citations,
            "highlightedNodes": cited_ids
        }
    except Exception as e:
        logging.error(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/status")
def get_status():
    docs_col = get_documents_collection()
    result_docs = []
    seen_ids = set()
    
    if docs_col is not None:
        try:
            docs = list(docs_col.find().sort("uploaded_at", -1))
            if docs:
                for d in docs:
                    doc_id_str = str(d["_id"])
                    if doc_id_str in GLOBAL_STATE["documents"]:
                        status = "indexed"
                        graph = GLOBAL_STATE["documents"][doc_id_str]["graph"]
                        pages = max([data.get("page_number", 1) for _, data in graph.nodes(data=True)] + [1])
                    else:
                        status = "inactive"
                        pages = d.get("stats", {}).get("max_page", d.get("stats", {}).get("text", 0) // 5 + 1)
                    
                    stats = d.get("stats", {})
                    summary_data = d.get("summary", {})
                    result_docs.append({
                        "id": doc_id_str,
                        "name": d.get("name", "Unknown"),
                        "status": status,
                        "pages": pages,
                        "is_active": doc_id_str == GLOBAL_STATE["active_doc_id"],
                        "details": {
                            "size": d.get("size", "Unknown"),
                            "entitiesCount": stats.get("nodes", 0),
                            "relationsCount": stats.get("edges", 0),
                            "summary": summary_data.get("summary", "Document processed."),
                            "highlights": summary_data.get("highlights", []),
                            "entities": summary_data.get("entities", [])
                        }
                    })
                    seen_ids.add(doc_id_str)
        except Exception as e:
            logging.error(f"MongoDB connection failed: {e}")
            
    # Always merge in-memory GLOBAL_STATE documents that aren't in MongoDB yet
    for doc_id, doc_data in GLOBAL_STATE["documents"].items():
        if doc_id not in seen_ids:
            graph = doc_data["graph"]
            summary_data = doc_data.get("summary_data", {})
            pages = max([data.get("page_number", 1) for _, data in graph.nodes(data=True)] + [1])
            
            result_docs.append({
                "id": doc_id,
                "name": doc_data.get("doc_name", "Unknown"),
                "status": "indexed",
                "pages": pages,
                "is_active": doc_id == GLOBAL_STATE["active_doc_id"],
                "details": {
                    "size": doc_data.get("doc_size", "Unknown"),
                    "entitiesCount": graph.number_of_nodes(),
                    "relationsCount": graph.number_of_edges(),
                    "summary": summary_data.get("summary", "Document processed."),
                    "highlights": summary_data.get("highlights", []),
                    "entities": summary_data.get("entities", [])
                }
            })
            seen_ids.add(doc_id)
            
    return {
        "status": "online",
        "active_doc_id": GLOBAL_STATE["active_doc_id"],
        "documents": result_docs
    }

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    docs_col = get_documents_collection()
    if docs_col is not None:
        try:
            docs_col.delete_one({"_id": doc_id})
        except Exception as e:
            logging.error(f"MongoDB error: {e}")
    
    chat_col = get_chat_history_collection()
    if chat_col is not None:
        try:
            chat_col.delete_many({"doc_id": doc_id})
        except Exception as e:
            logging.error(f"MongoDB error: {e}")

    if doc_id in GLOBAL_STATE["documents"]:
        del GLOBAL_STATE["documents"][doc_id]
        
    if GLOBAL_STATE["active_doc_id"] == doc_id:
        GLOBAL_STATE["active_doc_id"] = None
        
    return {"status": "success"}

@app.get("/api/chat/history")
def get_chat_history():
    doc_id = GLOBAL_STATE["active_doc_id"]
    if not doc_id:
        return {"history": []}
        
    chat_col = get_chat_history_collection()
    if chat_col is None:
        return {"history": []}
        
    session_id = GLOBAL_STATE["sessions"].get(doc_id)
    if not session_id:
        return {"history": []}

    try:
        cursor = chat_col.find({"doc_id": doc_id, "session_id": session_id}).sort("timestamp", 1)
        history = []
        for msg in cursor:
            msg["_id"] = str(msg["_id"])
            msg["timestamp"] = msg["timestamp"].isoformat()
            history.append(msg)
            
        return {"history": history}
    except Exception as e:
        logging.error(f"Failed to fetch history from MongoDB: {e}")
        return {"history": []}

@app.get("/api/chat/sessions")
def get_chat_sessions():
    chat_col = get_chat_history_collection()
    if chat_col is None:
        return {"sessions": [], "active_session_id": None}
        
    doc_id = GLOBAL_STATE["active_doc_id"]
    active_session_id = GLOBAL_STATE["sessions"].get(doc_id) if doc_id else None
    
    try:
        pipeline = [
            {"$group": {
                "_id": "$session_id",
                "first_message": {"$min": "$timestamp"},
                "doc_id": {"$first": "$doc_id"}
            }}
        ]
        
        sessions_cursor = chat_col.aggregate(pipeline)
        sessions = []
        docs_col = get_documents_collection()
        
        for s in sessions_cursor:
            session_doc_id = s.get("doc_id")
            doc_name = "Unknown Document"
            
            if session_doc_id == "global":
                doc_name = "Global Knowledge Base"
            elif session_doc_id in GLOBAL_STATE["documents"]:
                doc_name = GLOBAL_STATE["documents"][session_doc_id].get("doc_name", "Unknown Document")
            elif docs_col is not None:
                db_doc = docs_col.find_one({"_id": session_doc_id})
                if db_doc:
                    doc_name = db_doc.get("name", "Unknown Document")
                    
            sessions.append({
                "id": s["_id"],
                "created_at": s["first_message"].isoformat(),
                "doc_id": session_doc_id,
                "doc_name": doc_name
            })
            
        return {
            "sessions": sorted(sessions, key=lambda x: x["created_at"], reverse=True),
            "active_session_id": active_session_id
        }
    except Exception as e:
        logging.error(f"Failed to fetch sessions from MongoDB: {e}")
        return {"sessions": [], "active_session_id": active_session_id}

class SessionSwitchRequest(BaseModel):
    session_id: str
    doc_id: str

@app.post("/api/chat/session/switch")
def switch_session(req: SessionSwitchRequest):
    if req.doc_id:
        GLOBAL_STATE["active_doc_id"] = req.doc_id
    GLOBAL_STATE["sessions"][req.doc_id] = req.session_id
    return {"status": "success", "session_id": req.session_id, "doc_id": req.doc_id}

@app.post("/api/chat/session/new")
def new_chat_session():
    doc_id = GLOBAL_STATE["active_doc_id"]
    if not doc_id:
        raise HTTPException(status_code=400, detail="No active document found.")
        
    session_id = str(uuid.uuid4())
    GLOBAL_STATE["sessions"][doc_id] = session_id
    return {"status": "success", "session_id": session_id}

# Serve React Frontend
# __file__ is backend/app/api.py
# backend/ is os.path.dirname(os.path.dirname(__file__))
# root is os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
frontend_dist = os.path.join(root_dir, "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/{catchall:path}")
    def serve_frontend(catchall: str):
        # Prevent API routes from falling through to the frontend
        if catchall.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
            
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not built yet")
