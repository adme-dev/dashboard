-- 147: CRM Sales Productivity (Phase 1). Stacked on 134/135/138/141.
-- Adds: follow-up tasks, stage-change automation, contact scoring (+history),
--       and a queryable opportunity stage-history table for analytics.
-- All additive, IF NOT EXISTS guarded — safe to run repeatedly / on shared dev DB.
-- Ported/adapted from promotion-knox crm-followups-schema.sql + lead_scores.

-- ── F1: Follow-up tasks ───────────────────────────────────────────────────────
-- Polymorphic target (person|company|opportunity), mirrors crm_activities.
-- "overdue" is DERIVED at read time (status='pending' AND due_at < now()); not stored.
CREATE TABLE IF NOT EXISTS crm_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('person','company','opportunity')),
  target_id    UUID NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  task_type    TEXT NOT NULL DEFAULT 'follow_up'
               CHECK (task_type IN ('call','email','sms','meeting','follow_up','general')),
  priority     TEXT NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low','medium','high','urgent')),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_at       TIMESTAMPTZ,
  reminder_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome      TEXT CHECK (outcome IN ('contacted','voicemail','no_answer','rescheduled','converted','not_interested')),
  assigned_to  UUID,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_client_status_due
  ON crm_tasks (client_id, status, due_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_target
  ON crm_tasks (target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned
  ON crm_tasks (assigned_to, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_reminder
  ON crm_tasks (reminder_at) WHERE status = 'pending' AND deleted_at IS NULL;

-- ── F2: Stage-change automation rules ─────────────────────────────────────────
-- task_template jsonb shape: { title, task_type, priority, due_offset_days, assigned_to? }
CREATE TABLE IF NOT EXISTS crm_stage_automations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  stage_id      UUID NOT NULL REFERENCES crm_stages(id) ON DELETE CASCADE,
  object_type   TEXT NOT NULL DEFAULT 'opportunity',
  action        TEXT NOT NULL DEFAULT 'create_task' CHECK (action IN ('create_task')),
  task_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_stage_autos_client_stage
  ON crm_stage_automations (client_id, stage_id) WHERE is_active;

-- ── F3: Contact / lead scoring ────────────────────────────────────────────────
-- score_type carries 'lead' today; 'health' (churn-risk) lands in Phase 4 w/ no migration.
CREATE TABLE IF NOT EXISTS crm_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL CHECK (target_type IN ('person','company')),
  target_id        UUID NOT NULL,
  score_type       TEXT NOT NULL DEFAULT 'lead' CHECK (score_type IN ('lead','health')),
  total_score      INTEGER NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100),
  grade            TEXT NOT NULL DEFAULT 'Cold' CHECK (grade IN ('Hot','Warm','Cold')),
  engagement_score INTEGER NOT NULL DEFAULT 0,
  intent_score     INTEGER NOT NULL DEFAULT 0,
  fit_score        INTEGER NOT NULL DEFAULT 0,
  recency_score    INTEGER NOT NULL DEFAULT 0,
  score_version    INTEGER NOT NULL DEFAULT 1,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_scores_target
  ON crm_scores (client_id, target_type, target_id, score_type);

CREATE TABLE IF NOT EXISTS crm_score_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id   UUID NOT NULL,
  score_type  TEXT NOT NULL DEFAULT 'lead',
  total_score INTEGER NOT NULL,
  grade       TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_score_hist_target
  ON crm_score_history (client_id, target_type, target_id, created_at DESC);

-- ── F4: Queryable opportunity stage-history (for cycle-time / time-in-stage) ──
-- Forward-only: populated by the stage-change hook from ship date. No backfill of
-- pre-existing transitions beyond what crm_opportunities.stage_history JSONB holds.
CREATE TABLE IF NOT EXISTS crm_opportunity_stage_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  from_stage_id  UUID REFERENCES crm_stages(id),
  to_stage_id    UUID NOT NULL REFERENCES crm_stages(id),
  changed_by     UUID,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_opp_stage_hist
  ON crm_opportunity_stage_history (opportunity_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_crm_opp_stage_hist_client
  ON crm_opportunity_stage_history (client_id, changed_at);
