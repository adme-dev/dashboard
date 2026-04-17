-- Phase 1 of the Enterprise Advisor backbone.
-- Every recommendation the Financial Advisor LLM returns gets persisted
-- as a row here so owners can triage, assign, and later measure impact.

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  source_report_id UUID REFERENCES financial_advisor_reports(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  impact TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  target_metric TEXT,
  baseline_metric_value NUMERIC,
  target_direction TEXT CHECK (target_direction IN ('up', 'down')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')) DEFAULT 'open',
  due_date DATE,
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  acted_at TIMESTAMPTZ,
  outcome_notes TEXT,
  xero_metric_snapshot JSONB,
  vector_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reco_tenant_status ON recommendations(tenant_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_reco_client ON recommendations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reco_source_report ON recommendations(source_report_id);
CREATE INDEX IF NOT EXISTS idx_reco_created ON recommendations(created_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reco_events_rec ON recommendation_events(recommendation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_after_action INTEGER,
  metric_value NUMERIC,
  metric_delta NUMERIC,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_reco_outcomes_rec ON recommendation_outcomes(recommendation_id, measured_at);

-- Bump updated_at on every update so API consumers can sort by it reliably.
CREATE OR REPLACE FUNCTION recommendations_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recommendations_updated_at ON recommendations;
CREATE TRIGGER trg_recommendations_updated_at
BEFORE UPDATE ON recommendations
FOR EACH ROW EXECUTE FUNCTION recommendations_touch_updated_at();
