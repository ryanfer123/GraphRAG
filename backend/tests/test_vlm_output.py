from app.model_config import generate_image_description
from unstructured.partition.pdf import partition_pdf
import os

pdf_path = "micro_sample.pdf"
print("Extracting elements...")
elements = partition_pdf(
    filename=pdf_path,
    strategy="hi_res",
    extract_images_in_pdf=True,
    extract_image_block_types=["Image", "Table"],
    extract_image_block_output_dir="test_extracted_images"
)

images = [el for el in elements if "Image" in type(el).__name__]
print(f"Found {len(images)} images.")

for img in images:
    if hasattr(img.metadata, "image_path") and img.metadata.image_path:
        print(f"\nProcessing {img.metadata.image_path}...")
        desc = generate_image_description(img.metadata.image_path)
        print(f"Generated Description:\n{desc}")
