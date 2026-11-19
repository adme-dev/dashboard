-- 517_marketing_alerts.sql
-- Marketing automation governance, phase 1 (notify-only alerts).
-- See .planning/todos/008-marketing-automation-governance.md.
--
-- marketing_alerts: one row per open condition. `id` is the stable alert id that
-- phase 2 (rules/approvals) and phase 4 (client change timeline) link changes to.
-- The partial unique index makes `dedupe_key` unique among OPEN alerts only: a
-- condition that clears is marked resolved, and if it recurs later it becomes a
-- new alert with a new id.
--
-- marketing_alert_deliveries: append-only record of every delivery attempt
-- (sent, failed, or suppressed because staff notifications are paused), which
-- also guarantees one daily digest per tenant-local date.
--
-- Additive and idempotent. Nothing reads these tables until the pipeline is
-- enabled via agency_settings key 'marketing_alerts'.

CREATE TABLE IF NOT EXISTS marketing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('budget_pacing', 'anomaly', 'google_policy', 'spend_sync', 'search_terms')),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  client_id UUID,
  client_name TEXT,
  platform TEXT,
  account_ref TEXT,
  campaign_ref TEXT,
  summary TEXT NOT NULL,
  next_step TEXT NOT NULL,
  mcp_tool TEXT,
  deep_link TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrences INTEGER NOT NULL DEFAULT 1,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity_changed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  immediate_notified_at TIMESTAMPTZ,
  last_digest_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_alerts_open_dedupe
  ON marketing_alerts (tenant_id, dedupe_key)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_marketing_alerts_open_by_source
  ON marketing_alerts (tenant_id, source)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_marketing_alerts_client
  ON marketing_alerts (client_id, first_detected_at DESC);

CREATE TABLE IF NOT EXISTS marketing_alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  delivery_kind TEXT NOT NULL CHECK (delivery_kind IN ('immediate', 'digest')),
  channel TEXT NOT NULL CHECK (channel IN ('slack', 'in_app', 'none')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'suppressed_paused', 'skipped_no_target')),
  alert_ids UUID[] NOT NULL DEFAULT '{}',
  local_date DATE NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_alert_deliveries_digest
  ON marketing_alert_deliveries (tenant_id, delivery_kind, local_date);
