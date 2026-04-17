-- 067: Swap ts.is_final → t.status_is_final inside live views and functions.
--
-- Migration 066 added the denormalized tasks.status_is_final column and partial index,
-- and rewrote endpoint SQL. But three in-DB objects still filter via the joined
-- task_statuses row, blocking predicate pushdown:
--
--   - calculate_project_health()   (function)  — filter
--   - calculate_member_forecast()  (function)  — filter (x2)
--   - v_task_timeline              (view)      — projection (cosmetic; rewritten for consistency)
--
-- Redefined below. Bodies are otherwise byte-identical to the current live versions.

-- ---------------------------------------------------------------------------
-- v_task_timeline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_task_timeline AS
SELECT
  t.id,
  t.title,
  t.department_id,
  t.project_id,
  t.assignee_id,
  t.priority,
  t.task_type,
  COALESCE(t.start_date, t.created_at::date) AS start_date,
  COALESCE(
    t.due_date::timestamp without time zone,
    t.start_date + INTERVAL '7 days',
    t.created_at::date + INTERVAL '7 days'
  ) AS end_date,
  t.progress_percentage,
  t.estimated_hours,
  t.actual_hours,
  ts.name AS status_name,
  ts.color AS status_color,
  ts.category AS status_category,
  t.status_is_final AS is_final,
  d.name AS department_name,
  d.color AS department_color,
  a.name AS assignee_name,
  p.name AS project_name
FROM tasks t
JOIN task_statuses ts ON t.status_id = ts.id
JOIN departments d ON t.department_id = d.id
LEFT JOIN team_members a ON t.assignee_id = a.id
LEFT JOIN projects p ON t.project_id = p.id;

-- ---------------------------------------------------------------------------
-- calculate_project_health()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_project_health(p_project_id uuid)
RETURNS TABLE(
  overall_score integer,
  overall_status character varying,
  schedule_score integer,
  budget_score integer,
  scope_score integer,
  team_score integer,
  quality_score integer,
  metrics jsonb
)
LANGUAGE plpgsql
AS $function$
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
  SELECT * INTO v_project FROM projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Schedule score — uses t.status_is_final (denormalized) for predicate pushdown.
  SELECT
    COUNT(*) AS total_tasks,
    COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed_tasks,
    COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status_is_final = false) AS overdue_tasks,
    COUNT(*) FILTER (WHERE t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND t.status_is_final = false) AS due_soon
  INTO v_task_stats
  FROM tasks t
  JOIN task_statuses ts ON t.status_id = ts.id
  WHERE t.project_id = p_project_id;

  IF COALESCE(v_task_stats.total_tasks, 0) > 0 THEN
    v_schedule_score := GREATEST(0, LEAST(100,
      100 - (COALESCE(v_task_stats.overdue_tasks, 0) * 15)
      + (COALESCE(v_task_stats.completed_tasks, 0)::float / v_task_stats.total_tasks * 30)
    ))::INTEGER;
  END IF;

  v_metrics := v_metrics || jsonb_build_object('schedule', jsonb_build_object(
    'total_tasks', COALESCE(v_task_stats.total_tasks, 0),
    'completed_tasks', COALESCE(v_task_stats.completed_tasks, 0),
    'overdue_tasks', COALESCE(v_task_stats.overdue_tasks, 0),
    'due_soon', COALESCE(v_task_stats.due_soon, 0)
  ));

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

  SELECT
    COUNT(DISTINCT te.user_id) AS team_members,
    AVG(te.hours) AS avg_daily_hours
  INTO v_team_stats
  FROM time_entries te
  WHERE te.project_id = p_project_id
    AND te.date >= CURRENT_DATE - 14;

  v_team_score := 80;
  v_metrics := v_metrics || jsonb_build_object('team', jsonb_build_object(
    'active_members', COALESCE(v_team_stats.team_members, 0)
  ));

  v_scope_score := 80;
  v_quality_score := 80;

  v_overall_score := (
    v_schedule_score * 0.25 +
    v_budget_score * 0.25 +
    v_scope_score * 0.20 +
    v_team_score * 0.15 +
    v_quality_score * 0.15
  )::INTEGER;

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
$function$;

-- ---------------------------------------------------------------------------
-- calculate_member_forecast()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_member_forecast(p_team_member_id uuid, p_week_start date)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
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
  SELECT * INTO v_member FROM team_members WHERE id = p_team_member_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_week_end := p_week_start + 6;

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

  -- Uses t.status_is_final (denormalized) for predicate pushdown.
  SELECT COALESCE(SUM(t.estimated_hours), 0)
  INTO v_committed
  FROM tasks t
  JOIN task_statuses ts ON t.status_id = ts.id
  WHERE t.assignee_id = p_team_member_id
    AND t.status_is_final = false
    AND t.due_date >= p_week_start
    AND t.due_date <= v_week_end;

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
      AND t.status_is_final = false
      AND t.due_date >= p_week_start
      AND t.due_date <= v_week_end
      AND t.project_id IS NOT NULL
    GROUP BY t.project_id
  ) sub
  JOIN projects p ON sub.project_id = p.id;

  v_available := GREATEST(0, v_adjusted_capacity - v_committed - v_tentative);

  IF v_adjusted_capacity > 0 THEN
    v_utilization := ((v_committed + v_tentative) / v_adjusted_capacity * 100);
  ELSE
    v_utilization := 0;
  END IF;

  v_status := CASE
    WHEN v_utilization < 60 THEN 'available'
    WHEN v_utilization < 85 THEN 'balanced'
    WHEN v_utilization <= 100 THEN 'busy'
    ELSE 'overloaded'
  END;

  INSERT INTO resource_forecasts (
    team_member_id, week_start, week_end, base_capacity_hours, adjusted_capacity_hours,
    committed_hours, tentative_hours, available_hours, planned_utilization,
    target_utilization, capacity_status, project_breakdown, calculated_at
  ) VALUES (
    p_team_member_id, p_week_start, v_week_end, v_base_capacity, v_adjusted_capacity,
    v_committed, v_tentative, v_available, ROUND(v_utilization::numeric, 1),
    COALESCE(v_member.target_utilization, 80), v_status, v_project_breakdown, NOW()
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
$function$;
