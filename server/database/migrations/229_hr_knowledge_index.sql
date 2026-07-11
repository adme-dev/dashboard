-- Private HR/process knowledge records. Vector IDs are optional search indexes;
-- the relational row remains the source of truth.
CREATE TABLE IF NOT EXISTS hr_knowledge_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type VARCHAR(40) NOT NULL CHECK (source_type IN ('monday_item', 'monday_update', 'sop', 'process_profile')),
  source_id VARCHAR(160) NOT NULL,
  scope_id UUID REFERENCES hr_monday_evidence_scopes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  access_policy VARCHAR(30) NOT NULL DEFAULT 'hr_owner' CHECK (access_policy IN ('hr_owner', 'review_participant', 'department')),
  retention_until DATE,
  vector_id VARCHAR(200),
  indexed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_knowledge_records_scope ON hr_knowledge_records(scope_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_hr_knowledge_records_vector ON hr_knowledge_records(vector_id) WHERE vector_id IS NOT NULL;
