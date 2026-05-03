-- Migration 094: Customer insights — churn risk, AI summary, forecast
--
-- Phase D of the customer-hub overhaul. Adds a single insights table that
-- holds the derived signals each customer card surfaces:
--   • Heuristic churn risk score (computed from rollup data — fast, deterministic)
--   • Forecast revenue (12-month projection from MRR + recent trend)
--   • AI account summary (Groq one-paragraph; cached daily)
--   • Component factor breakdown (so the UI can explain *why* the score is what it is)
--
-- Heuristic fields are recomputed by the same cron that builds rollups
-- (15 min cadence). The AI summary is regenerated lazily — at most once
-- per day per customer, on first read.

CREATE TABLE IF NOT EXISTS customer_insights (
  tenant_id  TEXT NOT NULL,
  contact_id TEXT NOT NULL,

  -- 0-100 — higher means more at-risk of churning. Stable across runs
  -- because inputs are pure functions of the rollup snapshot.
  churn_risk_score   SMALLINT NOT NULL DEFAULT 0
    CHECK (churn_risk_score BETWEEN 0 AND 100),
  churn_risk_band    TEXT NOT NULL DEFAULT 'low'
    CHECK (churn_risk_band IN ('low', 'moderate', 'high', 'critical')),

  -- Component breakdown for the UI's "why is this risk score X" tooltip.
  -- Shape:
  --   { revenueTrend: { score, label, weight },
  --     paymentBehaviour: { score, label, weight },
  --     activity: { score, label, weight },
  --     mrrDiscount: number }
  churn_factors JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Forward-looking revenue projection. forecast_basis records which
  -- input dominated the calculation so the UI can show "based on MRR"
  -- vs "extrapolated from recent trend".
  forecast_12m_cents BIGINT NOT NULL DEFAULT 0,
  forecast_basis     TEXT   NOT NULL DEFAULT 'unknown'
    CHECK (forecast_basis IN ('mrr', 'trend', 'hybrid', 'insufficient', 'unknown')),

  -- AI summary (Groq) — null until first read triggers generation.
  ai_summary    TEXT,
  ai_summary_at TIMESTAMPTZ,

  -- When the heuristic side was last recomputed (always set by the cron).
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, contact_id)
);

-- "Show me the highest-risk customers" — collections queue + dashboard view.
CREATE INDEX IF NOT EXISTS idx_ci_risk
  ON customer_insights(tenant_id, churn_risk_score DESC);

-- Filter to critical-only without scanning the table.
CREATE INDEX IF NOT EXISTS idx_ci_band
  ON customer_insights(tenant_id, churn_risk_band)
  WHERE churn_risk_band IN ('high', 'critical');

-- "Which AI summaries need regenerating today?" — used by the lazy
-- generator to find stale entries.
CREATE INDEX IF NOT EXISTS idx_ci_summary_age
  ON customer_insights(tenant_id, ai_summary_at NULLS FIRST);
