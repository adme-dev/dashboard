-- Archive each Financial Advisor generation so owners can look back
-- at a given month's CFO read alongside the financial numbers.
CREATE TABLE IF NOT EXISTS financial_advisor_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_key TEXT NOT NULL,        -- ISO date used to scope the advice (toDate)
  period_label TEXT NOT NULL,      -- e.g. "March 2026"
  grade TEXT,                      -- A/B/C/D/F
  score INTEGER,
  headline TEXT,
  verdict TEXT,
  payload JSONB NOT NULL,          -- full typed Advisor response
  model TEXT,                      -- which LLM generated it
  generated_by UUID REFERENCES team_members(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_far_tenant_period ON financial_advisor_reports(tenant_id, period_key DESC);
CREATE INDEX IF NOT EXISTS idx_far_generated ON financial_advisor_reports(generated_at DESC);
