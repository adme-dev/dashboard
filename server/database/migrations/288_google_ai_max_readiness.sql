-- Google Ads AI Max readiness: scan lifecycle, current campaign state, and
-- material state history. This release is observational only; it does not
-- authorize or perform Google Ads mutations.

CREATE TABLE IF NOT EXISTS google_ai_max_scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL CHECK (char_length(tenant_id) BETWEEN 1 AND 255),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
  trigger TEXT NOT NULL
    CHECK (trigger IN ('manual', 'scheduled', 'post_sync')),
  requested_by UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_connections INTEGER NOT NULL DEFAULT 0 CHECK (total_connections >= 0),
  processed_connections INTEGER NOT NULL DEFAULT 0 CHECK (processed_connections >= 0),
  total_campaigns INTEGER NOT NULL DEFAULT 0 CHECK (total_campaigns >= 0),
  affected_campaigns INTEGER NOT NULL DEFAULT 0 CHECK (affected_campaigns >= 0),
  unknown_campaigns INTEGER NOT NULL DEFAULT 0 CHECK (unknown_campaigns >= 0),
  failures JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(failures) = 'array'),
  api_version TEXT NOT NULL DEFAULT 'v23',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (processed_connections <= total_connections),
  CHECK (finished_at IS NULL OR started_at IS NOT NULL),
  CHECK (status NOT IN ('completed', 'partial', 'failed') OR finished_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_google_ai_max_scan_runs_tenant_status_created
  ON google_ai_max_scan_runs (tenant_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_ai_max_scan_runs_active_tenant
  ON google_ai_max_scan_runs (tenant_id)
  WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS google_ai_max_campaign_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL CHECK (char_length(tenant_id) BETWEEN 1 AND 255),
  connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL CHECK (char_length(customer_id) > 0),
  campaign_id TEXT NOT NULL CHECK (char_length(campaign_id) > 0),
  campaign_name TEXT NOT NULL DEFAULT '',
  campaign_status TEXT NOT NULL,
  advertising_channel_type TEXT NOT NULL,
  bidding_strategy_type TEXT,
  keyword_match_type TEXT,
  ai_max_enabled BOOLEAN,
  bundling_required TEXT,
  text_asset_automation_status TEXT,
  final_url_expansion_status TEXT,
  ad_group_count INTEGER CHECK (ad_group_count IS NULL OR ad_group_count >= 0),
  search_term_matching_disabled_ad_group_count INTEGER
    CHECK (
      search_term_matching_disabled_ad_group_count IS NULL
      OR search_term_matching_disabled_ad_group_count >= 0
    ),
  migration_reason TEXT NOT NULL
    CHECK (migration_reason IN (
      'aca',
      'campaign_broad_match',
      'aca_and_campaign_broad_match',
      'none',
      'unknown'
    )),
  readiness_status TEXT NOT NULL
    CHECK (readiness_status IN (
      'ready',
      'scheduled_upgrade',
      'needs_review',
      'not_affected',
      'unknown'
    )),
  risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(risk_flags) = 'array'),
  effective_search_term_matching TEXT NOT NULL
    CHECK (effective_search_term_matching IN (
      'enabled', 'disabled', 'partially_disabled', 'unknown'
    )),
  effective_text_customisation TEXT NOT NULL
    CHECK (effective_text_customisation IN ('enabled', 'disabled', 'unknown')),
  effective_final_url_expansion TEXT NOT NULL
    CHECK (effective_final_url_expansion IN ('enabled', 'disabled', 'unknown')),
  deep_link TEXT,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  last_changed_at TIMESTAMPTZ NOT NULL,
  last_scan_run_id UUID REFERENCES google_ai_max_scan_runs(id) ON DELETE SET NULL,
  raw_evidence JSONB NOT NULL CHECK (jsonb_typeof(raw_evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, connection_id, campaign_id),
  CHECK (
    ad_group_count IS NULL
    OR search_term_matching_disabled_ad_group_count IS NULL
    OR search_term_matching_disabled_ad_group_count <= ad_group_count
  ),
  CHECK (first_observed_at <= last_observed_at),
  CHECK (last_changed_at <= last_observed_at)
);

CREATE INDEX IF NOT EXISTS idx_google_ai_max_campaign_state_tenant_readiness_freshness
  ON google_ai_max_campaign_state (tenant_id, readiness_status, last_observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_ai_max_campaign_state_tenant_campaign
  ON google_ai_max_campaign_state (tenant_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_google_ai_max_campaign_state_connection
  ON google_ai_max_campaign_state (connection_id);

CREATE TABLE IF NOT EXISTS google_ai_max_state_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL CHECK (char_length(tenant_id) BETWEEN 1 AND 255),
  campaign_state_id UUID NOT NULL
    REFERENCES google_ai_max_campaign_state(id) ON DELETE CASCADE,
  scan_run_id UUID REFERENCES google_ai_max_scan_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'first_seen',
      'classification_changed',
      'setting_changed',
      'became_unknown',
      'recovered'
    )),
  previous_value JSONB CHECK (previous_value IS NULL OR jsonb_typeof(previous_value) = 'object'),
  current_value JSONB NOT NULL CHECK (jsonb_typeof(current_value) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_ai_max_state_events_tenant_observed
  ON google_ai_max_state_events (tenant_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_ai_max_state_events_campaign_observed
  ON google_ai_max_state_events (campaign_state_id, observed_at DESC);

COMMENT ON TABLE google_ai_max_scan_runs IS
  'Read-only Google Ads AI Max readiness scan lifecycle and aggregate outcomes.';
COMMENT ON TABLE google_ai_max_campaign_state IS
  'Latest tenant-scoped Google Ads AI Max evidence and deterministic classification.';
COMMENT ON TABLE google_ai_max_state_events IS
  'Append-only history of first observations and material AI Max state changes.';

-- Rollback (manual and destructive): drop events, campaign state, then scan runs.
-- DROP TABLE google_ai_max_state_events;
-- DROP TABLE google_ai_max_campaign_state;
-- DROP TABLE google_ai_max_scan_runs;
