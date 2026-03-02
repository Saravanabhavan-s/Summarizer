"""
Text extraction utilities for EchoScore.
Supports .txt, .pdf, and .docx transcript files.
"""

from pathlib import Path


def extract_text_from_file(file_path: str) -> str:
    """
    Read textual content from a .txt, .pdf, or .docx file.

    Args:
        file_path: Absolute or relative path to the file.

    Returns:
        Extracted plain-text string.

    Raises:
        ValueError: If the extension is unsupported.
        FileNotFoundError: If the file does not exist.
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = path.suffix.lower()

    if ext == ".txt":
        return _read_txt(path)
    elif ext == ".pdf":
        return _read_pdf(path)
    elif ext == ".docx":
        return _read_docx(path)
    else:
        raise ValueError(f"Unsupported text file extension: {ext}")


# ------------------------------------------------------------------
# Private helpers
# ------------------------------------------------------------------

def _read_txt(path: Path) -> str:
    """Read a plain-text file as UTF-8."""
    return path.read_text(encoding="utf-8")


def _read_pdf(path: Path) -> str:
    """Extract text from a PDF using pypdf."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ImportError(
            "pypdf is required for PDF support. Install it with: pip install pypdf"
        )

    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _read_docx(path: Path) -> str:
    """Extract text from a DOCX using python-docx."""
    try:
        from docx import Document
    except ImportError:
        raise ImportError(
            "python-docx is required for DOCX support. Install it with: pip install python-docx"
        )

    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs).strip()
