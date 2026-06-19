import os
# Enable MPS fallback so PyTorch can safely fall back to CPU for unsupported ops
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"

from app.ingestion_pipeline import process_document
from app.graph_builder import build_graph_and_index
from app.retriever import retrieve_context
from app.qa_generator import generate_answer

def run_end_to_end_test(pdf_path: str, test_query: str):
    try:
        print(f"--- Phase 1: Ingesting {pdf_path} ---")
        elements = process_document(pdf_path)
        print(f"Element Breakdown: {[type(e).__name__ for e in elements]}")
        print(f"Success: Extracted {len(elements)} distinct elements.\n")

        print("--- Phase 2: Building Graph & Vector Index ---")
        graph, collection = build_graph_and_index(elements)
        print(f"Success: Graph constructed with {graph.number_of_nodes()} nodes and {graph.number_of_edges()} edges.\n")

        print(f"--- Phase 3: Retrieving Context ---")
        print(f"Query: '{test_query}'")
        context_str = retrieve_context(test_query, collection, graph)
        print(f"Success: Context aggregated and reranked.\n")
        print("--- Raw Context Payload to LLM ---")
        print(context_str)
        print("----------------------------------\n")

        print("--- Phase 4: Generating Answer ---")
        result = generate_answer(test_query, context_str)
        print("Final Output:")
        print(f"Answer: {result['answer']}")
        print(f"Extracted Citations: {result['cited_ids']}")

    except Exception as e:
        print(f"\n[!] Pipeline Execution Failed: {str(e)}")

if __name__ == "__main__":
    # Pointing this to the PDF available in the workspace
    target_pdf = "micro_sample.pdf" 
    
    # Do NOT ask a simple keyword question. Ask a "Cross-element" question 
    # to force the graph walk (e.g., referencing a table value and a paragraph).
    hard_query = "What specific metric in the table is referenced by the paragraph above it, and what does the nearby chart depict?"
    
    run_end_to_end_test(target_pdf, hard_query)
