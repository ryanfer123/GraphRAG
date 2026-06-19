import os
import tempfile
import uuid
import logging
import hashlib
import secrets
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Backend imports
from ingestion_pipeline import process_document
from graph_builder import build_graph_and_index
from retriever import retrieve_context
from qa_generator import generate_answer, generate_document_summary
from database import get_documents_collection, get_chat_history_collection, get_users_collection
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

# Global State
GLOBAL_STATE = {
    "active_doc_id": None,
    "documents": {}
}

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

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        # Get file size
        size_bytes = os.path.getsize(tmp_path)
        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

        elements = process_document(tmp_path)
        
        # Delete temporary file after processing
        os.unlink(tmp_path)
        
        if not elements:
            raise HTTPException(status_code=400, detail="No elements could be extracted.")

        doc_id = str(uuid.uuid4())
        graph, collection = build_graph_and_index(elements, doc_id)
        
        # Aggregate text for summarization
        full_text = "\n".join([getattr(e, "text", str(e)) for e in elements if type(e).__name__ == "TextElement"])
        summary_data = generate_document_summary(full_text)
        
        GLOBAL_STATE["documents"][doc_id] = {
            "graph": graph,
            "collection": collection,
            "elements": elements,
            "doc_name": file.filename,
            "doc_size": size_str,
            "summary_data": summary_data
        }
        GLOBAL_STATE["active_doc_id"] = doc_id

        text_count = sum(1 for e in elements if type(e).__name__ == "TextElement")
        table_count = sum(1 for e in elements if type(e).__name__ == "TableElement")
        image_count = sum(1 for e in elements if type(e).__name__ == "ImageElement")

        docs_col = get_documents_collection()
        if docs_col is not None:
            docs_col.insert_one({
                "_id": doc_id,
                "name": file.filename,
                "size": size_str,
                "summary": summary_data,
                "stats": {
                    "nodes": graph.number_of_nodes(),
                    "edges": graph.number_of_edges(),
                    "text": text_count,
                    "tables": table_count,
                    "images": image_count
                },
                "uploaded_at": datetime.utcnow()
            })

        return {
            "message": "Upload and processing successful",
            "stats": {
                "nodes": graph.number_of_nodes(),
                "edges": graph.number_of_edges(),
                "text": text_count,
                "tables": table_count,
                "images": image_count
            }
        }
    except Exception as e:
        logging.error(f"Error in upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/switch")
def switch_document(request: SwitchRequest):
    if request.doc_id in GLOBAL_STATE["documents"]:
        GLOBAL_STATE["active_doc_id"] = request.doc_id
        return {"status": "success"}
    else:
        raise HTTPException(status_code=404, detail="Document graph not currently in memory. Please re-upload.")

@app.get("/api/graph")
def get_graph():
    doc_id = GLOBAL_STATE["active_doc_id"]
    if not doc_id or doc_id not in GLOBAL_STATE["documents"]:
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
    doc_id = GLOBAL_STATE["active_doc_id"]
    if not doc_id or doc_id not in GLOBAL_STATE["documents"]:
        raise HTTPException(status_code=400, detail="No active document found.")
        
    doc_state = GLOBAL_STATE["documents"][doc_id]
    graph = doc_state["graph"]
    collection = doc_state["collection"]
    
    try:
        context_str = retrieve_context(request.query, collection, graph)
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

        chat_col = get_chat_history_collection()
        if chat_col is not None:
            chat_col.insert_many([
                {
                    "doc_id": doc_id,
                    "role": "user",
                    "content": request.query,
                    "timestamp": datetime.utcnow()
                },
                {
                    "doc_id": doc_id,
                    "role": "assistant",
                    "content": result.get("answer", ""),
                    "citations": citations,
                    "timestamp": datetime.utcnow()
                }
            ])

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
    if docs_col is not None:
        docs = list(docs_col.find().sort("uploaded_at", -1))
        if docs:
            result_docs = []
            for d in docs:
                if d["_id"] in GLOBAL_STATE["documents"]:
                    status = "indexed"
                else:
                    status = "inactive"
                
                stats = d.get("stats", {})
                summary_data = d.get("summary", {})
                result_docs.append({
                    "id": str(d["_id"]),
                    "name": d.get("name", "Unknown"),
                    "status": status,
                    "pages": d.get("stats", {}).get("text", 0) // 5 + 1,
                    "is_active": d["_id"] == GLOBAL_STATE["active_doc_id"],
                    "details": {
                        "size": d.get("size", "Unknown"),
                        "entitiesCount": stats.get("nodes", 0),
                        "relationsCount": stats.get("edges", 0),
                        "summary": summary_data.get("summary", "Document processed."),
                        "highlights": summary_data.get("highlights", []),
                        "entities": summary_data.get("entities", [])
                    }
                })
            
            return {"documents": result_docs}

    return {"documents": []}

@app.get("/api/chat/history")
def get_chat_history():
    doc_id = GLOBAL_STATE["active_doc_id"]
    if not doc_id:
        return {"history": []}
        
    chat_col = get_chat_history_collection()
    if chat_col is None:
        return {"history": []}
        
    # Find all messages for the current document, sorted by timestamp
    cursor = chat_col.find({"doc_id": doc_id}).sort("timestamp", 1)
    history = []
    for msg in cursor:
        msg["_id"] = str(msg["_id"])
        msg["timestamp"] = msg["timestamp"].isoformat()
        history.append(msg)
        
    return {"history": history}

# Serve React Frontend
frontend_dist = os.path.join(os.path.dirname(__file__), "Mutli-Modal-Context-Aware-RAG", "frontend", "dist")
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
