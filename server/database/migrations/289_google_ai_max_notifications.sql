-- Delivery claims for Google Ads AI Max in-app notifications. Claims make
-- campaign alerts and daily digests idempotent across cron retries and worker
-- restarts. Release 1 does not use this table for email, Slack, or portal fan-out.

CREATE TABLE IF NOT EXISTS google_ai_max_notification_deliveries (
  tenant_id TEXT NOT NULL CHECK (char_length(tenant_id) BETWEEN 1 AND 255),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 500),
  scan_run_id UUID REFERENCES google_ai_max_scan_runs(id) ON DELETE SET NULL,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_google_ai_max_notification_deliveries_created
  ON google_ai_max_notification_deliveries (tenant_id, created_at DESC);

COMMENT ON TABLE google_ai_max_notification_deliveries IS
  'Idempotency claims for internal-only Google AI Max campaign alerts and daily digests.';

-- Rollback (manual): DROP TABLE google_ai_max_notification_deliveries;
