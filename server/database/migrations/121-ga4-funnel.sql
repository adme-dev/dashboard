-- 121-ga4-funnel.sql
-- GA4 website-analytics domain: property→client mapping + daily channel metrics.
-- GA4 is NOT ad spend — it must never be stored in media_spend.

-- One row per GA4 property, mapped to exactly one client. The Google login /
-- tokens live in social_connections (platform='ga4'); this table is the
-- property→client routing layer.
CREATE TABLE IF NOT EXISTS ga4_property_map (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  property_id           TEXT NOT NULL,
  property_display_name TEXT,
  client_id             UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id)
);
CREATE INDEX IF NOT EXISTS idx_ga4_property_map_client ON ga4_property_map(client_id);
CREATE INDEX IF NOT EXISTS idx_ga4_property_map_conn   ON ga4_property_map(connection_id);

-- Daily GA4 metrics, segmented by Default Channel Group. Rolls up to top-line
-- totals via SUM. UNIQUE key makes the sync idempotent (upsert).
CREATE TABLE IF NOT EXISTS ga4_daily_channel (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  client_id            UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  property_id          TEXT NOT NULL,
  metric_date          DATE NOT NULL,
  channel_group        TEXT NOT NULL,        -- GA4 sessionDefaultChannelGroup
  sessions             INTEGER       NOT NULL DEFAULT 0,
  total_users          INTEGER       NOT NULL DEFAULT 0,
  new_users            INTEGER       NOT NULL DEFAULT 0,
  engaged_sessions     INTEGER       NOT NULL DEFAULT 0,
  engagement_rate      NUMERIC(8,4)  NOT NULL DEFAULT 0,
  avg_session_duration NUMERIC(10,2) NOT NULL DEFAULT 0,
  key_events           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- GA4 conversions
  purchase_revenue     NUMERIC(14,2) NOT NULL DEFAULT 0,  -- 0 for lead-gen
  synced_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, metric_date, channel_group)
);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_client_date ON ga4_daily_channel(client_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_conn_date   ON ga4_daily_channel(connection_id, metric_date);
