-- Ops Autopilot C2.1 — schedules for automated client ad-performance reports.
-- Mirrors social_report_schedules (mig 154); additive + idempotent. Monthly cadence only.
CREATE TABLE IF NOT EXISTS ad_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'monthly',
  recipients TEXT[] NOT NULL DEFAULT '{}'::text[],
  platform TEXT,                                   -- null = all platforms
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_report_schedules_enabled ON ad_report_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_ad_report_schedules_client ON ad_report_schedules(client_id);
