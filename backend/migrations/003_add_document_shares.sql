-- Per-document sharing — separate from the doctor relationship itself.
-- A patient can be connected to a doctor (permissions table) without
-- that doctor seeing anything; documents only become visible once
-- explicitly shared here.
CREATE TABLE document_shares (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    doctor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note        TEXT,          -- optional message from patient accompanying this share
    shared_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, doctor_id)
);

CREATE INDEX idx_document_shares_doctor ON document_shares(doctor_id);
CREATE INDEX idx_document_shares_document ON document_shares(document_id);