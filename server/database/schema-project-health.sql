-- ============================================
-- Project Health Dashboard Schema
-- Real-time project health scoring and tracking
-- ============================================

-- ============================================
-- Health Factor Configuration
-- ============================================
CREATE TABLE IF NOT EXISTS health_factor_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Factor definition
  factor_name VARCHAR(100) NOT NULL UNIQUE,
  factor_key VARCHAR(50) NOT NULL UNIQUE, -- 'schedule', 'budget', 'scope', 'quality', 'team'
  description TEXT,

  -- Scoring weights (should sum to 1.0 across all factors)
  weight DECIMAL(3, 2) NOT NULL DEFAULT 0.20,

  -- Thresholds (0-100 scale)
  healthy_threshold INTEGER DEFAULT 70, -- >= this is healthy
  warning_threshold INTEGER DEFAULT 40, -- >= this but < healthy is warning
  -- Below warning is critical

  -- Display
  icon VARCHAR(50),
  color_healthy VARCHAR(7) DEFAULT '#22C55E', -- green
  color_warning VARCHAR(7) DEFAULT '#F59E0B', -- amber
  color_critical VARCHAR(7) DEFAULT '#EF4444', -- red

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default health factors
INSERT INTO health_factor_config (factor_name, factor_key, description, weight, healthy_threshold, warning_threshold, icon, sort_order) VALUES
  ('Schedule Health', 'schedule', 'On-time delivery and milestone completion', 0.25, 70, 40, 'calendar', 1),
  ('Budget Health', 'budget', 'Budget utilization and burn rate', 0.25, 70, 40, 'dollar-sign', 2),
  ('Scope Health', 'scope', 'Scope creep and change request management', 0.20, 70, 40, 'layers', 3),
  ('Team Health', 'team', 'Resource allocation and utilization', 0.15, 70, 40, 'users', 4),
  ('Quality Health', 'quality', 'Bug rate, rework, and deliverable acceptance', 0.15, 70, 40, 'award', 5)
ON CONFLICT (factor_key) DO NOTHING;

-- ============================================
-- Project Health Snapshots (Daily Calculations)
-- ============================================
CREATE TABLE IF NOT EXISTS project_health_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Snapshot date
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Overall health (0-100)
  overall_score INTEGER NOT NULL,
  overall_status VARCHAR(20) NOT NULL CHECK (overall_status IN ('healthy', 'warning', 'critical', 'unknown')),

  -- Individual factor scores (0-100)
  schedule_score INTEGER,
  budget_score INTEGER,
  scope_score INTEGER,
  team_score INTEGER,
  quality_score INTEGER,

  -- Raw metrics used for calculation
  metrics JSONB NOT NULL DEFAULT '{}',
  /*
  Example metrics:
  {
    "schedule": {
      "total_tasks": 50,
      "completed_tasks": 30,
      "overdue_tasks": 5,
      "days_remaining": 15,
      "milestone_completion_rate": 0.75
    },
    "budget": {
      "budget_total": 50000,
      "budget_spent": 35000,
      "budget_remaining": 15000,
      "burn_rate_daily": 1500,
      "projected_spend": 57500,
      "budget_variance_percent": -15
    },
    "scope": {
      "original_scope_items": 45,
      "current_scope_items": 52,
      "scope_change_percent": 15.5,
      "approved_changes": 5,
      "pending_changes": 2
    },
    "team": {
      "allocated_members": 5,
      "avg_utilization": 82,
      "overloaded_members": 1,
      "underutilized_members": 0
    },
    "quality": {
      "total_deliverables": 20,
      "approved_deliverables": 15,
      "rejected_deliverables": 2,
      "pending_review": 3,
      "approval_rate": 0.88
    }
  }
  */

  -- Trend indicators
  trend VARCHAR(20) CHECK (trend IN ('improving', 'stable', 'declining')),
  previous_score INTEGER,

  -- Calculation metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_project ON project_health_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_date ON project_health_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_status ON project_health_snapshots(overall_status);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_project_date ON project_health_snapshots(project_id, snapshot_date DESC);

-- ============================================
-- Health Alerts
-- ============================================
CREATE TABLE IF NOT EXISTS health_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Alert details
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
    'status_change', 'threshold_breach', 'trend_warning',
    'budget_critical', 'schedule_slip', 'scope_creep',
    'team_overload', 'quality_decline'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  -- Related factor
  factor_key VARCHAR(50),
  factor_score INTEGER,
  threshold_breached INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT true,
  acknowledged_by UUID REFERENCES team_members(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_alerts_project ON health_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_health_alerts_active ON health_alerts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_health_alerts_type ON health_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_health_alerts_severity ON health_alerts(severity);

-- ============================================
-- Views
-- ============================================

-- Current Project Health (latest snapshot)
DROP VIEW IF EXISTS v_project_health_current;
CREATE VIEW v_project_health_current AS
SELECT DISTINCT ON (phs.project_id)
  phs.project_id,
  p.name AS project_name,
  p.status AS project_status,
  c.id AS client_id,
  c.name AS client_name,
  pm.id AS project_manager_id,
  pm.name AS project_manager_name,
  p.budget_amount,
  p.start_date,
  p.end_date,
  phs.snapshot_date,
  phs.overall_score,
  phs.overall_status,
  phs.schedule_score,
  phs.budget_score,
  phs.scope_score,
  phs.team_score,
  phs.quality_score,
  phs.trend,
  phs.previous_score,
  phs.metrics,
  phs.calculated_at,
  COALESCE(alerts.active_count, 0) AS active_alerts,
  COALESCE(alerts.critical_count, 0) AS critical_alerts
FROM project_health_snapshots phs
JOIN projects p ON phs.project_id = p.id
LEFT JOIN agency_clients c ON p.client_id = c.id
LEFT JOIN team_members pm ON p.project_manager_id = pm.id
LEFT JOIN (
  SELECT
    project_id,
    COUNT(*) FILTER (WHERE is_active) AS active_count,
    COUNT(*) FILTER (WHERE is_active AND severity = 'critical') AS critical_count
  FROM health_alerts
  GROUP BY project_id
) alerts ON phs.project_id = alerts.project_id
WHERE p.status IN ('active', 'on_hold')
ORDER BY phs.project_id, phs.snapshot_date DESC;

-- Portfolio Health Summary
DROP VIEW IF EXISTS v_portfolio_health_summary;
CREATE VIEW v_portfolio_health_summary AS
SELECT
  COUNT(*) AS total_projects,
  COUNT(*) FILTER (WHERE overall_status = 'healthy') AS healthy_count,
  COUNT(*) FILTER (WHERE overall_status = 'warning') AS warning_count,
  COUNT(*) FILTER (WHERE overall_status = 'critical') AS critical_count,
  ROUND(AVG(overall_score)::numeric, 1) AS avg_health_score,
  ROUND(AVG(schedule_score)::numeric, 1) AS avg_schedule_score,
  ROUND(AVG(budget_score)::numeric, 1) AS avg_budget_score,
  ROUND(AVG(scope_score)::numeric, 1) AS avg_scope_score,
  ROUND(AVG(team_score)::numeric, 1) AS avg_team_score,
  ROUND(AVG(quality_score)::numeric, 1) AS avg_quality_score,
  COUNT(*) FILTER (WHERE trend = 'improving') AS improving_count,
  COUNT(*) FILTER (WHERE trend = 'stable') AS stable_count,
  COUNT(*) FILTER (WHERE trend = 'declining') AS declining_count
FROM v_project_health_current;

-- At-Risk Projects
DROP VIEW IF EXISTS v_at_risk_projects;
CREATE VIEW v_at_risk_projects AS
SELECT
  project_id,
  project_name,
  client_name,
  project_manager_name,
  overall_score,
  overall_status,
  trend,
  active_alerts,
  critical_alerts,
  schedule_score,
  budget_score,
  scope_score,
  team_score,
  quality_score,
  metrics,
  -- Calculate risk score (lower is higher risk)
  CASE
    WHEN overall_status = 'critical' THEN 1
    WHEN overall_status = 'warning' AND trend = 'declining' THEN 2
    WHEN overall_status = 'warning' THEN 3
    WHEN trend = 'declining' THEN 4
    ELSE 5
  END AS risk_priority
FROM v_project_health_current
WHERE overall_status IN ('warning', 'critical')
   OR trend = 'declining'
   OR critical_alerts > 0
ORDER BY risk_priority, overall_score;

-- Health Trends (last 30 days)
DROP VIEW IF EXISTS v_project_health_trends;
CREATE VIEW v_project_health_trends AS
SELECT
  phs.project_id,
  p.name AS project_name,
  phs.snapshot_date,
  phs.overall_score,
  phs.overall_status,
  phs.schedule_score,
  phs.budget_score,
  phs.scope_score,
  phs.team_score,
  phs.quality_score
FROM project_health_snapshots phs
JOIN projects p ON phs.project_id = p.id
WHERE phs.snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY phs.project_id, phs.snapshot_date DESC;

-- ============================================
-- Functions
-- ============================================

-- Calculate project health score
CREATE OR REPLACE FUNCTION calculate_project_health(p_project_id UUID)
RETURNS TABLE (
  overall_score INTEGER,
  overall_status VARCHAR(20),
  schedule_score INTEGER,
  budget_score INTEGER,
  scope_score INTEGER,
  team_score INTEGER,
  quality_score INTEGER,
  metrics JSONB
) AS $$
DECLARE
  v_project RECORD;
  v_metrics JSONB := '{}';
  v_schedule_score INTEGER := 100;
  v_budget_score INTEGER := 100;
  v_scope_score INTEGER := 100;
  v_team_score INTEGER := 100;
  v_quality_score INTEGER := 100;
  v_overall_score INTEGER;
  v_overall_status VARCHAR(20);
  v_task_stats RECORD;
  v_budget_stats RECORD;
  v_team_stats RECORD;
BEGIN
  -- Get project details
  SELECT * INTO v_project FROM projects WHERE id = p_project_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate Schedule Score
  SELECT
    COUNT(*) AS total_tasks,
    COUNT(*) FILTER (WHERE ts.is_final = true) AS completed_tasks,
    COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND ts.is_final = false) AS overdue_tasks,
    COUNT(*) FILTER (WHERE t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND ts.is_final = false) AS due_soon
  INTO v_task_stats
  FROM tasks t
  JOIN task_statuses ts ON t.status_id = ts.id
  WHERE t.project_id = p_project_id;

  IF COALESCE(v_task_stats.total_tasks, 0) > 0 THEN
    v_schedule_score := GREATEST(0, LEAST(100,
      100 - (COALESCE(v_task_stats.overdue_tasks, 0) * 15) -- -15 per overdue task
      + (COALESCE(v_task_stats.completed_tasks, 0)::float / v_task_stats.total_tasks * 30) -- +30 for completion
    ))::INTEGER;
  END IF;

  v_metrics := v_metrics || jsonb_build_object('schedule', jsonb_build_object(
    'total_tasks', COALESCE(v_task_stats.total_tasks, 0),
    'completed_tasks', COALESCE(v_task_stats.completed_tasks, 0),
    'overdue_tasks', COALESCE(v_task_stats.overdue_tasks, 0),
    'due_soon', COALESCE(v_task_stats.due_soon, 0)
  ));

  -- Calculate Budget Score
  SELECT
    COALESCE(SUM(te.hours * te.hourly_rate), 0) AS labor_spent,
    COALESCE(SUM(pe.amount), 0) AS expense_spent
  INTO v_budget_stats
  FROM projects p
  LEFT JOIN time_entries te ON p.id = te.project_id
  LEFT JOIN project_expenses pe ON p.id = pe.project_id
  WHERE p.id = p_project_id;

  IF v_project.budget_amount > 0 THEN
    DECLARE
      v_total_spent DECIMAL;
      v_budget_percent DECIMAL;
    BEGIN
      v_total_spent := COALESCE(v_budget_stats.labor_spent, 0) + COALESCE(v_budget_stats.expense_spent, 0);
      v_budget_percent := (v_total_spent / v_project.budget_amount * 100);

      -- Score based on budget utilization
      v_budget_score := GREATEST(0, LEAST(100, CASE
        WHEN v_budget_percent <= 75 THEN 100
        WHEN v_budget_percent <= 90 THEN 85
        WHEN v_budget_percent <= 100 THEN 70
        WHEN v_budget_percent <= 110 THEN 50
        WHEN v_budget_percent <= 125 THEN 30
        ELSE 10
      END))::INTEGER;

      v_metrics := v_metrics || jsonb_build_object('budget', jsonb_build_object(
        'budget_total', v_project.budget_amount,
        'budget_spent', v_total_spent,
        'budget_percent', ROUND(v_budget_percent::numeric, 1),
        'budget_remaining', v_project.budget_amount - v_total_spent
      ));
    END;
  END IF;

  -- Calculate Team Score (based on utilization)
  SELECT
    COUNT(DISTINCT te.user_id) AS team_members,
    AVG(te.hours) AS avg_daily_hours
  INTO v_team_stats
  FROM time_entries te
  WHERE te.project_id = p_project_id
    AND te.date >= CURRENT_DATE - 14;

  v_team_score := 80; -- Default score
  v_metrics := v_metrics || jsonb_build_object('team', jsonb_build_object(
    'active_members', COALESCE(v_team_stats.team_members, 0)
  ));

  -- Scope and Quality scores default to 80 (would need more data)
  v_scope_score := 80;
  v_quality_score := 80;

  -- Calculate overall score (weighted average)
  v_overall_score := (
    v_schedule_score * 0.25 +
    v_budget_score * 0.25 +
    v_scope_score * 0.20 +
    v_team_score * 0.15 +
    v_quality_score * 0.15
  )::INTEGER;

  -- Determine status
  v_overall_status := CASE
    WHEN v_overall_score >= 70 THEN 'healthy'
    WHEN v_overall_score >= 40 THEN 'warning'
    ELSE 'critical'
  END;

  RETURN QUERY SELECT
    v_overall_score,
    v_overall_status,
    v_schedule_score,
    v_budget_score,
    v_scope_score,
    v_team_score,
    v_quality_score,
    v_metrics;
END;
$$ LANGUAGE plpgsql;

-- Create health snapshot for a project
CREATE OR REPLACE FUNCTION create_health_snapshot(p_project_id UUID)
RETURNS UUID AS $$
DECLARE
  v_health RECORD;
  v_previous RECORD;
  v_snapshot_id UUID;
  v_trend VARCHAR(20);
BEGIN
  -- Calculate current health
  SELECT * INTO v_health FROM calculate_project_health(p_project_id);

  IF v_health IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get previous snapshot for trend
  SELECT overall_score INTO v_previous
  FROM project_health_snapshots
  WHERE project_id = p_project_id
    AND snapshot_date < CURRENT_DATE
  ORDER BY snapshot_date DESC
  LIMIT 1;

  -- Calculate trend
  v_trend := CASE
    WHEN v_previous IS NULL THEN 'stable'
    WHEN v_health.overall_score > v_previous.overall_score + 5 THEN 'improving'
    WHEN v_health.overall_score < v_previous.overall_score - 5 THEN 'declining'
    ELSE 'stable'
  END;

  -- Insert or update snapshot
  INSERT INTO project_health_snapshots (
    project_id,
    snapshot_date,
    overall_score,
    overall_status,
    schedule_score,
    budget_score,
    scope_score,
    team_score,
    quality_score,
    metrics,
    trend,
    previous_score
  ) VALUES (
    p_project_id,
    CURRENT_DATE,
    v_health.overall_score,
    v_health.overall_status,
    v_health.schedule_score,
    v_health.budget_score,
    v_health.scope_score,
    v_health.team_score,
    v_health.quality_score,
    v_health.metrics,
    v_trend,
    v_previous.overall_score
  )
  ON CONFLICT (project_id, snapshot_date) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    overall_status = EXCLUDED.overall_status,
    schedule_score = EXCLUDED.schedule_score,
    budget_score = EXCLUDED.budget_score,
    scope_score = EXCLUDED.scope_score,
    team_score = EXCLUDED.team_score,
    quality_score = EXCLUDED.quality_score,
    metrics = EXCLUDED.metrics,
    trend = EXCLUDED.trend,
    previous_score = EXCLUDED.previous_score,
    calculated_at = NOW()
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_health_factor_config_updated_at BEFORE UPDATE ON health_factor_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
