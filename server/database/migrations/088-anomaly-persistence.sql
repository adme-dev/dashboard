-- Migration 088: Anomaly persistence
-- (Renumbered from 085 during rebase — main shipped advisor 085/086 + leads 087.)
-- Tables for the /anomalies workflow-grade incident system.
-- See: docs/superpowers/specs/2026-04-30-anomalies-overhaul-design.md

BEGIN;

-- ── anomalies (incidents) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  tags TEXT[],
  data_sources TEXT[] NOT NULL DEFAULT '{}',

  metric JSONB,
  comparison JSONB,
  context JSONB,

  group_key TEXT,
  driver_narrative TEXT,
  driver_narrative_at TIMESTAMPTZ,

  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  notification_sent_at TIMESTAMPTZ,

  acknowledged_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  assignee_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT anomalies_status_check CHECK (
    status IN ('open', 'acknowledged', 'snoozed', 'resolved', 'dismissed')
  ),
  CONSTRAINT anomalies_severity_check CHECK (
    severity IN ('critical', 'warning', 'info')
  ),
  CONSTRAINT anomalies_type_check CHECK (
    type IN ('profitability','revenue','expenses','cashflow','receivables',
             'budget','adspend','clients','transactions')
  )
);

-- Enforces incident model: one ACTIVE row per fingerprint per tenant.
-- Resolved/dismissed rows are out of the index, so re-occurrences create new rows.
CREATE UNIQUE INDEX IF NOT EXISTS anomalies_active_fingerprint_idx
  ON anomalies (tenant_id, fingerprint)
  WHERE status NOT IN ('resolved', 'dismissed');

CREATE INDEX IF NOT EXISTS anomalies_tenant_status_idx ON anomalies (tenant_id, status);
CREATE INDEX IF NOT EXISTS anomalies_group_key_idx ON anomalies (group_key) WHERE group_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS anomalies_severity_idx ON anomalies (tenant_id, severity, status);
CREATE INDEX IF NOT EXISTS anomalies_first_detected_idx ON anomalies (tenant_id, first_detected_at DESC);

-- ── anomaly_events (audit trail) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_id UUID NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  user_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT anomaly_events_event_check CHECK (
    event IN ('detected','re-detected','acknowledged','snoozed','resolved',
              'dismissed','reopened','assigned','narrative-generated','unsnoozed')
  )
);

CREATE INDEX IF NOT EXISTS anomaly_events_anomaly_id_idx
  ON anomaly_events (anomaly_id, created_at DESC);

-- ── timezone column on the org's Xero connection ────────────────────
-- Used by the cron handler to gate "is it 7am locally?".
-- Defaults to Australia/Sydney (the agency's HQ TZ).
ALTER TABLE xero_org_connection
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Australia/Sydney';

-- ── updated_at trigger on anomalies ─────────────────────────────────
DROP TRIGGER IF EXISTS update_anomalies_updated_at ON anomalies;
CREATE TRIGGER update_anomalies_updated_at
  BEFORE UPDATE ON anomalies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
