-- =============================================================================
-- Office meeting action item task conversion
-- Links structured meeting follow-up actions to agency tasks.
-- =============================================================================

BEGIN;

ALTER TABLE office_meeting_action_items
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_office_meeting_action_items_task
  ON office_meeting_action_items(task_id)
  WHERE task_id IS NOT NULL;

COMMIT;
