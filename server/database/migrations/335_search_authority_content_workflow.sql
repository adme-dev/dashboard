-- Governed, source-backed Search Authority content workflow.

BEGIN;

CREATE TABLE IF NOT EXISTS search_authority_content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  opportunity_id UUID REFERENCES search_authority_opportunities(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 160),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  topic TEXT NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'published', 'archived')),
  current_version_id UUID,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, slug),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, site_id)
    REFERENCES search_authority_sites(client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_authority_source_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL,
  interviewee_name TEXT NOT NULL CHECK (char_length(interviewee_name) BETWEEN 1 AND 200),
  interviewee_role TEXT NOT NULL CHECK (char_length(interviewee_role) BETWEEN 1 AND 200),
  occurred_at TIMESTAMPTZ NOT NULL,
  source_summary TEXT NOT NULL CHECK (char_length(source_summary) BETWEEN 10 AND 10000),
  consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, asset_id)
    REFERENCES search_authority_content_assets(client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_authority_content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  body_markdown TEXT NOT NULL CHECK (char_length(body_markdown) BETWEEN 20 AND 100000),
  excerpt TEXT NOT NULL CHECK (char_length(excerpt) BETWEEN 10 AND 1000),
  schema_type TEXT NOT NULL CHECK (schema_type IN ('Article', 'FAQPage')),
  source_interview_ids UUID[] NOT NULL CHECK (cardinality(source_interview_ids) >= 1),
  source_version_id UUID REFERENCES search_authority_content_versions(id) ON DELETE RESTRICT,
  ai_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, version_number),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, asset_id)
    REFERENCES search_authority_content_assets(client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(ai_metadata) = 'object'),
  CHECK (octet_length(ai_metadata::text) <= 8192)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'search_authority_content_assets_current_version_fk'
  ) THEN
    ALTER TABLE search_authority_content_assets
      ADD CONSTRAINT search_authority_content_assets_current_version_fk
      FOREIGN KEY (client_id, current_version_id)
      REFERENCES search_authority_content_versions(client_id, id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS search_authority_version_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  version_id UUID NOT NULL,
  claim TEXT NOT NULL CHECK (char_length(claim) BETWEEN 5 AND 2000),
  source_type TEXT NOT NULL CHECK (source_type IN ('sales_interview', 'manufacturer', 'provider_evidence')),
  source_reference TEXT NOT NULL CHECK (char_length(source_reference) BETWEEN 5 AND 2000),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, version_id)
    REFERENCES search_authority_content_versions(client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_authority_approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL,
  version_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  rationale TEXT NOT NULL CHECK (char_length(rationale) BETWEEN 5 AND 2000),
  decided_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, asset_id) REFERENCES search_authority_content_assets(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, version_id) REFERENCES search_authority_content_versions(client_id, id) ON DELETE RESTRICT,
  UNIQUE (version_id, decision)
);

CREATE TABLE IF NOT EXISTS search_authority_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL,
  version_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rolled_back', 'failed')),
  public_url TEXT CHECK (public_url IS NULL OR char_length(public_url) <= 4096),
  manifest_version TEXT CHECK (manifest_version IS NULL OR char_length(manifest_version) <= 200),
  published_by UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, asset_id) REFERENCES search_authority_content_assets(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, version_id) REFERENCES search_authority_content_versions(client_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS search_authority_content_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL,
  version_id UUID,
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 120),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, asset_id) REFERENCES search_authority_content_assets(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, version_id) REFERENCES search_authority_content_versions(client_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(details) = 'object'),
  CHECK (octet_length(details::text) <= 8192)
);

CREATE OR REPLACE FUNCTION prevent_search_authority_version_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Search Authority content versions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_search_authority_versions_immutable ON search_authority_content_versions;
CREATE TRIGGER trg_search_authority_versions_immutable
  BEFORE UPDATE OR DELETE ON search_authority_content_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_search_authority_version_mutation();

CREATE INDEX IF NOT EXISTS idx_search_authority_content_assets_queue
  ON search_authority_content_assets (client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_authority_content_audit
  ON search_authority_content_audit_events (client_id, asset_id, created_at DESC);

COMMIT;
