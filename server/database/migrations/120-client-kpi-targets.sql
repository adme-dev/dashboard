-- 120-client-kpi-targets.sql
-- Per-client, per-result-type KPI targets that drive the campaign health score.
CREATE TABLE IF NOT EXISTS client_kpi_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  result_type VARCHAR(40) NOT NULL,
  target_cost_per_result NUMERIC(10,2) NOT NULL,
  target_ctr NUMERIC(5,2),
  max_frequency NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, result_type)
);
CREATE INDEX IF NOT EXISTS idx_client_kpi_targets_client ON client_kpi_targets(client_id);
