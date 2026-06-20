"""
retriever.py

Implements a two-tiered retrieval, graph-expansion, and reranking pipeline for the 
Graph-Augmented RAG system.
"""

import logging
from typing import Any, List, Dict, Optional
import networkx as nx
from sentence_transformers import CrossEncoder

# Included as requested by constraints
from app.data_models import BaseDocumentElement, TextElement, TableElement, ImageElement 
from app.model_config import get_embedding_model

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Global variable to cache the initialized reranker model for efficient lazy loading
_reranker_model: Optional[CrossEncoder] = None


def get_reranker_model() -> CrossEncoder:
    """
    Initializes and returns the CrossEncoder reranking model.
    Optimized for CPU execution. Uses lazy loading to avoid redundant initializations.

    Returns:
        CrossEncoder: The loaded reranker model.
    """
    global _reranker_model
    if _reranker_model is None:
        # Instantiate a lightweight cross-encoder optimized for CPU
        _reranker_model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2', device='cpu')
    return _reranker_model


def retrieve_context(query: str, collection: Any, graph: nx.DiGraph, doc_id: str = None, top_k: int = 6) -> str:
    """
    Executes a vector search, expands context via a graph walk, reranks the 
    candidates using a cross-encoder, and returns a formatted context string.

    Args:
        query (str): The user's natural language question.
        collection (Any): The initialized ChromaDB collection.
        graph (nx.DiGraph): The populated NetworkX knowledge graph.
        doc_id (str): Optional document ID to filter the search.
        top_k (int): The number of top semantic neighbors to retrieve initially.

    Returns:
        str: A formatted string compiling the top 5 reranked pieces of context.
    """
    logger.info(f"Starting retrieval for query: '{query}'")

    # ==========================================
    # Step 1: Vector Search
    # ==========================================
    embedding_model = get_embedding_model()
    
    # Ensure embedding is processed as a float list for ChromaDB
    raw_query_emb = embedding_model.encode([query])[0]
    if hasattr(raw_query_emb, "numpy"):
        raw_query_emb = raw_query_emb.numpy()
    query_embedding = raw_query_emb.tolist()

    try:
        query_kwargs = {
            "query_embeddings": [query_embedding],
            "n_results": top_k
        }
        
        if doc_id and doc_id != "global":
            query_kwargs["where"] = {"doc_id": doc_id}
            
        results = collection.query(**query_kwargs)
        # Results are wrapped in a list because we submitted a single query
        seed_ids = results.get("ids", [[]])[0]
    except Exception as e:
        logger.error(f"Failed to query ChromaDB collection: {e}")
        return ""

    if not seed_ids:
        logger.warning("No seed IDs returned from the vector search.")
        return ""

    # ==========================================
    # Step 2: Graph Walk (2-Hop Expansion)
    # ==========================================
    aggregated_ids = set(seed_ids)
    
    # Perform a 2-hop breadth-first expansion from each seed node.
    # This ensures that if vector search returns a text node describing a table,
    # we can reach the actual table data node (text -> structural -> table).
    frontier = set(seed_ids)
    for hop in range(2):
        next_frontier = set()
        for n_id in frontier:
            try:
                if graph.has_node(n_id):
                    preds = set(graph.predecessors(n_id))
                    succs = set(graph.successors(n_id))
                    neighbors = preds | succs
                    new_nodes = neighbors - aggregated_ids
                    next_frontier.update(new_nodes)
                    aggregated_ids.update(neighbors)
                else:
                    if hop == 0:
                        logger.warning(f"Retrieved seed ID {n_id} is missing from the Knowledge Graph.")
            except Exception as e:
                logger.error(f"Error accessing neighbors for node {n_id} in Graph Walk (hop {hop+1}): {e}")
        frontier = next_frontier

    # ==========================================
    # Step 3: Cross-Encoder Reranking
    # ==========================================
    candidates_data: List[Dict[str, Any]] = []
    
    # Retrieve contents for all aggregated nodes directly from node attributes
    for n_id in aggregated_ids:
        try:
            if graph.has_node(n_id):
                node_data = graph.nodes[n_id]
                content = node_data.get("content", "")
                if not content:
                    continue
                
                candidates_data.append({
                    "id": n_id,
                    "content": content,
                    "type": node_data.get("element_type", "Unknown"),
                    "page": node_data.get("page_number", "Unknown"),
                    "score": 0.0 # Placeholder for reranking score
                })
        except Exception as e:
            logger.error(f"Error retrieving node {n_id} attributes: {e}")

    if not candidates_data:
        logger.warning("No valid candidate content retrieved from the graph.")
        return ""

    # Batch score the retrieved text blocks against the user's query
    try:
        reranker = get_reranker_model()
        query_doc_pairs = [(query, cand["content"]) for cand in candidates_data]
        scores = reranker.predict(query_doc_pairs)
        
        for i, score in enumerate(scores):
            candidates_data[i]["score"] = float(score)
            
    except Exception as e:
        logger.error(f"Error during cross-encoder reranking process: {e}")
        return ""

    # Filter to top 8 highest-scoring elements while ensuring type diversity
    candidates_data.sort(key=lambda x: x["score"], reverse=True)
    
    top_candidates = []
    seen_types = set()
    
    # Pass 1: Ensure at least one of each available type (Text, Table, Image) is included
    for cand in candidates_data:
        if cand["type"] not in seen_types:
            top_candidates.append(cand)
            seen_types.add(cand["type"])
            
    # Pass 2: Fill remaining slots with the highest scoring elements
    for cand in candidates_data:
        if len(top_candidates) >= 8:
            break
        if cand not in top_candidates:
            top_candidates.append(cand)
            
    # Re-sort by score for the final payload
    top_candidates.sort(key=lambda x: x["score"], reverse=True)

    # ==========================================
    # Step 4: Formatting
    # ==========================================
    formatted_context = ""
    for cand in top_candidates:
        formatted_context += f"[ID: {cand['id']} | Type: {cand['type']} | Page: {cand['page']}]\n{cand['content']}\n\n"

    return formatted_context
