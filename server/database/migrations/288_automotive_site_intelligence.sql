-- 288_automotive_site_intelligence.sql
-- Governed public-site indexing and automotive change intelligence.

BEGIN;

CREATE TABLE IF NOT EXISTS site_intelligence_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  lane TEXT NOT NULL CHECK (lane IN ('owned', 'competitor')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  origin TEXT NOT NULL CHECK (char_length(origin) BETWEEN 1 AND 2048),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  discovery_mode TEXT NOT NULL DEFAULT 'sitemaps'
    CHECK (discovery_mode IN ('all', 'sitemaps', 'links')),
  include_patterns TEXT[] NOT NULL DEFAULT '{}',
  exclude_patterns TEXT[] NOT NULL DEFAULT '{}',
  include_subdomains BOOLEAN NOT NULL DEFAULT FALSE,
  render_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (render_mode IN ('auto', 'static', 'browser')),
  page_limit INTEGER NOT NULL CHECK (page_limit BETWEEN 1 AND 200),
  crawl_depth INTEGER NOT NULL CHECK (crawl_depth BETWEEN 0 AND 5),
  frequency TEXT NOT NULL DEFAULT 'daily'
    CHECK (frequency IN ('daily', 'weekly', 'manual')),
  crawl_purposes TEXT[] NOT NULL DEFAULT ARRAY['search']::TEXT[],
  ai_input_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 365),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  latest_run_status TEXT CHECK (latest_run_status IS NULL OR latest_run_status IN (
    'queued', 'running', 'completed', 'partial', 'blocked', 'failed', 'cancelled'
  )),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, origin, lane),
  UNIQUE (client_id, id),
  CHECK (origin ~ '^https?://[^/]+$'),
  CHECK (cardinality(crawl_purposes) BETWEEN 1 AND 2),
  CHECK (crawl_purposes <@ ARRAY['search', 'ai-input']::TEXT[]),
  CHECK ('search' = ANY(crawl_purposes)),
  CHECK (NOT ('ai-train' = ANY(crawl_purposes))),
  CHECK (ai_input_allowed = FALSE OR 'ai-input' = ANY(crawl_purposes)),
  CHECK ((approved_at IS NULL) = (approved_by IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_domains_client_status
  ON site_intelligence_domains (client_id, status, lane, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_intelligence_domains_due
  ON site_intelligence_domains (next_run_at, client_id)
  WHERE status = 'active' AND frequency <> 'manual';

CREATE TABLE IF NOT EXISTS site_intelligence_crawl_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'schedule', 'retry')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'completed', 'partial', 'blocked', 'failed', 'cancelled'
  )),
  workflow_instance_id TEXT UNIQUE CHECK (
    workflow_instance_id IS NULL OR char_length(workflow_instance_id) BETWEEN 1 AND 200
  ),
  cloudflare_job_id TEXT UNIQUE CHECK (
    cloudflare_job_id IS NULL OR char_length(cloudflare_job_id) BETWEEN 1 AND 200
  ),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_pages INTEGER NOT NULL DEFAULT 0 CHECK (total_pages >= 0),
  completed_pages INTEGER NOT NULL DEFAULT 0 CHECK (completed_pages >= 0),
  changed_pages INTEGER NOT NULL DEFAULT 0 CHECK (changed_pages >= 0),
  disallowed_pages INTEGER NOT NULL DEFAULT 0 CHECK (disallowed_pages >= 0),
  errored_pages INTEGER NOT NULL DEFAULT 0 CHECK (errored_pages >= 0),
  browser_seconds NUMERIC(14, 3) CHECK (browser_seconds IS NULL OR browser_seconds >= 0),
  error_category TEXT CHECK (error_category IS NULL OR char_length(error_category) <= 120),
  error_summary TEXT CHECK (error_summary IS NULL OR char_length(error_summary) <= 1000),
  requested_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, domain_id)
    REFERENCES site_intelligence_domains(client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(settings) = 'object'),
  CHECK (completed_at IS NULL OR completed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_runs_domain_status
  ON site_intelligence_crawl_runs (client_id, domain_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_intelligence_runs_active_domain
  ON site_intelligence_crawl_runs (domain_id)
  WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS site_intelligence_ingest_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  batch_key TEXT NOT NULL CHECK (char_length(batch_key) BETWEEN 1 AND 300),
  record_count INTEGER NOT NULL CHECK (record_count BETWEEN 0 AND 100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, batch_key),
  FOREIGN KEY (client_id, run_id)
    REFERENCES site_intelligence_crawl_runs(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_batches_run
  ON site_intelligence_ingest_batches (run_id, received_at DESC);

CREATE TABLE IF NOT EXISTS site_intelligence_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL,
  canonical_url TEXT NOT NULL CHECK (char_length(canonical_url) BETWEEN 1 AND 4096),
  source_url TEXT NOT NULL CHECK (char_length(source_url) BETWEEN 1 AND 4096),
  status TEXT NOT NULL CHECK (status IN (
    'completed', 'disallowed', 'skipped', 'errored', 'cancelled'
  )),
  http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  title TEXT CHECK (title IS NULL OR char_length(title) <= 1000),
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  r2_object_key TEXT CHECK (r2_object_key IS NULL OR char_length(r2_object_key) <= 1024),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_enrichment JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_version TEXT NOT NULL DEFAULT 'automotive-deterministic-v1'
    CHECK (char_length(extraction_version) BETWEEN 1 AND 100),
  vector_id TEXT CHECK (vector_id IS NULL OR char_length(vector_id) <= 200),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (domain_id, canonical_url),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, domain_id)
    REFERENCES site_intelligence_domains(client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (jsonb_typeof(facts) = 'object'),
  CHECK (jsonb_typeof(ai_enrichment) = 'object'),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (last_changed_at IS NULL OR last_changed_at >= first_seen_at)
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_pages_client_type
  ON site_intelligence_pages (client_id, ((facts->>'pageType')), last_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_intelligence_pages_domain_seen
  ON site_intelligence_pages (domain_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_intelligence_pages_vector
  ON site_intelligence_pages (vector_id)
  WHERE vector_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_intelligence_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL,
  page_id UUID NOT NULL,
  run_id UUID NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('owned', 'competitor')),
  change_type TEXT NOT NULL CHECK (char_length(change_type) BETWEEN 1 AND 120),
  previous_hash TEXT CHECK (previous_hash IS NULL OR previous_hash ~ '^[a-f0-9]{64}$'),
  current_hash TEXT NOT NULL CHECK (current_hash ~ '^[a-f0-9]{64}$'),
  fact_diff JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_excerpts JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_url TEXT NOT NULL CHECK (char_length(source_url) BETWEEN 1 AND 4096),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  review_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'confirmed', 'dismissed')),
  reviewed_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_id, current_hash),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, domain_id)
    REFERENCES site_intelligence_domains(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, page_id)
    REFERENCES site_intelligence_pages(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, run_id)
    REFERENCES site_intelligence_crawl_runs(client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(fact_diff) = 'object'),
  CHECK (jsonb_typeof(evidence_excerpts) = 'array'),
  CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_changes_client_observed
  ON site_intelligence_changes (client_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_intelligence_changes_domain_type
  ON site_intelligence_changes (domain_id, change_type, observed_at DESC);

CREATE TABLE IF NOT EXISTS site_intelligence_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'offer_change', 'offer_gap', 'landing_mismatch', 'high_traffic_stale_content',
    'content_gap', 'conversion_context'
  )),
  lane TEXT NOT NULL CHECK (lane IN ('owned', 'competitor', 'cross_lane')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 2000),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  deterministic BOOLEAN NOT NULL DEFAULT TRUE,
  rule_version TEXT NOT NULL CHECK (char_length(rule_version) BETWEEN 1 AND 120),
  evidence_page_ids UUID[] NOT NULL DEFAULT '{}',
  evidence_change_ids UUID[] NOT NULL DEFAULT '{}',
  evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_insights_client_status
  ON site_intelligence_insights (client_id, status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_intelligence_insights_type
  ON site_intelligence_insights (client_id, insight_type, generated_at DESC);

CREATE TABLE IF NOT EXISTS site_intelligence_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('domain', 'run', 'change', 'insight')),
  entity_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_audit_client_entity
  ON site_intelligence_audit_events (client_id, entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_site_intelligence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_intelligence_domains_updated_at ON site_intelligence_domains;
CREATE TRIGGER trg_site_intelligence_domains_updated_at
BEFORE UPDATE ON site_intelligence_domains
FOR EACH ROW EXECUTE FUNCTION set_site_intelligence_updated_at();

DROP TRIGGER IF EXISTS trg_site_intelligence_runs_updated_at ON site_intelligence_crawl_runs;
CREATE TRIGGER trg_site_intelligence_runs_updated_at
BEFORE UPDATE ON site_intelligence_crawl_runs
FOR EACH ROW EXECUTE FUNCTION set_site_intelligence_updated_at();

DROP TRIGGER IF EXISTS trg_site_intelligence_pages_updated_at ON site_intelligence_pages;
CREATE TRIGGER trg_site_intelligence_pages_updated_at
BEFORE UPDATE ON site_intelligence_pages
FOR EACH ROW EXECUTE FUNCTION set_site_intelligence_updated_at();

DROP TRIGGER IF EXISTS trg_site_intelligence_insights_updated_at ON site_intelligence_insights;
CREATE TRIGGER trg_site_intelligence_insights_updated_at
BEFORE UPDATE ON site_intelligence_insights
FOR EACH ROW EXECUTE FUNCTION set_site_intelligence_updated_at();

COMMENT ON TABLE site_intelligence_domains IS
  'Governed allowlist of client-owned and public competitor domains for bounded indexing.';
COMMENT ON TABLE site_intelligence_pages IS
  'Current structured public-page state. Raw snapshots remain private in R2.';
COMMENT ON TABLE site_intelligence_changes IS
  'Material public-page fact changes with short evidence only; no full page bodies.';

COMMIT;
