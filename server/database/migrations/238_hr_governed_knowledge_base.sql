-- Governed HR Review Knowledge Base. Structured PostgreSQL is authoritative;
-- vectors are optional HR-only indexes and are never written by these tables.
CREATE TABLE IF NOT EXISTS hr_knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_key TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'business_context', 'role_profile', 'process_profile', 'responsibility_map',
    'policy_standard', 'evidence_definition', 'question_bank', 'blocker_taxonomy',
    'validated_theme', 'published_finding', 'completed_action', 'measured_outcome',
    'solution_playbook', 'source_governance', 'privacy_notice', 'retention_policy', 'limitation'
  )),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'disputed', 'approved', 'superseded', 'archived')),
  owner_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_knowledge_entry_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES hr_knowledge_entries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  content TEXT NOT NULL CHECK (length(btrim(content)) >= 10),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'disputed', 'approved', 'superseded', 'archived')),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  provenance_note TEXT NOT NULL,
  confidentiality TEXT NOT NULL DEFAULT 'restricted_hr'
    CHECK (confidentiality IN ('restricted_hr', 'participant_visible', 'department_aggregate')),
  permitted_uses JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permitted_uses) = 'array'),
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(limitations) = 'array'),
  effective_from DATE NOT NULL,
  review_due_at DATE NOT NULL,
  retention_review_at DATE,
  dispute_note TEXT,
  supersedes_version_id UUID REFERENCES hr_knowledge_entry_versions(id) ON DELETE RESTRICT,
  superseded_by_version_id UUID REFERENCES hr_knowledge_entry_versions(id) ON DELETE RESTRICT,
  general_ai_excluded BOOLEAN NOT NULL DEFAULT TRUE CHECK (general_ai_excluded = TRUE),
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, version),
  CHECK (review_due_at >= effective_from),
  CHECK (retention_review_at IS NULL OR retention_review_at >= effective_from),
  CHECK ((status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status <> 'approved'),
  CHECK ((status = 'disputed' AND length(btrim(dispute_note)) >= 10) OR status <> 'disputed')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_knowledge_one_approved_version
  ON hr_knowledge_entry_versions(entry_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_hr_knowledge_entry_type_status
  ON hr_knowledge_entries(entry_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_knowledge_review_due
  ON hr_knowledge_entry_versions(review_due_at) WHERE status = 'approved';

CREATE OR REPLACE FUNCTION prevent_approved_hr_knowledge_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'approved' AND (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.source_refs IS DISTINCT FROM OLD.source_refs OR
    NEW.provenance_note IS DISTINCT FROM OLD.provenance_note OR
    NEW.confidentiality IS DISTINCT FROM OLD.confidentiality OR
    NEW.permitted_uses IS DISTINCT FROM OLD.permitted_uses OR
    NEW.limitations IS DISTINCT FROM OLD.limitations OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.review_due_at IS DISTINCT FROM OLD.review_due_at OR
    NEW.retention_review_at IS DISTINCT FROM OLD.retention_review_at
  ) THEN
    RAISE EXCEPTION 'Approved HR knowledge is immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_approved_hr_knowledge_mutation ON hr_knowledge_entry_versions;
CREATE TRIGGER trg_prevent_approved_hr_knowledge_mutation
BEFORE UPDATE ON hr_knowledge_entry_versions
FOR EACH ROW EXECUTE FUNCTION prevent_approved_hr_knowledge_mutation();

COMMENT ON TABLE hr_knowledge_entries IS
  'Logical entries in the private HR Review Knowledge Base; excluded from general search and ordinary AI memory.';
COMMENT ON TABLE hr_knowledge_entry_versions IS
  'Source-cited governed HR knowledge. Draft and disputed versions are never established facts; approved versions are immutable.';
