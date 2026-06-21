"""
ingestion_pipeline.py

Processes a raw PDF or DOCX document and converts it into a list of Pydantic objects
(TextElement, TableElement, ImageElement) using IBM's `docling` library for fast,
high-accuracy document parsing.
"""
import os
import uuid
import logging
from typing import List, Tuple, Any

from docling.document_converter import DocumentConverter
from docling_core.types.doc.document import (
    TextItem,
    SectionHeaderItem,
    ListItem,
    TableItem,
    PictureItem,
)

from app.data_models import (
    BaseDocumentElement,
    TextElement,
    TitleElement,
    TableElement,
    ImageElement
)
from app.model_config import generate_image_description

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _extract_bounding_box(item: Any) -> Tuple[float, float, float, float]:
    """
    Extracts the bounding box from a docling item's provenance data.
    Returns the bounding box as (x0, y0, x1, y1).
    Returns (0.0, 0.0, 0.0, 0.0) if coordinates are not available.
    """
    try:
        if hasattr(item, "prov") and item.prov:
            prov = item.prov[0]  # First provenance entry
            bbox = prov.bbox
            if bbox:
                return float(bbox.l), float(bbox.t), float(bbox.r), float(bbox.b)
    except Exception:
        pass
    return 0.0, 0.0, 0.0, 0.0


def _get_page_number(item: Any) -> int:
    """
    Extracts the page number from a docling item's provenance data.
    Returns 1 if not available.
    """
    try:
        if hasattr(item, "prov") and item.prov:
            return item.prov[0].page_no + 1  # docling uses 0-indexed pages
    except Exception:
        pass
    return 1


def process_document(file_path: str) -> List[BaseDocumentElement]:
    """
    Processes a PDF or DOCX document and extracts Text, Table, and Image elements
    using IBM Docling for fast, high-accuracy parsing.

    Args:
        file_path (str): The path to the PDF or DOCX document.

    Returns:
        List[BaseDocumentElement]: A list of extracted elements as Pydantic objects.
    """
    extracted_elements: List[BaseDocumentElement] = []

    logger.info(f"Starting to process document with Docling: {file_path}")

    # Directory to store extracted images temporarily
    image_output_dir = os.path.join(os.path.dirname(file_path), "extracted_images")
    os.makedirs(image_output_dir, exist_ok=True)

    try:
        converter = DocumentConverter()
        conv_result = converter.convert(file_path)
        doc = conv_result.document
    except Exception as e:
        logger.error(f"Failed to convert document {file_path} with Docling: {e}")
        return []

    for item, level in doc.iterate_items():
        element_uuid = uuid.uuid4()
        page_num = _get_page_number(item)
        bbox = _extract_bounding_box(item)

        try:
            if isinstance(item, TableItem):
                # Export the table to HTML to preserve grid structure for LLM context
                html_format = item.export_to_html()
                # Also get a markdown fallback for raw_content
                raw_text = item.export_to_markdown()
                if not raw_text.strip():
                    raw_text = html_format

                table_element = TableElement(
                    element_id=element_uuid,
                    page_number=page_num,
                    bounding_box=bbox,
                    raw_content=raw_text,
                    grid_format=html_format
                )
                extracted_elements.append(table_element)

            elif isinstance(item, PictureItem):
                semantic_desc = "Description generation failed."

                try:
                    # Try to extract the image from docling and save it
                    pil_image = item.get_image(doc)
                    if pil_image:
                        img_filename = f"img_{element_uuid}.png"
                        img_path = os.path.join(image_output_dir, img_filename)
                        pil_image.save(img_path)

                        # Process image through our VLM from model_config.py
                        semantic_desc = generate_image_description(img_path)
                    else:
                        logger.warning(f"PictureItem found but get_image returned None on page {page_num}.")
                except Exception as e:
                    logger.error(f"Failed to process image on page {page_num}: {e}")

                image_element = ImageElement(
                    element_id=element_uuid,
                    page_number=page_num,
                    bounding_box=bbox,
                    raw_content="[Extracted Image Block]",
                    semantic_description=semantic_desc
                )
                extracted_elements.append(image_element)

            elif isinstance(item, SectionHeaderItem):
                raw_text = item.text if hasattr(item, "text") and item.text else ""
                if not raw_text.strip():
                    continue

                title_element = TitleElement(
                    element_id=element_uuid,
                    page_number=page_num,
                    bounding_box=bbox,
                    raw_content=raw_text
                )
                extracted_elements.append(title_element)

            elif isinstance(item, TextItem):
                # Handles regular text paragraphs, list items, etc.
                raw_text = item.text if hasattr(item, "text") and item.text else ""
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
            item_type = type(item).__name__
            logger.error(f"Error processing element {item_type} on page {page_num}: {e}")
            continue

    logger.info(f"Successfully processed {len(extracted_elements)} elements from {file_path}")
    return extracted_elements
