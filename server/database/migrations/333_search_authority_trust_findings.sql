-- Deterministic technical trust findings derived from governed Site Intelligence crawls.

BEGIN;

CREATE TABLE IF NOT EXISTS search_authority_trust_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL,
  page_id UUID NOT NULL,
  last_observed_run_id UUID NOT NULL,
  fingerprint CHAR(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  check_key TEXT NOT NULL CHECK (char_length(check_key) BETWEEN 1 AND 120),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  owner TEXT NOT NULL CHECK (owner IN ('xeroflow', 'dealer_origin', 'external_provider')),
  lifecycle_status TEXT NOT NULL DEFAULT 'open'
    CHECK (lifecycle_status IN ('open', 'actioned', 'resolved', 'dismissed')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 2000),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (recurrence_count >= 1),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (domain_id, fingerprint),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, domain_id)
    REFERENCES site_intelligence_domains(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, page_id)
    REFERENCES site_intelligence_pages(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, last_observed_run_id)
    REFERENCES site_intelligence_crawl_runs(client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (octet_length(evidence::text) <= 8192),
  CHECK (resolved_by IS NULL OR resolved_at IS NOT NULL),
  CHECK (last_seen_at >= first_seen_at)
);

CREATE INDEX IF NOT EXISTS idx_search_authority_trust_findings_queue
  ON search_authority_trust_findings (client_id, lifecycle_status, severity, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_authority_trust_findings_page
  ON search_authority_trust_findings (page_id, lifecycle_status, check_key);

COMMIT;
