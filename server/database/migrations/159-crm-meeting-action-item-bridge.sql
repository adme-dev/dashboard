-- =============================================================================
-- CRM P4.3b — Meeting action-item → CRM task bridge
-- Independent of the existing task_id (board) column: one action item can become
-- both a board task and a CRM task. Plus per-client auto-create opt-in.
-- =============================================================================
BEGIN;

ALTER TABLE office_meeting_action_items
  ADD COLUMN IF NOT EXISTS crm_task_id uuid REFERENCES crm_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_office_meeting_action_items_crm_task
  ON office_meeting_action_items(crm_task_id)
  WHERE crm_task_id IS NOT NULL;

ALTER TABLE crm_settings
  ADD COLUMN IF NOT EXISTS meeting_bridge_autocreate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_bridge_enabled_at timestamptz;

COMMIT;
