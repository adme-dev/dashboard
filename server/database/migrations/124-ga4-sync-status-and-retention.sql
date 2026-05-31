-- Migration 124: GA4 sync status + retention index
--
-- ga4Sync previously swallowed per-property errors into a returned array that
-- was never persisted, so a silently-failing property was invisible. Persist a
-- per-connection sync status the connect card can surface. (ga4_daily_channel
-- already has a synced_at column, so it is not re-added here.)
CREATE TABLE IF NOT EXISTS ga4_sync_status (
  connection_id   UUID PRIMARY KEY,
  last_run_at     TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error      TEXT,
  rows_upserted   INTEGER DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Supports date-bounded reads and any future retention/cleanup of old rows.
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_date ON ga4_daily_channel(metric_date);
