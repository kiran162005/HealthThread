ALTER TABLE documents ADD COLUMN content_hash TEXT;

-- Partial unique index: allows old rows without a hash (NULL), but
-- prevents the same patient uploading identical file content twice
-- going forward.
CREATE UNIQUE INDEX idx_documents_patient_hash
    ON documents(patient_id, content_hash)
    WHERE content_hash IS NOT NULL;