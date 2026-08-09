"""Finds the most relevant chunks from a patient's own history for a
given query. This is the retrieval step the History Retrieval Agent
calls — cosine similarity search over document_chunks, scoped to one
patient so retrieval never crosses between patients.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.services import embeddings


def retrieve_relevant_chunks(db: Session, patient_id, query: str, top_k: int = 5):
    """Returns up to top_k chunks (dicts with chunk_text, document_id,
    similarity) most relevant to query, most relevant first.

    pgvector's <=> operator is cosine distance (0 = identical,
    2 = opposite) — we order ascending (closest first) and convert to a
    similarity score for readability.
    """
    query_vector = embeddings.embed_query(query)

    rows = db.execute(
        select(
            models.DocumentChunk.chunk_text,
            models.DocumentChunk.document_id,
            models.DocumentChunk.embedding.cosine_distance(query_vector).label("distance"),
        )
        .where(models.DocumentChunk.patient_id == patient_id)
        .order_by("distance")
        .limit(top_k)
    ).all()

    return [
        {
            "chunk_text": row.chunk_text,
            "document_id": row.document_id,
            "similarity": round(1 - row.distance, 3),
        }
        for row in rows
    ]