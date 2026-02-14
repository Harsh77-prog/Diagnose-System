"""
Extract text from uploaded reports (PDF or plain text).
Images are passed through to the vision API; this module handles PDF/text.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Optional

# Optional: pypdf for PDF
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


def extract_text_from_pdf(data: bytes) -> str:
    if PdfReader is None:
        return "[PDF parsing not available; install pypdf]"
    try:
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
        return "\n\n".join(parts).strip() or "[No text extracted from PDF]"
    except Exception as e:
        return f"[Error extracting PDF: {e}]"


def parse_report_content(
    content_base64: Optional[str] = None,
    content_bytes: Optional[bytes] = None,
    filename: Optional[str] = None,
    mime_type: Optional[str] = None,
) -> str:
    """
    Parse report and return text for the LLM.
    If content is image (e.g. PNG/JPEG), return empty and caller should use vision API with the image.
    """
    if content_bytes is None and content_base64:
        content_bytes = base64.b64decode(content_base64)
    if not content_bytes:
        return ""

    suffix = (Path(filename).suffix if filename else "").lower()
    mt = (mime_type or "").lower()

    if suffix == ".pdf" or "pdf" in mt:
        return extract_text_from_pdf(content_bytes)
    if suffix in (".txt", ".text") or "text/plain" in mt:
        return content_bytes.decode("utf-8", errors="replace")
    # Image types: leave for vision API; no text extraction here
    if suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp") or "image/" in mt:
        return ""
    # Default: try as text
    return content_bytes.decode("utf-8", errors="replace")
