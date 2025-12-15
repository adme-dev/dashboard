-- ============================================
-- Enhanced Time Tracking Schema
-- Extends the base time_entries table with task linking and timers
-- ============================================

-- Add task_id to time_entries for direct task linking
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'));
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES team_members(id);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status);

-- ============================================
-- Active Timers (for start/stop tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS active_timers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  description TEXT,
  billable BOOLEAN DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id) -- Only one active timer per user
);

CREATE INDEX IF NOT EXISTS idx_active_timers_user ON active_timers(user_id);

-- ============================================
-- Timesheet Periods (for weekly/monthly submission)
-- ============================================
CREATE TABLE IF NOT EXISTS timesheet_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'approved', 'rejected', 'locked')),
  total_hours DECIMAL(6, 2) DEFAULT 0,
  billable_hours DECIMAL(6, 2) DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES team_members(id),
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_periods_user ON timesheet_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_periods_status ON timesheet_periods(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_periods_dates ON timesheet_periods(period_start, period_end);

-- ============================================
-- Utilization Targets (team/individual targets)
-- ============================================
CREATE TABLE IF NOT EXISTS utilization_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES team_members(id) ON DELETE CASCADE, -- NULL for org-wide default
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for org-wide default
  target_billable_percent DECIMAL(5, 2) DEFAULT 75.00, -- 75% billable target
  target_weekly_hours DECIMAL(5, 2) DEFAULT 40.00,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utilization_targets_user ON utilization_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_utilization_targets_dept ON utilization_targets(department_id);

-- ============================================
-- Enhanced Utilization View
-- ============================================
DROP VIEW IF EXISTS v_utilization_detailed;
CREATE OR REPLACE VIEW v_utilization_detailed AS
SELECT
  tm.id AS user_id,
  tm.name AS user_name,
  tm.email AS user_email,
  d.id AS department_id,
  d.name AS department_name,
  DATE_TRUNC('week', te.date)::DATE AS week_start,
  TO_CHAR(te.date, 'YYYY-MM') AS period,
  SUM(te.hours) AS total_hours,
  SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END) AS billable_hours,
  SUM(CASE WHEN NOT te.billable THEN te.hours ELSE 0 END) AS non_billable_hours,
  CASE
    WHEN SUM(te.hours) > 0
    THEN ROUND((SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END) / SUM(te.hours) * 100)::numeric, 1)
    ELSE 0
  END AS utilization_rate,
  COALESCE(ut.target_billable_percent, tm.target_utilization, 75) AS target_utilization,
  SUM(te.hours * te.hourly_rate) AS total_value,
  SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END) AS billable_value,
  COUNT(DISTINCT te.project_id) AS projects_worked,
  COUNT(DISTINCT te.task_id) AS tasks_worked,
  COUNT(te.id) AS entry_count
FROM team_members tm
LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
LEFT JOIN departments d ON dm.department_id = d.id
LEFT JOIN time_entries te ON tm.id = te.user_id
LEFT JOIN utilization_targets ut ON (
  ut.user_id = tm.id OR
  (ut.user_id IS NULL AND ut.department_id = d.id) OR
  (ut.user_id IS NULL AND ut.department_id IS NULL)
)
WHERE tm.is_active = true
GROUP BY tm.id, tm.name, tm.email, tm.target_utilization, d.id, d.name, DATE_TRUNC('week', te.date), TO_CHAR(te.date, 'YYYY-MM'), ut.target_billable_percent;

-- ============================================
-- Project Time Summary View
-- ============================================
DROP VIEW IF EXISTS v_project_time_summary;
CREATE OR REPLACE VIEW v_project_time_summary AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  c.id AS client_id,
  c.name AS client_name,
  p.budget_amount AS budget,
  p.budget_type,
  p.status AS project_status,
  COALESCE(SUM(te.hours), 0) AS total_hours,
  COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours,
  COALESCE(SUM(CASE WHEN NOT te.billable THEN te.hours ELSE 0 END), 0) AS non_billable_hours,
  COALESCE(SUM(te.hours * te.hourly_rate), 0) AS total_labor_cost,
  COALESCE(SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END), 0) AS billable_labor_cost,
  -- Budget tracking for time & materials
  CASE
    WHEN p.budget_type = 'time_materials' AND p.budget_amount > 0
    THEN ROUND((COALESCE(SUM(te.hours * te.hourly_rate), 0) / p.budget_amount * 100)::numeric, 1)
    ELSE 0
  END AS budget_consumed_percent,
  p.budget_amount - COALESCE(SUM(te.hours * te.hourly_rate), 0) AS budget_remaining,
  COUNT(DISTINCT te.user_id) AS team_members_involved,
  COUNT(DISTINCT te.task_id) AS tasks_tracked,
  MIN(te.date) AS first_entry_date,
  MAX(te.date) AS last_entry_date
FROM projects p
JOIN agency_clients c ON p.client_id = c.id
LEFT JOIN time_entries te ON p.id = te.project_id
GROUP BY p.id, p.name, c.id, c.name, p.budget_amount, p.budget_type, p.status;

-- ============================================
-- Weekly Timesheet View
-- ============================================
DROP VIEW IF EXISTS v_weekly_timesheet;
CREATE OR REPLACE VIEW v_weekly_timesheet AS
SELECT
  te.user_id,
  tm.name AS user_name,
  DATE_TRUNC('week', te.date)::DATE AS week_start,
  (DATE_TRUNC('week', te.date) + INTERVAL '6 days')::DATE AS week_end,
  te.date,
  EXTRACT(DOW FROM te.date) AS day_of_week, -- 0=Sunday, 1=Monday, etc.
  te.id AS entry_id,
  te.project_id,
  p.name AS project_name,
  te.task_id,
  t.title AS task_title,
  te.hours,
  te.billable,
  te.hourly_rate,
  te.hours * te.hourly_rate AS value,
  te.description,
  te.notes,
  te.status AS entry_status,
  te.approved,
  te.invoiced
FROM time_entries te
JOIN team_members tm ON te.user_id = tm.id
LEFT JOIN projects p ON te.project_id = p.id
LEFT JOIN tasks t ON te.task_id = t.id
ORDER BY te.user_id, te.date, te.created_at;

-- ============================================
-- Triggers
-- ============================================

-- Update task actual_hours when time entries change (now with task_id support)
CREATE OR REPLACE FUNCTION update_task_actual_hours_v2()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the specific task's actual_hours
  IF NEW.task_id IS NOT NULL THEN
    UPDATE tasks SET actual_hours = (
      SELECT COALESCE(SUM(hours), 0)
      FROM time_entries
      WHERE task_id = NEW.task_id
    )
    WHERE id = NEW.task_id;
  END IF;

  -- Also update project hours if project_id exists
  IF NEW.project_id IS NOT NULL THEN
    UPDATE projects SET
      updated_at = NOW()
    WHERE id = NEW.project_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_hours_v2 ON time_entries;
CREATE TRIGGER trigger_update_task_hours_v2
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_task_actual_hours_v2();

-- Update timesheet period totals
CREATE OR REPLACE FUNCTION update_timesheet_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE timesheet_periods tp
  SET
    total_hours = COALESCE((
      SELECT SUM(hours)
      FROM time_entries
      WHERE user_id = tp.user_id
        AND date >= tp.period_start
        AND date <= tp.period_end
    ), 0),
    billable_hours = COALESCE((
      SELECT SUM(hours)
      FROM time_entries
      WHERE user_id = tp.user_id
        AND date >= tp.period_start
        AND date <= tp.period_end
        AND billable = true
    ), 0),
    updated_at = NOW()
  WHERE (NEW IS NOT NULL AND tp.user_id = NEW.user_id AND NEW.date >= tp.period_start AND NEW.date <= tp.period_end)
     OR (OLD IS NOT NULL AND tp.user_id = OLD.user_id AND OLD.date >= tp.period_start AND OLD.date <= tp.period_end);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_timesheet_totals ON time_entries;
CREATE TRIGGER trigger_update_timesheet_totals
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION update_timesheet_totals();
