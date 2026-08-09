"""Turns document text into chunks + embeddings for retrieval.

Uses a local sentence-transformers model (all-MiniLM-L6-v2, 384 dims) —
no external API, no per-call cost. Same "downloads model weights on
first use" pattern as Docling; the model lands in the same Hugging Face
cache folder.
"""
from sentence_transformers import SentenceTransformer

_model = None


def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    """Simple character-based chunking with overlap, so a concept split
    across a chunk boundary still has context on at least one side.
    Good enough for report-length documents; a production system would
    chunk on semantic boundaries (paragraphs, sections) instead.
    """
    text = text.strip()
    if len(text) <= chunk_size:
        return [text] if text else []

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks


def embed_chunks(chunks: list[str]) -> list[list[float]]:
    model = _get_model()
    embeddings = model.encode(chunks, normalize_embeddings=True)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    model = _get_model()
    return model.encode([query], normalize_embeddings=True)[0].tolist()