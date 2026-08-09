-- Enables vector similarity search on Postgres
CREATE EXTENSION IF NOT EXISTS vector;

-- Chunked, embedded text from a patient's documents — the retrieval
-- surface for the RAG symptom-reasoning agent. patient_id is denormalized
-- here (also reachable via document_id -> documents.patient_id) so every
-- retrieval query can filter to one patient's history without a join.
CREATE TABLE document_chunks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    patient_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chunk_index  INT NOT NULL,
    chunk_text   TEXT NOT NULL,
    embedding    vector(384) NOT NULL,  -- 384 dims, matches all-MiniLM-L6-v2
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_chunks_patient ON document_chunks(patient_id);