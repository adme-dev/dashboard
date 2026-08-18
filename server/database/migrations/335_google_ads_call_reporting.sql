-- Google Ads call_view ingestion and sync observability.
-- Timestamps from call_view are advertiser-account local values, so they are
-- stored without an invented UTC offset and paired with customer_timezone.

CREATE TABLE IF NOT EXISTS google_ads_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  customer_id TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  provider_resource_name TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_group_id TEXT,
  ad_group_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('MISSED', 'RECEIVED', 'UNKNOWN', 'UNSPECIFIED')),
  started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITHOUT TIME ZONE,
  customer_timezone TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  display_location TEXT,
  call_type TEXT,
  caller_country_code TEXT,
  caller_area_code TEXT,
  first_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT google_ads_calls_connection_provider_unique
    UNIQUE (connection_id, provider_call_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_calls_client_started
  ON google_ads_calls (client_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_ads_calls_connection_started
  ON google_ads_calls (connection_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_ads_calls_started
  ON google_ads_calls (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_ads_calls_campaign_started
  ON google_ads_calls (campaign_id, started_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_ads_call_sync_state (
  connection_id UUID PRIMARY KEY REFERENCES social_connections(id) ON DELETE CASCADE,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_row_count INTEGER NOT NULL DEFAULT 0 CHECK (last_row_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
