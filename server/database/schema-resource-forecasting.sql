-- ============================================
-- Resource Forecasting & Capacity Planning Schema
-- Forward-looking team capacity management
-- ============================================

-- ============================================
-- Team Member Skills
-- ============================================
CREATE TABLE IF NOT EXISTS team_member_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,

  skill_name VARCHAR(100) NOT NULL,
  skill_category VARCHAR(50), -- 'design', 'development', 'strategy', 'management', etc.
  proficiency_level VARCHAR(20) DEFAULT 'intermediate' CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  years_experience DECIMAL(4, 1),
  is_primary BOOLEAN DEFAULT false, -- Primary skills for this member
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_member_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_team_member_skills_member ON team_member_skills(team_member_id);
CREATE INDEX IF NOT EXISTS idx_team_member_skills_category ON team_member_skills(skill_category);
CREATE INDEX IF NOT EXISTS idx_team_member_skills_primary ON team_member_skills(is_primary) WHERE is_primary = true;

-- ============================================
-- Capacity Adjustments (PTO, holidays, reduced availability)
-- ============================================
CREATE TABLE IF NOT EXISTS capacity_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE, -- NULL for company-wide
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for individual or company-wide

  -- Adjustment type
  adjustment_type VARCHAR(50) NOT NULL CHECK (adjustment_type IN (
    'pto', 'sick_leave', 'holiday', 'training', 'conference',
    'reduced_hours', 'increased_hours', 'leave_of_absence', 'other'
  )),

  -- Date range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Hours impact
  hours_per_day DECIMAL(4, 2) DEFAULT 8, -- Normal hours
  adjusted_hours_per_day DECIMAL(4, 2) DEFAULT 0, -- Adjusted hours (0 for full day off)
  is_recurring BOOLEAN DEFAULT false, -- For recurring adjustments
  recurrence_pattern VARCHAR(50), -- 'weekly', 'monthly', 'yearly'

  -- Details
  title VARCHAR(255),
  description TEXT,
  is_approved BOOLEAN DEFAULT true,
  approved_by UUID REFERENCES team_members(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_capacity_adjustments_member ON capacity_adjustments(team_member_id);
CREATE INDEX IF NOT EXISTS idx_capacity_adjustments_dates ON capacity_adjustments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_capacity_adjustments_type ON capacity_adjustments(adjustment_type);

-- ============================================
-- Resource Forecasts (Weekly snapshots)
-- ============================================
CREATE TABLE IF NOT EXISTS resource_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,

  -- Week identifier
  week_start DATE NOT NULL, -- Monday of the week
  week_end DATE NOT NULL, -- Sunday of the week

  -- Capacity (hours available)
  base_capacity_hours DECIMAL(5, 2) DEFAULT 40, -- Standard work week
  adjusted_capacity_hours DECIMAL(5, 2), -- After PTO/adjustments
  available_hours DECIMAL(5, 2), -- After committed work

  -- Committed work (from assigned tasks)
  committed_hours DECIMAL(5, 2) DEFAULT 0, -- From tasks with due dates in this week
  tentative_hours DECIMAL(5, 2) DEFAULT 0, -- From pipeline/proposals

  -- Utilization
  planned_utilization DECIMAL(5, 2), -- (committed + tentative) / adjusted_capacity * 100
  target_utilization DECIMAL(5, 2) DEFAULT 80, -- Target utilization %

  -- Status indicators
  capacity_status VARCHAR(20) CHECK (capacity_status IN ('available', 'balanced', 'busy', 'overloaded')),
  /*
    available: < 60% utilization
    balanced: 60-85% utilization
    busy: 85-100% utilization
    overloaded: > 100% utilization
  */

  -- Breakdown by project (JSONB for flexibility)
  project_breakdown JSONB DEFAULT '[]',
  /*
  [
    {"project_id": "uuid", "project_name": "Website Redesign", "hours": 16, "is_tentative": false},
    {"project_id": "uuid", "project_name": "Marketing Campaign", "hours": 8, "is_tentative": true}
  ]
  */

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_member_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_resource_forecasts_member ON resource_forecasts(team_member_id);
CREATE INDEX IF NOT EXISTS idx_resource_forecasts_week ON resource_forecasts(week_start);
CREATE INDEX IF NOT EXISTS idx_resource_forecasts_status ON resource_forecasts(capacity_status);
CREATE INDEX IF NOT EXISTS idx_resource_forecasts_member_week ON resource_forecasts(team_member_id, week_start);

-- ============================================
-- Department Forecasts (Aggregated)
-- ============================================
CREATE TABLE IF NOT EXISTS department_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

  -- Week identifier
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,

  -- Aggregated capacity
  total_capacity_hours DECIMAL(6, 2),
  total_committed_hours DECIMAL(6, 2),
  total_available_hours DECIMAL(6, 2),
  avg_utilization DECIMAL(5, 2),

  -- Team breakdown
  team_member_count INTEGER,
  overloaded_count INTEGER,
  available_count INTEGER,

  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(department_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_department_forecasts_dept ON department_forecasts(department_id);
CREATE INDEX IF NOT EXISTS idx_department_forecasts_week ON department_forecasts(week_start);

-- ============================================
-- Views
-- ============================================

-- Current Week Capacity
DROP VIEW IF EXISTS v_current_week_capacity;
CREATE VIEW v_current_week_capacity AS
SELECT
  rf.team_member_id,
  tm.name AS team_member_name,
  tm.email AS team_member_email,
  d.id AS department_id,
  d.name AS department_name,
  rf.week_start,
  rf.week_end,
  rf.base_capacity_hours,
  rf.adjusted_capacity_hours,
  rf.committed_hours,
  rf.tentative_hours,
  rf.available_hours,
  rf.planned_utilization,
  rf.target_utilization,
  rf.capacity_status,
  rf.project_breakdown,
  rf.calculated_at
FROM resource_forecasts rf
JOIN team_members tm ON rf.team_member_id = tm.id
LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
LEFT JOIN departments d ON dm.department_id = d.id
WHERE rf.week_start = DATE_TRUNC('week', CURRENT_DATE)::DATE
  AND tm.is_active = true;

-- Team Capacity Heatmap (next 8 weeks)
DROP VIEW IF EXISTS v_capacity_heatmap;
CREATE VIEW v_capacity_heatmap AS
SELECT
  rf.team_member_id,
  tm.name AS team_member_name,
  d.name AS department_name,
  rf.week_start,
  rf.planned_utilization,
  rf.capacity_status,
  rf.available_hours,
  rf.committed_hours
FROM resource_forecasts rf
JOIN team_members tm ON rf.team_member_id = tm.id
LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
LEFT JOIN departments d ON dm.department_id = d.id
WHERE rf.week_start >= DATE_TRUNC('week', CURRENT_DATE)::DATE
  AND rf.week_start < DATE_TRUNC('week', CURRENT_DATE)::DATE + INTERVAL '8 weeks'
  AND tm.is_active = true
ORDER BY tm.name, rf.week_start;

-- Available Resources (for assignment)
DROP VIEW IF EXISTS v_available_resources;
CREATE VIEW v_available_resources AS
SELECT
  rf.team_member_id,
  tm.name AS team_member_name,
  tm.email AS team_member_email,
  tm.default_hourly_rate,
  d.id AS department_id,
  d.name AS department_name,
  rf.week_start,
  rf.available_hours,
  rf.planned_utilization,
  rf.capacity_status,
  ARRAY_AGG(DISTINCT tms.skill_name) FILTER (WHERE tms.skill_name IS NOT NULL) AS skills
FROM resource_forecasts rf
JOIN team_members tm ON rf.team_member_id = tm.id
LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
LEFT JOIN departments d ON dm.department_id = d.id
LEFT JOIN team_member_skills tms ON tm.id = tms.team_member_id
WHERE rf.week_start >= DATE_TRUNC('week', CURRENT_DATE)::DATE
  AND rf.available_hours > 0
  AND tm.is_active = true
GROUP BY rf.team_member_id, tm.name, tm.email, tm.default_hourly_rate,
         d.id, d.name, rf.week_start, rf.available_hours, rf.planned_utilization, rf.capacity_status
ORDER BY rf.available_hours DESC;

-- Upcoming Time Off
DROP VIEW IF EXISTS v_upcoming_time_off;
CREATE VIEW v_upcoming_time_off AS
SELECT
  ca.id,
  ca.team_member_id,
  tm.name AS team_member_name,
  d.name AS department_name,
  ca.adjustment_type,
  ca.title,
  ca.start_date,
  ca.end_date,
  ca.adjusted_hours_per_day,
  (ca.end_date - ca.start_date + 1) AS total_days,
  (ca.end_date - ca.start_date + 1) * (ca.hours_per_day - ca.adjusted_hours_per_day) AS hours_impact
FROM capacity_adjustments ca
JOIN team_members tm ON ca.team_member_id = tm.id
LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
LEFT JOIN departments d ON dm.department_id = d.id
WHERE ca.start_date >= CURRENT_DATE
  AND ca.is_approved = true
ORDER BY ca.start_date;

-- ============================================
-- Functions
-- ============================================

-- Calculate resource forecast for a team member
CREATE OR REPLACE FUNCTION calculate_member_forecast(
  p_team_member_id UUID,
  p_week_start DATE
)
RETURNS UUID AS $$
DECLARE
  v_member RECORD;
  v_week_end DATE;
  v_base_capacity DECIMAL := 40;
  v_adjusted_capacity DECIMAL;
  v_committed DECIMAL := 0;
  v_tentative DECIMAL := 0;
  v_available DECIMAL;
  v_utilization DECIMAL;
  v_status VARCHAR(20);
  v_adjustments DECIMAL := 0;
  v_project_breakdown JSONB := '[]';
  v_forecast_id UUID;
BEGIN
  -- Get team member
  SELECT * INTO v_member FROM team_members WHERE id = p_team_member_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_week_end := p_week_start + 6;

  -- Calculate adjustments (PTO, etc.)
  SELECT COALESCE(SUM(
    (LEAST(ca.end_date, v_week_end) - GREATEST(ca.start_date, p_week_start) + 1) *
    (ca.hours_per_day - ca.adjusted_hours_per_day)
  ), 0)
  INTO v_adjustments
  FROM capacity_adjustments ca
  WHERE (ca.team_member_id = p_team_member_id OR ca.team_member_id IS NULL)
    AND ca.is_approved = true
    AND ca.start_date <= v_week_end
    AND ca.end_date >= p_week_start;

  v_adjusted_capacity := GREATEST(0, v_base_capacity - v_adjustments);

  -- Calculate committed hours from tasks
  SELECT COALESCE(SUM(t.estimated_hours), 0)
  INTO v_committed
  FROM tasks t
  JOIN task_statuses ts ON t.status_id = ts.id
  WHERE t.assignee_id = p_team_member_id
    AND ts.is_final = false
    AND t.due_date >= p_week_start
    AND t.due_date <= v_week_end;

  -- Build project breakdown
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'project_id', p.id,
      'project_name', p.name,
      'hours', sub.hours,
      'is_tentative', false
    )
  ), '[]')
  INTO v_project_breakdown
  FROM (
    SELECT t.project_id, SUM(t.estimated_hours) AS hours
    FROM tasks t
    JOIN task_statuses ts ON t.status_id = ts.id
    WHERE t.assignee_id = p_team_member_id
      AND ts.is_final = false
      AND t.due_date >= p_week_start
      AND t.due_date <= v_week_end
      AND t.project_id IS NOT NULL
    GROUP BY t.project_id
  ) sub
  JOIN projects p ON sub.project_id = p.id;

  -- Calculate metrics
  v_available := GREATEST(0, v_adjusted_capacity - v_committed - v_tentative);

  IF v_adjusted_capacity > 0 THEN
    v_utilization := ((v_committed + v_tentative) / v_adjusted_capacity * 100);
  ELSE
    v_utilization := 0;
  END IF;

  -- Determine status
  v_status := CASE
    WHEN v_utilization < 60 THEN 'available'
    WHEN v_utilization < 85 THEN 'balanced'
    WHEN v_utilization <= 100 THEN 'busy'
    ELSE 'overloaded'
  END;

  -- Insert or update forecast
  INSERT INTO resource_forecasts (
    team_member_id,
    week_start,
    week_end,
    base_capacity_hours,
    adjusted_capacity_hours,
    committed_hours,
    tentative_hours,
    available_hours,
    planned_utilization,
    target_utilization,
    capacity_status,
    project_breakdown,
    calculated_at
  ) VALUES (
    p_team_member_id,
    p_week_start,
    v_week_end,
    v_base_capacity,
    v_adjusted_capacity,
    v_committed,
    v_tentative,
    v_available,
    ROUND(v_utilization::numeric, 1),
    COALESCE(v_member.target_utilization, 80),
    v_status,
    v_project_breakdown,
    NOW()
  )
  ON CONFLICT (team_member_id, week_start) DO UPDATE SET
    week_end = EXCLUDED.week_end,
    adjusted_capacity_hours = EXCLUDED.adjusted_capacity_hours,
    committed_hours = EXCLUDED.committed_hours,
    tentative_hours = EXCLUDED.tentative_hours,
    available_hours = EXCLUDED.available_hours,
    planned_utilization = EXCLUDED.planned_utilization,
    capacity_status = EXCLUDED.capacity_status,
    project_breakdown = EXCLUDED.project_breakdown,
    calculated_at = NOW()
  RETURNING id INTO v_forecast_id;

  RETURN v_forecast_id;
END;
$$ LANGUAGE plpgsql;

-- Generate forecasts for all active team members
CREATE OR REPLACE FUNCTION generate_all_forecasts(p_weeks_ahead INTEGER DEFAULT 8)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_member RECORD;
  v_week_start DATE;
  v_i INTEGER;
BEGIN
  -- Get Monday of current week
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;

  -- For each active team member
  FOR v_member IN SELECT id FROM team_members WHERE is_active = true
  LOOP
    -- For each week
    FOR v_i IN 0..(p_weeks_ahead - 1)
    LOOP
      PERFORM calculate_member_forecast(v_member.id, v_week_start + (v_i * 7));
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_team_member_skills_updated_at BEFORE UPDATE ON team_member_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_capacity_adjustments_updated_at BEFORE UPDATE ON capacity_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
