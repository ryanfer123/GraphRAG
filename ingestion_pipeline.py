"""
ingestion_pipeline.py

Processes a raw PDF or DOCX document and converts it into a list of Pydantic objects
(TextElement, TableElement, ImageElement) using the `unstructured` library.
"""
import os
import uuid
import logging
from typing import List, Tuple, Any

from unstructured.partition.auto import partition

from data_models import (
    BaseDocumentElement,
    TextElement,
    TableElement,
    ImageElement
)
from model_config import generate_image_description

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _extract_bounding_box(element: Any) -> Tuple[float, float, float, float]:
    """
    Extracts the bounding box from an unstructured element.
    Returns the bounding box as (x0, y0, x1, y1). 
    Returns (0.0, 0.0, 0.0, 0.0) if coordinates are not available.
    """
    if hasattr(element, "metadata") and element.metadata.coordinates:
        coords = element.metadata.coordinates.points
        if coords and len(coords) >= 4:
            # coords is typically a list of tuples like ((x_top_left, y_top_left), ...)
            xs = [p[0] for p in coords]
            ys = [p[1] for p in coords]
            return float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))
    return 0.0, 0.0, 0.0, 0.0


def process_document(file_path: str) -> List[BaseDocumentElement]:
    """
    Processes a PDF or DOCX document and extracts Text, Table, and Image elements.
    
    Args:
        file_path (str): The path to the PDF or DOCX document.
        
    Returns:
        List[BaseDocumentElement]: A list of extracted elements as Pydantic objects.
    """
    extracted_elements: List[BaseDocumentElement] = []
    
    logger.info(f"Starting to process document: {file_path}")
    
    # Directory to store extracted images temporarily
    image_output_dir = os.path.join(os.path.dirname(file_path), "extracted_images")
    os.makedirs(image_output_dir, exist_ok=True)
    
    try:
        # Partition the document using unstructured with high-res strategy
        kwargs = {
            "filename": file_path,
            "extract_image_block_types": ["Image"],
            "extract_image_block_output_dir": image_output_dir,
            "infer_table_structure": True,
            "strategy": "hi_res"
        }
        
        # Only pass PDF-specific args if it's actually a PDF
        if file_path.lower().endswith(".pdf"):
            kwargs["extract_images_in_pdf"] = True
            
        elements = partition(**kwargs)
    except Exception as e:
        logger.error(f"Failed to partition document {file_path}: {e}")
        return []

    for el in elements:
        element_type = type(el).__name__
        
        # Extract common fields
        page_num = 1
        if hasattr(el, "metadata") and el.metadata.page_number:
            page_num = el.metadata.page_number
            
        bbox = _extract_bounding_box(el)
        element_uuid = uuid.uuid4()
        raw_text = str(el)

        try:
            if element_type == "Table":
                # Extract HTML representation if available, otherwise fallback to raw text
                html_format = raw_text
                if hasattr(el, "metadata") and el.metadata.text_as_html:
                    html_format = el.metadata.text_as_html
                
                table_element = TableElement(
                    element_id=element_uuid,
                    page_number=page_num,
                    bounding_box=bbox,
                    raw_content=raw_text,
                    grid_format=html_format
                )
                extracted_elements.append(table_element)
                
            elif element_type == "Image":
                semantic_desc = "Description generation failed."
                
                if hasattr(el, "metadata") and el.metadata.image_path:
                    img_path = el.metadata.image_path
                    try:
                        # Process image through our VLM from model_config.py
                        semantic_desc = generate_image_description(img_path)
                    except Exception as e:
                        logger.error(f"Failed to generate description for image at {img_path}: {e}")
                else:
                    logger.warning(f"Image element found without an extracted image path on page {page_num}.")
                
                # We provide a placeholder for raw_content since Images might not have raw string data
                image_content = raw_text if raw_text.strip() else "[Extracted Image Block]"
                
                image_element = ImageElement(
                    element_id=element_uuid,
                    page_number=page_num,
                    bounding_box=bbox,
                    raw_content=image_content,
                    semantic_description=semantic_desc
                )
                extracted_elements.append(image_element)
                
            else:
                # All other textual elements (Title, NarrativeText, ListItem, etc.)
                # We skip empty elements to avoid noise
                if not raw_text.strip():
                    continue
                    
                text_element = TextElement(
                    element_id=element_uuid,
                    page_number=page_num,
                    bounding_box=bbox,
                    raw_content=raw_text
                )
                extracted_elements.append(text_element)
                
        except Exception as e:
            # Gracefully handle exception for individual elements
            logger.error(f"Error processing element {element_type} on page {page_num}: {e}")
            continue

    logger.info(f"Successfully processed {len(extracted_elements)} elements from {file_path}")
    return extracted_elements
