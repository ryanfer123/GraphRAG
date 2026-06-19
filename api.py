import os
import tempfile
import uuid
import logging
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
from database import get_documents_collection, get_chat_history_collection
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
    "doc_id": None,
    "graph": None,
    "collection": None,
    "elements": None,
    "doc_name": None,
    "doc_size": None,
    "summary_data": None
}

class QueryRequest(BaseModel):
    query: str

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

        graph, collection = build_graph_and_index(elements)
        
        # Aggregate text for summarization
        full_text = "\n".join([getattr(e, "text", str(e)) for e in elements if type(e).__name__ == "TextElement"])
        summary_data = generate_document_summary(full_text)
        
        doc_id = str(uuid.uuid4())
        
        GLOBAL_STATE["doc_id"] = doc_id
        GLOBAL_STATE["graph"] = graph
        GLOBAL_STATE["collection"] = collection
        GLOBAL_STATE["elements"] = elements
        GLOBAL_STATE["doc_name"] = file.filename
        GLOBAL_STATE["doc_size"] = size_str
        GLOBAL_STATE["summary_data"] = summary_data

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

@app.get("/api/graph")
def get_graph():
    graph = GLOBAL_STATE["graph"]
    if graph is None:
        return {"nodes": [], "edges": []}
    
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
def chat(req: QueryRequest):
    graph = GLOBAL_STATE["graph"]
    collection = GLOBAL_STATE["collection"]

    if not graph or not collection:
        raise HTTPException(status_code=400, detail="No document processed yet.")

    try:
        context_str = retrieve_context(req.query, collection, graph)
        result = generate_answer(req.query, context_str)
        
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
        if chat_col is not None and GLOBAL_STATE.get("doc_id"):
            chat_col.insert_many([
                {
                    "doc_id": GLOBAL_STATE["doc_id"],
                    "role": "user",
                    "content": req.query,
                    "timestamp": datetime.utcnow()
                },
                {
                    "doc_id": GLOBAL_STATE["doc_id"],
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
                stats = d.get("stats", {})
                summary_data = d.get("summary", {})
                result_docs.append({
                    "id": str(d["_id"]),
                    "name": d.get("name", "Unknown"),
                    "status": "indexed",
                    "pages": 1,
                    "details": {
                        "size": d.get("size", "Unknown"),
                        "entitiesCount": stats.get("nodes", 0),
                        "relationsCount": stats.get("edges", 0),
                        "summary": summary_data.get("summary", "Document processed."),
                        "highlights": summary_data.get("highlights", []),
                        "entities": summary_data.get("entities", [])
                    }
                })
            
            # Re-associate doc_id if memory is wiped
            if GLOBAL_STATE.get("doc_id") is None and len(result_docs) > 0:
                GLOBAL_STATE["doc_id"] = result_docs[0]["id"]
                
            return {"documents": result_docs}

    graph = GLOBAL_STATE.get("graph")
    doc_name = GLOBAL_STATE.get("doc_name")
    
    if not graph or not doc_name:
        return {"documents": []}
        
    nodes = graph.number_of_nodes()
    edges = graph.number_of_edges()
    elements = GLOBAL_STATE.get("elements", [])
    text_count = sum(1 for e in elements if type(e).__name__ == "TextElement")
    table_count = sum(1 for e in elements if type(e).__name__ == "TableElement")
    doc_size = GLOBAL_STATE.get("doc_size", "Unknown")
    summary_data = GLOBAL_STATE.get("summary_data", {})
    
    return {
        "documents": [
            {
                "id": GLOBAL_STATE.get("doc_id", "current_doc"),
                "name": doc_name,
                "status": "indexed",
                "pages": 1,
                "details": {
                    "size": doc_size,
                    "entitiesCount": nodes,
                    "relationsCount": edges,
                    "summary": summary_data.get("summary", f"Processed {text_count} texts"),
                    "highlights": summary_data.get("highlights", []),
                    "entities": summary_data.get("entities", [])
                }
            }
        ]
    }

@app.get("/api/chat/history")
def get_chat_history():
    doc_id = GLOBAL_STATE.get("doc_id")
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
