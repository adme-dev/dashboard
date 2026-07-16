-- 251_social_content_governance.sql
-- XeroFlow-owned social packages and governed client evidence.
-- Monday/Slack are provenance-tagged transition inputs, never runtime sources of truth.

CREATE TABLE IF NOT EXISTS social_content_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_content_packages_active_name
  ON social_content_packages (LOWER(name)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS social_content_package_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES social_content_packages(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'retired')),
  profile_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  commercial_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_id, version)
);

CREATE INDEX IF NOT EXISTS idx_social_content_package_versions_status
  ON social_content_package_versions (package_id, status, version DESC);

CREATE OR REPLACE FUNCTION prevent_published_social_package_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published social content package versions are immutable; create a new version';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_published_social_package_version_mutation
  ON social_content_package_versions;
CREATE TRIGGER trg_prevent_published_social_package_version_mutation
BEFORE UPDATE OR DELETE ON social_content_package_versions
FOR EACH ROW EXECUTE FUNCTION prevent_published_social_package_version_mutation();

CREATE TABLE IF NOT EXISTS social_content_package_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  package_version_id UUID NOT NULL REFERENCES social_content_package_versions(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  rate_card_item_id UUID REFERENCES rate_card_items(id) ON DELETE SET NULL,
  budget_allocation_id UUID REFERENCES job_budget_allocations(id) ON DELETE SET NULL,
  profile_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  commercial_scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  assigned_by TEXT,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_content_package_one_active_client
  ON social_content_package_assignments (client_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_social_content_package_assignment_budget
  ON social_content_package_assignments (budget_allocation_id) WHERE budget_allocation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_operational_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('brief', 'decision', 'plan', 'discussion', 'performance')),
  source_system TEXT NOT NULL CHECK (source_system IN ('xeroflow', 'monday', 'slack', 'manual', 'import')),
  source_id TEXT,
  source_url TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  occurred_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'superseded')),
  created_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_operational_evidence_source
  ON client_operational_evidence (client_id, source_system, source_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_operational_evidence_canonical
  ON client_operational_evidence (client_id, review_status, occurred_at DESC, created_at DESC);

COMMENT ON TABLE client_operational_evidence IS
  'Provenance-tagged agency evidence. Only reviewed approved rows are canonical inputs to client recommendations.';
COMMENT ON COLUMN client_operational_evidence.content IS
  'Untrusted source material. Imported discussions must be reviewed inside XeroFlow before becoming approved guidance.';
