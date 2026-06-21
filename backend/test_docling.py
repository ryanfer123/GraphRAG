import sys
from docling.document_converter import DocumentConverter

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_docling.py <pdf_path>")
        return
    converter = DocumentConverter()
    result = converter.convert(sys.argv[1])
    for item, level in result.document.iterate_items():
        if hasattr(item, "prov") and item.prov:
            print(f"Text: {item.text[:20] if hasattr(item, 'text') else 'N/A'}, Page: {item.prov[0].page_no}")
        else:
            print(f"Text: {item.text[:20] if hasattr(item, 'text') else 'N/A'}, Page: None")

if __name__ == "__main__":
    main()
