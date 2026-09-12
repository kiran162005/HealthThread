CREATE TABLE baby_milestone_completions (
    id UUID PRIMARY KEY,
    baby_id UUID NOT NULL REFERENCES baby_profiles(id) ON DELETE CASCADE,
    milestone_key VARCHAR NOT NULL,
    completed_at DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (baby_id, milestone_key)
);