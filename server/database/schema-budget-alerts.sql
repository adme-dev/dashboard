-- ============================================
-- Budget Alerts & Forecasting Schema
-- Threshold notifications, burn rate tracking, and budget forecasting
-- ============================================

-- ============================================
-- Budget Alert Configurations
-- ============================================
CREATE TABLE IF NOT EXISTS budget_alert_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Scope
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,

  -- Alert type
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'budget_threshold',      -- Percentage of budget consumed
    'burn_rate',             -- Spending velocity
    'forecast_overrun',      -- Projected to exceed budget
    'time_threshold',        -- Project timeline
    'expense_spike',         -- Unusual expense activity
    'utilization',           -- Team utilization
    'invoice_overdue',       -- Outstanding invoices
    'cash_flow'              -- Cash flow projections
  )),

  -- Thresholds (percentage-based)
  warning_threshold DECIMAL(5, 2) DEFAULT 75.00,   -- Yellow alert
  critical_threshold DECIMAL(5, 2) DEFAULT 90.00,  -- Red alert
  danger_threshold DECIMAL(5, 2) DEFAULT 100.00,   -- Over budget

  -- Absolute thresholds (dollar-based)
  warning_amount DECIMAL(12, 2),
  critical_amount DECIMAL(12, 2),

  -- Notification settings
  notify_email BOOLEAN DEFAULT true,
  notify_slack BOOLEAN DEFAULT false,
  notify_in_app BOOLEAN DEFAULT true,

  -- Recipients
  notify_project_manager BOOLEAN DEFAULT true,
  notify_account_manager BOOLEAN DEFAULT true,
  notify_finance BOOLEAN DEFAULT false,
  additional_recipients TEXT[], -- Email addresses

  -- Frequency
  check_frequency VARCHAR(20) DEFAULT 'daily' CHECK (check_frequency IN ('hourly', 'daily', 'weekly', 'realtime')),
  snooze_until TIMESTAMPTZ, -- Temporarily disable alerts

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_alert_configs_project ON budget_alert_configs(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_alert_configs_client ON budget_alert_configs(client_id);
CREATE INDEX IF NOT EXISTS idx_budget_alert_configs_type ON budget_alert_configs(alert_type);
CREATE INDEX IF NOT EXISTS idx_budget_alert_configs_active ON budget_alert_configs(is_active) WHERE is_active = true;

-- ============================================
-- Budget Alerts (Generated alerts)
-- ============================================
CREATE TABLE IF NOT EXISTS budget_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id UUID REFERENCES budget_alert_configs(id) ON DELETE SET NULL,
  tenant_id TEXT NOT NULL,

  -- Context
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,

  -- Alert details
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'danger')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  -- Metrics at time of alert
  current_value DECIMAL(12, 2),
  threshold_value DECIMAL(12, 2),
  budget_amount DECIMAL(12, 2),
  percent_consumed DECIMAL(5, 2),

  -- Forecast data (if applicable)
  projected_total DECIMAL(12, 2),
  days_to_budget_exhaustion INTEGER,
  burn_rate_daily DECIMAL(12, 2),

  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES team_members(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Notifications sent
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  slack_sent BOOLEAN DEFAULT false,
  slack_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_project ON budget_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_client ON budget_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_status ON budget_alerts(status);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_severity ON budget_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_type ON budget_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_created ON budget_alerts(created_at DESC);

-- ============================================
-- Budget Snapshots (Historical tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS budget_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Budget status
  budget_amount DECIMAL(12, 2) NOT NULL,
  spent_to_date DECIMAL(12, 2) NOT NULL,
  remaining DECIMAL(12, 2) GENERATED ALWAYS AS (budget_amount - spent_to_date) STORED,
  percent_consumed DECIMAL(5, 2) GENERATED ALWAYS AS (
    CASE WHEN budget_amount > 0 THEN (spent_to_date / budget_amount * 100) ELSE 0 END
  ) STORED,

  -- Breakdown
  labor_cost DECIMAL(12, 2) DEFAULT 0,
  expense_cost DECIMAL(12, 2) DEFAULT 0,
  media_cost DECIMAL(12, 2) DEFAULT 0,
  other_cost DECIMAL(12, 2) DEFAULT 0,

  -- Forecasting
  burn_rate_daily DECIMAL(12, 2),
  burn_rate_weekly DECIMAL(12, 2),
  projected_total DECIMAL(12, 2),
  projected_completion_date DATE,
  days_to_exhaustion INTEGER,

  -- Revenue/Invoicing
  invoiced_amount DECIMAL(12, 2) DEFAULT 0,
  collected_amount DECIMAL(12, 2) DEFAULT 0,

  -- Hours (for time-based budgets)
  budget_hours DECIMAL(8, 2),
  hours_logged DECIMAL(8, 2),
  hours_remaining DECIMAL(8, 2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_budget_snapshots_project ON budget_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_snapshots_date ON budget_snapshots(snapshot_date);

-- ============================================
-- Burn Rate History
-- ============================================
CREATE TABLE IF NOT EXISTS burn_rate_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Spending
  total_spent DECIMAL(12, 2) NOT NULL,
  labor_spent DECIMAL(12, 2) DEFAULT 0,
  expense_spent DECIMAL(12, 2) DEFAULT 0,
  media_spent DECIMAL(12, 2) DEFAULT 0,

  -- Rates
  daily_burn_rate DECIMAL(12, 2),
  weekly_burn_rate DECIMAL(12, 2),

  -- Comparison
  budget_for_period DECIMAL(12, 2),
  variance DECIMAL(12, 2), -- over/under budget
  variance_percent DECIMAL(5, 2),

  -- Hours
  hours_logged DECIMAL(8, 2),
  avg_hourly_cost DECIMAL(10, 2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_burn_rate_history_project ON burn_rate_history(project_id);
CREATE INDEX IF NOT EXISTS idx_burn_rate_history_period ON burn_rate_history(period_start, period_end);

-- ============================================
-- Forecast Models
-- ============================================
CREATE TABLE IF NOT EXISTS budget_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Forecast method
  forecast_method VARCHAR(50) DEFAULT 'linear' CHECK (forecast_method IN ('linear', 'weighted_avg', 'moving_avg', 'seasonal', 'ml_based')),

  -- Projections
  projected_final_cost DECIMAL(12, 2) NOT NULL,
  projected_completion_date DATE,
  confidence_level DECIMAL(5, 2), -- 0-100%

  -- Range estimates
  best_case DECIMAL(12, 2),
  most_likely DECIMAL(12, 2),
  worst_case DECIMAL(12, 2),

  -- Breakdown projections
  projected_labor DECIMAL(12, 2),
  projected_expenses DECIMAL(12, 2),
  projected_media DECIMAL(12, 2),

  -- Budget comparison
  budget_amount DECIMAL(12, 2),
  projected_variance DECIMAL(12, 2),
  projected_variance_percent DECIMAL(5, 2),

  -- Risk assessment
  risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors TEXT[],

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES team_members(id),

  UNIQUE(project_id, forecast_date, forecast_method)
);

CREATE INDEX IF NOT EXISTS idx_budget_forecasts_project ON budget_forecasts(project_id);
CREATE INDEX IF NOT EXISTS idx_budget_forecasts_date ON budget_forecasts(forecast_date DESC);

-- ============================================
-- Cash Flow Projections
-- ============================================
CREATE TABLE IF NOT EXISTS cash_flow_projections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  projection_date DATE NOT NULL,
  period_type VARCHAR(20) DEFAULT 'month' CHECK (period_type IN ('week', 'month', 'quarter')),

  -- Inflows
  projected_collections DECIMAL(12, 2) DEFAULT 0,
  confirmed_receivables DECIMAL(12, 2) DEFAULT 0,
  expected_new_revenue DECIMAL(12, 2) DEFAULT 0,
  total_inflow DECIMAL(12, 2) GENERATED ALWAYS AS (
    projected_collections + confirmed_receivables + expected_new_revenue
  ) STORED,

  -- Outflows
  projected_payroll DECIMAL(12, 2) DEFAULT 0,
  projected_expenses DECIMAL(12, 2) DEFAULT 0,
  projected_vendor_payments DECIMAL(12, 2) DEFAULT 0,
  projected_other DECIMAL(12, 2) DEFAULT 0,
  total_outflow DECIMAL(12, 2) GENERATED ALWAYS AS (
    projected_payroll + projected_expenses + projected_vendor_payments + projected_other
  ) STORED,

  -- Net
  net_cash_flow DECIMAL(12, 2) GENERATED ALWAYS AS (
    (projected_collections + confirmed_receivables + expected_new_revenue) -
    (projected_payroll + projected_expenses + projected_vendor_payments + projected_other)
  ) STORED,

  -- Running balance
  opening_balance DECIMAL(12, 2),
  closing_balance DECIMAL(12, 2),

  -- Confidence
  confidence_level DECIMAL(5, 2),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(projection_date, period_type)
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_projections_date ON cash_flow_projections(projection_date);

-- ============================================
-- Views
-- ============================================

-- Active Alerts Summary
DROP VIEW IF EXISTS v_active_budget_alerts;
CREATE VIEW v_active_budget_alerts AS
SELECT
  ba.id,
  ba.alert_type,
  ba.severity,
  ba.title,
  ba.message,
  ba.current_value,
  ba.threshold_value,
  ba.percent_consumed,
  ba.projected_total,
  ba.days_to_budget_exhaustion,
  ba.status,
  ba.created_at,
  p.id AS project_id,
  p.name AS project_name,
  p.budget_amount AS project_budget,
  c.id AS client_id,
  c.name AS client_name,
  EXTRACT(EPOCH FROM (NOW() - ba.created_at)) / 3600 AS hours_active
FROM budget_alerts ba
LEFT JOIN projects p ON ba.project_id = p.id
LEFT JOIN agency_clients c ON ba.client_id = c.id
WHERE ba.status = 'active'
ORDER BY
  CASE ba.severity
    WHEN 'danger' THEN 1
    WHEN 'critical' THEN 2
    WHEN 'warning' THEN 3
    ELSE 4
  END,
  ba.created_at DESC;

-- Project Budget Health
DROP VIEW IF EXISTS v_project_budget_health;
CREATE VIEW v_project_budget_health AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  c.name AS client_name,
  p.status AS project_status,
  p.budget_amount,
  p.budget_type,
  p.start_date,
  p.end_date,

  -- Current spending
  COALESCE(labor.total_labor, 0) AS labor_cost,
  COALESCE(exp.total_expenses, 0) AS expense_cost,
  COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0) AS total_spent,

  -- Budget metrics
  CASE
    WHEN p.budget_amount > 0
    THEN ROUND(((COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0)) / p.budget_amount * 100)::numeric, 1)
    ELSE 0
  END AS percent_consumed,
  p.budget_amount - (COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0)) AS remaining_budget,

  -- Time metrics
  CASE
    WHEN p.start_date IS NOT NULL AND p.end_date IS NOT NULL
    THEN ROUND((EXTRACT(EPOCH FROM (CURRENT_DATE - p.start_date)) /
                NULLIF(EXTRACT(EPOCH FROM (p.end_date - p.start_date)), 0) * 100)::numeric, 1)
    ELSE 0
  END AS percent_time_elapsed,

  -- Health score (simple algorithm)
  CASE
    WHEN p.budget_amount = 0 THEN 'no_budget'
    WHEN (COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0)) / p.budget_amount > 1.0 THEN 'over_budget'
    WHEN (COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0)) / p.budget_amount > 0.9 THEN 'at_risk'
    WHEN (COALESCE(labor.total_labor, 0) + COALESCE(exp.total_expenses, 0)) / p.budget_amount > 0.75 THEN 'on_track'
    ELSE 'healthy'
  END AS health_status,

  -- Active alerts
  COALESCE(alerts.alert_count, 0) AS active_alerts,
  alerts.max_severity

FROM projects p
JOIN agency_clients c ON p.client_id = c.id
LEFT JOIN (
  SELECT
    project_id,
    SUM(hours * hourly_rate) AS total_labor
  FROM time_entries
  GROUP BY project_id
) labor ON p.id = labor.project_id
LEFT JOIN (
  SELECT
    project_id,
    SUM(total_amount) AS total_expenses
  FROM expenses
  WHERE status = 'approved'
  GROUP BY project_id
) exp ON p.id = exp.project_id
LEFT JOIN (
  SELECT
    project_id,
    COUNT(*) AS alert_count,
    MAX(CASE severity
      WHEN 'danger' THEN 4
      WHEN 'critical' THEN 3
      WHEN 'warning' THEN 2
      ELSE 1
    END) AS max_severity_num,
    CASE MAX(CASE severity
      WHEN 'danger' THEN 4
      WHEN 'critical' THEN 3
      WHEN 'warning' THEN 2
      ELSE 1
    END)
      WHEN 4 THEN 'danger'
      WHEN 3 THEN 'critical'
      WHEN 2 THEN 'warning'
      ELSE 'info'
    END AS max_severity
  FROM budget_alerts
  WHERE status = 'active'
  GROUP BY project_id
) alerts ON p.id = alerts.project_id
WHERE p.status = 'active';

-- ============================================
-- Functions
-- ============================================

-- Calculate burn rate for a project
CREATE OR REPLACE FUNCTION calculate_project_burn_rate(p_project_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  daily_burn_rate DECIMAL(12, 2),
  weekly_burn_rate DECIMAL(12, 2),
  monthly_burn_rate DECIMAL(12, 2),
  days_to_exhaustion INTEGER,
  projected_completion_cost DECIMAL(12, 2)
) AS $$
DECLARE
  v_total_spent DECIMAL(12, 2);
  v_budget DECIMAL(12, 2);
  v_days_active INTEGER;
  v_daily_rate DECIMAL(12, 2);
  v_remaining DECIMAL(12, 2);
BEGIN
  -- Get budget
  SELECT budget_amount INTO v_budget
  FROM projects WHERE id = p_project_id;

  -- Calculate total spent in period
  SELECT COALESCE(SUM(hours * hourly_rate), 0) INTO v_total_spent
  FROM time_entries
  WHERE project_id = p_project_id
    AND date >= CURRENT_DATE - p_days;

  -- Add expenses
  SELECT v_total_spent + COALESCE(SUM(total_amount), 0) INTO v_total_spent
  FROM expenses
  WHERE project_id = p_project_id
    AND expense_date >= CURRENT_DATE - p_days
    AND status = 'approved';

  -- Calculate rates
  v_daily_rate := v_total_spent / NULLIF(p_days, 0);
  v_remaining := v_budget - (
    SELECT COALESCE(SUM(hours * hourly_rate), 0) FROM time_entries WHERE project_id = p_project_id
  ) - (
    SELECT COALESCE(SUM(total_amount), 0) FROM expenses WHERE project_id = p_project_id AND status = 'approved'
  );

  RETURN QUERY SELECT
    ROUND(v_daily_rate, 2) AS daily_burn_rate,
    ROUND(v_daily_rate * 7, 2) AS weekly_burn_rate,
    ROUND(v_daily_rate * 30, 2) AS monthly_burn_rate,
    CASE WHEN v_daily_rate > 0 THEN FLOOR(v_remaining / v_daily_rate)::INTEGER ELSE NULL END AS days_to_exhaustion,
    ROUND(v_budget + (v_total_spent - v_remaining), 2) AS projected_completion_cost;
END;
$$ LANGUAGE plpgsql;

-- Generate daily budget snapshots (to be run by cron job)
CREATE OR REPLACE FUNCTION generate_daily_budget_snapshots()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_project RECORD;
BEGIN
  FOR v_project IN
    SELECT p.id, p.budget_amount
    FROM projects p
    WHERE p.status = 'active'
  LOOP
    INSERT INTO budget_snapshots (
      project_id,
      snapshot_date,
      budget_amount,
      spent_to_date,
      labor_cost,
      expense_cost
    )
    SELECT
      v_project.id,
      CURRENT_DATE,
      v_project.budget_amount,
      COALESCE(labor.total, 0) + COALESCE(exp.total, 0),
      COALESCE(labor.total, 0),
      COALESCE(exp.total, 0)
    FROM (SELECT 1) AS dummy
    LEFT JOIN (
      SELECT SUM(hours * hourly_rate) AS total
      FROM time_entries WHERE project_id = v_project.id
    ) labor ON true
    LEFT JOIN (
      SELECT SUM(total_amount) AS total
      FROM expenses WHERE project_id = v_project.id AND status = 'approved'
    ) exp ON true
    ON CONFLICT (project_id, snapshot_date) DO UPDATE SET
      spent_to_date = EXCLUDED.spent_to_date,
      labor_cost = EXCLUDED.labor_cost,
      expense_cost = EXCLUDED.expense_cost;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_budget_alert_configs_updated_at BEFORE UPDATE ON budget_alert_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cash_flow_projections_updated_at BEFORE UPDATE ON cash_flow_projections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
