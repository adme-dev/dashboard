-- 127: richer GA4 ingestion
-- A single generic per-dimension daily fact (dimension_type discriminator) instead
-- of five near-identical tables, plus an event-level conversion fact. Unique keys
-- include property_id so they're correct under multi-property clients (Task 3.5).
CREATE TABLE IF NOT EXISTS ga4_daily_dimension (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        UUID NOT NULL,
  client_id            UUID,
  property_id          TEXT NOT NULL,
  metric_date          DATE NOT NULL,
  dimension_type       TEXT NOT NULL,   -- 'sourceMedium' | 'campaign' | 'device' | 'landingPage' | 'country'
  dimension_value      TEXT NOT NULL,
  sessions             INTEGER DEFAULT 0,
  total_users          INTEGER DEFAULT 0,
  new_users            INTEGER DEFAULT 0,
  engaged_sessions     INTEGER DEFAULT 0,
  engagement_rate      NUMERIC DEFAULT 0,
  avg_session_duration NUMERIC DEFAULT 0,
  key_events           NUMERIC DEFAULT 0,
  purchase_revenue     NUMERIC DEFAULT 0,
  synced_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (connection_id, property_id, metric_date, dimension_type, dimension_value)
);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_dimension_client_date ON ga4_daily_dimension(client_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_dimension_type ON ga4_daily_dimension(dimension_type, metric_date);

CREATE TABLE IF NOT EXISTS ga4_daily_event (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  client_id     UUID,
  property_id   TEXT NOT NULL,
  metric_date   DATE NOT NULL,
  event_name    TEXT NOT NULL,
  event_count   NUMERIC DEFAULT 0,
  event_value   NUMERIC DEFAULT 0,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (connection_id, property_id, metric_date, event_name)
);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_event_client_date ON ga4_daily_event(client_id, metric_date);
