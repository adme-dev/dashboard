-- 138: CRM activities/notes timeline (Slice 3). Stacked on 134/135.
-- Polymorphic: target_type + target_id reference person|company|opportunity.
CREATE TABLE IF NOT EXISTS crm_activities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('person','company','opportunity')),
  target_id    UUID NOT NULL,
  type         TEXT NOT NULL DEFAULT 'note'
               CHECK (type IN ('note','call','email','meeting','task','stage_change','system')),
  title        TEXT NOT NULL,
  body         TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_target
  ON crm_activities (client_id, target_type, target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_activities_open_tasks
  ON crm_activities (client_id, is_completed) WHERE type = 'task' AND deleted_at IS NULL;
