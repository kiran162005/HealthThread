-- Personal Health Intelligence Platform — core schema
-- PostgreSQL. Run this before starting the app, or let SQLAlchemy
-- create tables from app/models.py during early development.

CREATE TYPE user_role AS ENUM ('patient', 'doctor');
CREATE TYPE permission_status AS ENUM ('active', 'revoked');
CREATE TYPE document_type AS ENUM ('report', 'prescription', 'other');

-- ─────────────────────────────────────────────────────────────
-- Users (patients and doctors share one auth table, split by role)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            user_role NOT NULL,
    -- doctors are mocked/self-registered for this portfolio build;
    -- real deployment would gate this behind identity verification
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Patient-specific profile data (1:1 with users where role='patient')
-- ─────────────────────────────────────────────────────────────
CREATE TABLE patient_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    date_of_birth   DATE,
    sex             TEXT,
    blood_group     TEXT
);

-- Baby profile — optional, linked to a parent patient account
CREATE TABLE baby_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    date_of_birth   DATE NOT NULL,
    sex             TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE baby_growth_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id         UUID NOT NULL REFERENCES baby_profiles(id) ON DELETE CASCADE,
    recorded_at     DATE NOT NULL,
    weight_kg       NUMERIC(5,2),
    height_cm       NUMERIC(5,2),
    head_circ_cm    NUMERIC(5,2),
    notes           TEXT
);

-- ─────────────────────────────────────────────────────────────
-- Documents (uploaded reports/prescriptions).
-- file_ciphertext / iv / auth_tag hold the client-side AES-256-GCM
-- output — the server never sees plaintext. file_url points at the
-- encrypted blob in object storage.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type            document_type NOT NULL,
    file_url            TEXT NOT NULL,       -- pointer to encrypted blob in storage
    iv                  TEXT NOT NULL,       -- base64 AES-GCM IV, generated client-side
    auth_tag            TEXT NOT NULL,       -- base64 AES-GCM auth tag
    original_filename   TEXT,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plain-language explanation + extracted structured data for a document,
-- produced by the OCR/extraction + LLM explanation pipeline.
-- Stored separately from the encrypted original so the reasoning agent
-- can retrieve over it without touching ciphertext.
CREATE TABLE document_extractions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    raw_text            TEXT,                -- OCR/PDF-extracted text
    plain_explanation   TEXT,                -- LLM-generated plain-language explanation
    structured_values   JSONB,               -- e.g. {"hba1c": 6.1, "unit": "%"} for trend model
    embedding_id         TEXT,               -- reference into the vector store (FAISS/pgvector)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Unified timeline — every entry a patient's history is built from
-- (documents, symptom-checker sessions, doctor notes) surfaces here
-- so the frontend renders one chronological feed.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE timeline_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_type      TEXT NOT NULL,      -- 'document' | 'symptom_check' | 'doctor_note' | 'skin_check'
    ref_id          UUID NOT NULL,      -- id of the underlying document/session/note row
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary         TEXT NOT NULL       -- short line shown in the timeline list
);

-- ─────────────────────────────────────────────────────────────
-- Symptom-checker sessions (Triage → History Retrieval → Reasoning agent)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE symptom_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    transcript      JSONB NOT NULL,      -- ordered list of {role, message} turns
    retrieved_context JSONB,             -- doc IDs / chunks the Reasoning Agent used
    summary         TEXT,                -- final agent summary shown to doctor
    confidence      TEXT                 -- e.g. 'low' | 'moderate' | 'high'
);

-- ─────────────────────────────────────────────────────────────
-- Skin check submissions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE skin_checks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url       TEXT NOT NULL,       -- encrypted blob pointer, same pattern as documents
    predicted_label TEXT,
    confidence      NUMERIC(4,3),
    flagged         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Trend/risk predictions (time-series model output over a patient's
-- own structured_values history)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE trend_predictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_name     TEXT NOT NULL,       -- e.g. 'hba1c', 'ldl_cholesterol'
    trend_direction TEXT,                -- 'rising' | 'falling' | 'stable'
    confidence      NUMERIC(4,3),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Sharing: patient grants a doctor access to their timeline
-- ─────────────────────────────────────────────────────────────
CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          permission_status NOT NULL DEFAULT 'active',
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    UNIQUE (patient_id, doctor_id)
);

-- Doctor notes added back onto a patient's record
CREATE TABLE doctor_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- Tamper-evident audit log. Every access/edit event is ECDSA-signed
-- by the acting user's key and hash-chained to the previous entry —
-- prev_hash + this row's canonical content determines entry_hash,
-- so any retroactive edit breaks the chain and is detectable.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL REFERENCES users(id),
    patient_id      UUID NOT NULL REFERENCES users(id),
    action          TEXT NOT NULL,       -- 'view_timeline' | 'view_document' | 'add_note' | 'grant_access' | 'revoke_access'
    resource_id     UUID,                -- id of the document/note/etc affected, if any
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    prev_hash       TEXT NOT NULL,       -- entry_hash of the previous row ('0' * 64 for the first)
    entry_hash      TEXT NOT NULL,       -- SHA-256(prev_hash || canonical(this row's fields))
    signature       TEXT NOT NULL        -- ECDSA (P-256) signature over entry_hash, by actor's key
);

CREATE INDEX idx_documents_patient ON documents(patient_id);
CREATE INDEX idx_timeline_patient ON timeline_entries(patient_id, occurred_at DESC);
CREATE INDEX idx_permissions_doctor ON permissions(doctor_id) WHERE status = 'active';
CREATE INDEX idx_audit_patient ON audit_log(patient_id, occurred_at DESC);