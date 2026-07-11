-- Review follow-ups and learning plans. A learning action is one possible
-- response; structural blockers use process/workload/role-clarity actions.

CREATE TABLE IF NOT EXISTS hr_follow_up_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES hr_review_participants(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('learning', 'coaching', 'process_change', 'workload_adjustment', 'role_clarification', 'goal_adjustment')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  due_at TIMESTAMPTZ NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'participant_and_hr'
    CHECK (visibility IN ('participant_and_hr', 'hr_only')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'acknowledged', 'in_progress', 'completed', 'cancelled')),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_follow_up_participant
  ON hr_follow_up_plans(participant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_hr_follow_up_owner_due
  ON hr_follow_up_plans(owner_id, status, due_at);

CREATE TABLE IF NOT EXISTS hr_learning_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id UUID NOT NULL UNIQUE REFERENCES hr_follow_up_plans(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  observable_need TEXT NOT NULL,
  desired_outcome TEXT NOT NULL,
  learning_intervention TEXT NOT NULL,
  source_criterion_id TEXT,
  source_kpi_definition_id UUID REFERENCES hr_role_kpi_definitions(id) ON DELETE SET NULL,
  provider_or_resource TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_follow_up_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id UUID NOT NULL REFERENCES hr_follow_up_plans(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_follow_up_events
  ON hr_follow_up_events(follow_up_id, created_at DESC);

COMMENT ON TABLE hr_learning_needs IS
  'Observable, role-related capability development only; no personality, health or protected-attribute inference.';
