-- 154_social_report_schedules.sql — Slice 3 / 3c scheduled report exports.
-- Additive + idempotent. Nothing sends until the operator sets SOCIAL_REPORTS_ENABLED AND the
-- social-report-cron companion Worker is live (HARD gate, like EMAIL_SENDING_ENABLED).
CREATE TABLE IF NOT EXISTS social_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'monthly',          -- weekly|monthly
  recipients TEXT[] NOT NULL DEFAULT '{}'::text[],   -- email addresses
  window_days INT NOT NULL DEFAULT 30,               -- reporting window the PDF covers
  platform TEXT,                                     -- null = all networks
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,       -- which report blocks to include
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_report_schedules_client ON social_report_schedules(client_id, enabled);
