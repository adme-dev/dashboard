-- Restricted HR contract vault.
-- Original files remain outside the general AI knowledge base. Only owner-approved,
-- role-relevant extracts may be referenced by role profiles and questionnaires.

CREATE TABLE IF NOT EXISTS hr_contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  file_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64),
  status TEXT NOT NULL DEFAULT 'review_required'
    CHECK (status IN ('uploaded', 'review_required', 'approved', 'superseded', 'retention_hold')),
  effective_from DATE,
  retention_review_at DATE,
  uploaded_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_member_id, version)
);

CREATE INDEX IF NOT EXISTS idx_hr_contract_member_status
  ON hr_contract_documents(team_member_id, status, version DESC);

CREATE TABLE IF NOT EXISTS hr_contract_role_extracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_document_id UUID NOT NULL UNIQUE
    REFERENCES hr_contract_documents(id) ON DELETE CASCADE,
  role_title TEXT,
  department TEXT,
  employment_basis TEXT,
  ordinary_hours TEXT,
  reporting_to TEXT,
  role_purpose TEXT,
  responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  decision_authority JSONB NOT NULL DEFAULT '[]'::jsonb,
  role_exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  omitted_sensitive_fields JSONB NOT NULL DEFAULT
    '["remuneration","banking","tax","health","leave history","protected attributes","signatures"]'::jsonb,
  extraction_method TEXT NOT NULL DEFAULT 'owner_reviewed'
    CHECK (extraction_method IN ('owner_reviewed', 'ai_assisted_owner_reviewed')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_contract_extract_status
  ON hr_contract_role_extracts(status, approved_at DESC);

COMMENT ON TABLE hr_contract_documents IS
  'Owner-only original employment documents; excluded from general AI/RAG search. retention_review_at triggers human legal/need review and is not an automatic deletion date.';
COMMENT ON TABLE hr_contract_role_extracts IS
  'Owner-approved role facts safe for role profiles and questionnaire generation; sensitive contract terms omitted.';
