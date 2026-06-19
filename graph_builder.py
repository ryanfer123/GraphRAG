"""
graph_builder.py

Builds the Knowledge Graph and Vector Storage layer for the Graph-Augmented RAG system.
Uses ChromaDB for vector retrieval and NetworkX for the relationship graph.
"""
import os
from typing import List, Tuple, Any
import numpy as np
import networkx as nx
import chromadb

from data_models import (
    BaseDocumentElement,
    TextElement,
    TableElement,
    ImageElement,
    RelationType
)
from model_config import get_embedding_model


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """
    Computes cosine similarity between two 1D numpy arrays.
    """
    dot_product = np.dot(vec1, vec2)
    norm_a = np.linalg.norm(vec1)
    norm_b = np.linalg.norm(vec2)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
        
    return float(dot_product / (norm_a * norm_b))


def build_graph_and_index(elements: List[BaseDocumentElement], doc_id: str, graph: nx.DiGraph, collection: Any) -> Tuple[nx.DiGraph, Any]:
    """
    Constructs a semantic and structural Knowledge Graph from document elements
    and indexes their embeddings in ChromaDB.
    
    Args:
        elements (List[BaseDocumentElement]): A list of extracted document elements.
        doc_id (str): The unique identifier for the document.
        graph (nx.DiGraph): The global NetworkX DiGraph.
        collection (Any): The global ChromaDB collection.
        
    Returns:
        Tuple[nx.DiGraph, Any]: The updated NetworkX DiGraph and ChromaDB collection.
    """
    # Gracefully handle an empty list
    if not elements:
        return graph, collection
        
    # Prepare data arrays for ChromaDB batch upsert
    ids = []
    documents = []
    embeddings = []
    metadatas = []
    
    # Local storage for embeddings to efficiently build semantic edges later
    element_embeddings = []
    
    # Initialize the embedding model specifically optimized for CPU
    embedding_model = get_embedding_model()
    
    # Extract the correct content string to embed per element type
    contents_to_embed = []
    for el in elements:
        if isinstance(el, TableElement):
            contents_to_embed.append(el.grid_format)
        elif isinstance(el, ImageElement):
            contents_to_embed.append(el.semantic_description)
        else:
            # Fallback for TextElement and generic BaseDocumentElement
            contents_to_embed.append(el.raw_content)
            
    # Batch encode all contents into vectors
    # SentenceTransformers encode returns a numpy array or list of numpy arrays
    raw_embeddings = embedding_model.encode(contents_to_embed)
    
    # Process each element to populate the NetworkX nodes and ChromaDB data
    for i, el in enumerate(elements):
        el_type = type(el).__name__
        content = contents_to_embed[i]
        emb = raw_embeddings[i]
        
        # Normalize to numpy array for our cosine sim function if necessary
        if hasattr(emb, "numpy"):
            emb = emb.numpy()
            
        element_embeddings.append(emb)
        
        # 2a. Add Node to NetworkX Graph
        graph.add_node(
            str(el.element_id),
            doc_id=doc_id,
            element_type=el_type,
            content=content,
            page_number=getattr(el, "page_number", 1)
        )
        
        # 2b. Append data to ChromaDB lists
        ids.append(str(el.element_id))
        documents.append(content)
        # ChromaDB expects standard python lists of floats for embeddings
        embeddings.append(emb.tolist())
        metadatas.append({
            "doc_id": doc_id,
            "element_type": el_type,
            "page_number": getattr(el, "page_number", 1)
        })
        
    # Upsert all embedded documents to ChromaDB in a single batch
    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas
    )
    
    # 3. Pass 1: Structural Edges (Preserving Reading Order)
    for i in range(len(elements) - 1):
        source_id = str(elements[i].element_id)
        target_id = str(elements[i+1].element_id)
        
        graph.add_edge(
            source_id,
            target_id,
            relation_type=RelationType.STRUCTURAL.value
        )
        
    # 4. Pass 2: Semantic Edges
    # Compare each Table/Image embedding against Text embeddings within a +/- 10 element window
    window_size = 10
    similarity_threshold = 0.40
    
    for i, source_el in enumerate(elements):
        if isinstance(source_el, (TableElement, ImageElement)):
            source_id = str(source_el.element_id)
            source_emb = element_embeddings[i]
            
            # Define window boundary indices safely
            start_idx = max(0, i - window_size)
            end_idx = min(len(elements), i + window_size + 1)
            
            for j in range(start_idx, end_idx):
                if i == j:
                    continue  # Do not compare against itself
                    
                target_el = elements[j]
                
                # We only want to draw semantic edges between Tables/Images and textual narrative
                if isinstance(target_el, TextElement):
                    target_id = str(target_el.element_id)
                    target_emb = element_embeddings[j]
                    
                    # Compute cosine similarity
                    sim = cosine_similarity(source_emb, target_emb)
                    print(f"Calculated similarity between {type(source_el).__name__} and text: {sim:.2f}")
                    
                    if sim > similarity_threshold:
                        graph.add_edge(
                            source_id,
                            target_id,
                            relation_type=RelationType.SEMANTIC_SUPPORT.value,
                            similarity_score=float(sim)
                        )

    # 5. Pass 3: Cross-Reference Edges
    # Scan text nodes for explicit mentions of "Table N" or "Figure N" / "Fig. N"
    # and wire them directly to the Nth table or image node in document order.
    import re
    table_pattern = re.compile(r'\bTable\s+(\d+)\b', re.IGNORECASE)
    figure_pattern = re.compile(r'\b(?:Figure|Fig\.?)\s+(\d+)\b', re.IGNORECASE)

    # Build ordered lists of tables and images for ordinal lookup
    table_nodes = [(i, el) for i, el in enumerate(elements) if isinstance(el, TableElement)]
    image_nodes = [(i, el) for i, el in enumerate(elements) if isinstance(el, ImageElement)]

    for i, el in enumerate(elements):
        if isinstance(el, TextElement):
            text_content = el.raw_content
            source_id = str(el.element_id)

            # Check for "Table N" mentions
            for match in table_pattern.finditer(text_content):
                table_num = int(match.group(1))
                if 1 <= table_num <= len(table_nodes):
                    target_idx, target_el = table_nodes[table_num - 1]
                    target_id = str(target_el.element_id)
                    if not graph.has_edge(source_id, target_id):
                        graph.add_edge(
                            source_id,
                            target_id,
                            relation_type=RelationType.CROSS_REFERENCE.value,
                            reference_label=f"Table {table_num}"
                        )

            # Check for "Figure N" / "Fig. N" mentions
            for match in figure_pattern.finditer(text_content):
                fig_num = int(match.group(1))
                if 1 <= fig_num <= len(image_nodes):
                    target_idx, target_el = image_nodes[fig_num - 1]
                    target_id = str(target_el.element_id)
                    if not graph.has_edge(source_id, target_id):
                        graph.add_edge(
                            source_id,
                            target_id,
                            relation_type=RelationType.CROSS_REFERENCE.value,
                            reference_label=f"Figure {fig_num}"
                        )

    return graph, collection
