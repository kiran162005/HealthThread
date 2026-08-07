"""Pulls raw text out of an uploaded report/prescription.

Uses Docling, which handles both native PDFs and scanned images/photos
through one interface (its own bundled OCR backend), so we don't need a
separate Tesseract binary install.
"""
import os
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

import io
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import DocumentStream

_converter = DocumentConverter()  # loads its models on first use, not at import


def extract_text(file_bytes: bytes, filename: str) -> str:
    """filename is only used for its extension, so Docling knows how to
    parse the stream (e.g. 'report.pdf' vs 'report.jpg').
    """
    stream = DocumentStream(name=filename, stream=io.BytesIO(file_bytes))
    result = _converter.convert(stream)
    return result.document.export_to_markdown()