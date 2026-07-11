-- Versioned department goals and transparent line-of-sight to role KPIs.

CREATE TABLE IF NOT EXISTS hr_department_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_department_goal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES hr_department_goals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  objective TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('higher_is_better', 'lower_is_better', 'within_range', 'milestone')),
  target_value NUMERIC,
  target_min NUMERIC,
  target_max NUMERIC,
  target_description TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('platform', 'monday', 'approved_report', 'manual_verified', 'other')),
  source_ref TEXT,
  accountable_owner_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'superseded')),
  published_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (goal_id, version),
  CHECK (period_end >= period_start),
  CHECK (target_min IS NULL OR target_max IS NULL OR target_max >= target_min)
);

CREATE INDEX IF NOT EXISTS idx_hr_department_goal_period
  ON hr_department_goal_versions(period_start, period_end, status);

CREATE TABLE IF NOT EXISTS hr_role_kpi_goal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_definition_id UUID NOT NULL UNIQUE
    REFERENCES hr_role_kpi_definitions(id) ON DELETE CASCADE,
  department_goal_version_id UUID NOT NULL
    REFERENCES hr_department_goal_versions(id) ON DELETE RESTRICT,
  contribution_weight NUMERIC(5,2) NOT NULL DEFAULT 100
    CHECK (contribution_weight > 0 AND contribution_weight <= 100),
  rationale TEXT,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_kpi_goal_link_goal
  ON hr_role_kpi_goal_links(department_goal_version_id);

COMMENT ON TABLE hr_department_goal_versions IS
  'Time-bound, owner-approved department goals with stable metric definitions and source provenance.';
COMMENT ON TABLE hr_role_kpi_goal_links IS
  'Explicit, reviewable line-of-sight from a role KPI to a department goal; avoids silently cascading collective outcomes to an individual.';
