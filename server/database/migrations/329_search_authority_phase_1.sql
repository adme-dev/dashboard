-- Search Authority Phase 0–1: client readiness, Search Console evidence,
-- indexed-version inspection history, and governed opportunities.
--
-- Search Console does not guarantee every result row. Daily property, page,
-- and query/page projections are therefore stored independently, and missing
-- rows must not be interpreted as complete coverage or zero demand.

BEGIN;

ALTER TABLE google_oauth_attempts
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'google_ads';

DO $$ BEGIN
  ALTER TABLE google_oauth_attempts
    ADD CONSTRAINT google_oauth_attempts_purpose_check
    CHECK (purpose IN ('google_ads', 'search_console'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_google_oauth_attempts_pending_purpose
  ON google_oauth_attempts (initiated_by, purpose, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS search_authority_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  canonical_hostname TEXT NOT NULL
    CHECK (
      canonical_hostname = lower(canonical_hostname)
      AND canonical_hostname !~ '[/?#]'
    ),
  content_hostname TEXT
    CHECK (
      content_hostname IS NULL
      OR (
        content_hostname = lower(content_hostname)
        AND content_hostname !~ '[/?#]'
      )
    ),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'error', 'archived')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id),
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_search_authority_sites_status
  ON search_authority_sites (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS search_console_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  google_credential_profile_id UUID NOT NULL
    REFERENCES google_credential_profiles(id) ON DELETE RESTRICT,
  google_subject TEXT NOT NULL,
  google_email TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'degraded', 'error', 'disconnected')),
  connected_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, google_credential_profile_id),
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_search_console_connections_health
  ON search_console_connections (client_id, status, last_checked_at DESC);

CREATE TABLE IF NOT EXISTS search_console_property_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  property_uri TEXT NOT NULL,
  permission_level TEXT NOT NULL
    CHECK (
      permission_level IN (
        'siteOwner',
        'siteFullUser',
        'siteRestrictedUser',
        'siteUnverifiedUser'
      )
    ),
  property_type TEXT NOT NULL
    CHECK (property_type IN ('domain', 'url_prefix')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'restricted', 'error', 'disconnected')),
  data_through_date DATE,
  provisional_from_date DATE,
  last_sync_status TEXT
    CHECK (
      last_sync_status IS NULL
      OR last_sync_status IN ('queued', 'running', 'succeeded', 'partial', 'failed')
    ),
  last_sync_started_at TIMESTAMPTZ,
  last_sync_completed_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, site_id)
    REFERENCES search_authority_sites(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, connection_id)
    REFERENCES search_console_connections(client_id, id) ON DELETE CASCADE,
  UNIQUE (client_id, property_uri),
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_search_console_property_maps_sync
  ON search_console_property_maps (
    status,
    last_sync_completed_at ASC NULLS FIRST
  )
  WHERE status IN ('active', 'restricted');

CREATE TABLE IF NOT EXISTS gsc_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  property_map_id UUID NOT NULL,
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('initial', 'scheduled', 'manual', 'retry')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed')),
  requested_start_date DATE NOT NULL,
  requested_end_date DATE NOT NULL,
  provider_timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  first_incomplete_date DATE,
  rows_received BIGINT NOT NULL DEFAULT 0 CHECK (rows_received >= 0),
  dates_succeeded INTEGER NOT NULL DEFAULT 0 CHECK (dates_succeeded >= 0),
  dates_failed INTEGER NOT NULL DEFAULT 0 CHECK (dates_failed >= 0),
  error_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requested_end_date >= requested_start_date),
  FOREIGN KEY (client_id, property_map_id)
    REFERENCES search_console_property_maps(client_id, id) ON DELETE CASCADE,
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_gsc_sync_runs_pending
  ON gsc_sync_runs (status, queued_at)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_gsc_sync_runs_client_history
  ON gsc_sync_runs (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gsc_daily_query_page (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  property_map_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'web'
    CHECK (search_type IN ('web', 'image', 'video', 'news', 'discover', 'googleNews')),
  query_text TEXT NOT NULL,
  page_url TEXT NOT NULL,
  clicks NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions BIGINT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  ctr NUMERIC(12,10) NOT NULL DEFAULT 0 CHECK (ctr >= 0 AND ctr <= 1),
  position NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (position >= 0),
  provisional BOOLEAN NOT NULL DEFAULT FALSE,
  first_incomplete_date DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, property_map_id)
    REFERENCES search_console_property_maps(client_id, id) ON DELETE CASCADE,
  PRIMARY KEY (property_map_id, metric_date, search_type, query_text, page_url)
);

CREATE INDEX IF NOT EXISTS idx_gsc_daily_query_page_client_date
  ON gsc_daily_query_page (client_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_gsc_daily_query_page_opportunity
  ON gsc_daily_query_page (
    client_id,
    metric_date DESC,
    impressions DESC,
    position
  );

CREATE TABLE IF NOT EXISTS gsc_daily_page (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  property_map_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'web'
    CHECK (search_type IN ('web', 'image', 'video', 'news', 'discover', 'googleNews')),
  page_url TEXT NOT NULL,
  clicks NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions BIGINT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  ctr NUMERIC(12,10) NOT NULL DEFAULT 0 CHECK (ctr >= 0 AND ctr <= 1),
  position NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (position >= 0),
  provisional BOOLEAN NOT NULL DEFAULT FALSE,
  first_incomplete_date DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, property_map_id)
    REFERENCES search_console_property_maps(client_id, id) ON DELETE CASCADE,
  PRIMARY KEY (property_map_id, metric_date, search_type, page_url)
);

CREATE INDEX IF NOT EXISTS idx_gsc_daily_page_client_date
  ON gsc_daily_page (client_id, metric_date DESC);

CREATE TABLE IF NOT EXISTS gsc_daily_property (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  property_map_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'web'
    CHECK (search_type IN ('web', 'image', 'video', 'news', 'discover', 'googleNews')),
  clicks NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions BIGINT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  ctr NUMERIC(12,10) NOT NULL DEFAULT 0 CHECK (ctr >= 0 AND ctr <= 1),
  position NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (position >= 0),
  provisional BOOLEAN NOT NULL DEFAULT FALSE,
  first_incomplete_date DATE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, property_map_id)
    REFERENCES search_console_property_maps(client_id, id) ON DELETE CASCADE,
  PRIMARY KEY (property_map_id, metric_date, search_type)
);

CREATE INDEX IF NOT EXISTS idx_gsc_daily_property_client_date
  ON gsc_daily_property (client_id, metric_date DESC);

CREATE TABLE IF NOT EXISTS gsc_url_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  property_map_id UUID NOT NULL,
  inspected_url TEXT NOT NULL,
  inspection_kind TEXT NOT NULL DEFAULT 'indexed_version'
    CHECK (inspection_kind = 'indexed_version'),
  verdict TEXT,
  coverage_state TEXT,
  indexing_state TEXT,
  page_fetch_state TEXT,
  robots_txt_state TEXT,
  crawled_as TEXT,
  last_crawl_time TIMESTAMPTZ,
  google_canonical TEXT,
  user_canonical TEXT,
  referring_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  sitemap_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, property_map_id)
    REFERENCES search_console_property_maps(client_id, id) ON DELETE CASCADE,
  UNIQUE (property_map_id, inspected_url, inspected_at)
);

CREATE INDEX IF NOT EXISTS idx_gsc_url_inspections_latest
  ON gsc_url_inspections (client_id, property_map_id, inspected_url, inspected_at DESC);

CREATE TABLE IF NOT EXISTS search_authority_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  property_map_id UUID,
  opportunity_type TEXT NOT NULL
    CHECK (
      opportunity_type IN (
        'low_ctr',
        'striking_distance',
        'declining',
        'growth',
        'indexing',
        'technical'
      )
    ),
  fingerprint CHAR(64) NOT NULL
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  query_text TEXT,
  page_url TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1
    CHECK (confidence >= 0 AND confidence <= 1),
  scoring_version TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  lifecycle_status TEXT NOT NULL DEFAULT 'new'
    CHECK (
      lifecycle_status IN (
        'new',
        'under_review',
        'accepted',
        'task_created',
        'in_progress',
        'published',
        'measuring',
        'closed',
        'dismissed',
        'duplicate',
        'expired',
        'not_actionable'
      )
    ),
  evidence_start_date DATE NOT NULL,
  evidence_end_date DATE NOT NULL,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (evidence_end_date >= evidence_start_date),
  FOREIGN KEY (client_id, site_id)
    REFERENCES search_authority_sites(client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, property_map_id)
    REFERENCES search_console_property_maps(client_id, id) ON DELETE RESTRICT,
  UNIQUE (site_id, fingerprint),
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_search_authority_opportunities_queue
  ON search_authority_opportunities (
    client_id,
    lifecycle_status,
    score DESC,
    last_detected_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_search_authority_opportunities_page
  ON search_authority_opportunities (client_id, page_url)
  WHERE page_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS search_authority_opportunity_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL,
  evidence_type TEXT NOT NULL,
  window_start_date DATE NOT NULL,
  window_end_date DATE NOT NULL,
  snapshot JSONB NOT NULL,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (window_end_date >= window_start_date),
  FOREIGN KEY (client_id, opportunity_id)
    REFERENCES search_authority_opportunities(client_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_search_authority_evidence_history
  ON search_authority_opportunity_evidence (
    client_id,
    opportunity_id,
    created_at DESC
  );

CREATE OR REPLACE FUNCTION reject_search_authority_evidence_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Search Authority opportunity evidence cannot be updated';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER search_authority_evidence_no_update
    BEFORE UPDATE ON search_authority_opportunity_evidence
    FOR EACH ROW EXECUTE FUNCTION reject_search_authority_evidence_update();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_search_authority_sites_updated_at
    BEFORE UPDATE ON search_authority_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_search_console_connections_updated_at
    BEFORE UPDATE ON search_console_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_search_console_property_maps_updated_at
    BEFORE UPDATE ON search_console_property_maps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_search_authority_opportunities_updated_at
    BEFORE UPDATE ON search_authority_opportunities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE gsc_daily_query_page IS
  'Search Console query/page rows are bounded provider output and exclude anonymised queries; never sum them as complete property demand.';
COMMENT ON TABLE gsc_daily_page IS
  'Independent page projection from Search Console. It is not derived from query/page rows.';
COMMENT ON TABLE gsc_daily_property IS
  'Independent property projection used for totals. Provisional state and first incomplete date preserve provider uncertainty.';
COMMENT ON TABLE gsc_url_inspections IS
  'Indexed-version URL Inspection snapshots only; this table does not represent a live URL test.';
COMMENT ON TABLE search_authority_opportunity_evidence IS
  'Append-only provider evidence captured when an explainable opportunity is detected or materially refreshed.';

COMMIT;

-- Rollback guidance: disable SEARCH_AUTHORITY_ENABLED and stop the Search
-- Console cron. Leave these additive tables and purpose metadata in place to
-- preserve OAuth, measurement, and audit history; application rollback does
-- not require destructive schema changes.
