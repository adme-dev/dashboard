-- =============================================================================
-- Office meeting action items
-- Structured follow-up rows derived from meeting action-item artifacts.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS office_meeting_action_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id          uuid NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  meeting_session_id uuid NOT NULL REFERENCES office_meeting_sessions(id) ON DELETE CASCADE,
  source_artifact_id uuid REFERENCES office_meeting_artifacts(id) ON DELETE SET NULL,
  line_index         int NOT NULL DEFAULT 0,
  content            text NOT NULL,
  status             text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','in_progress','done','dismissed')),
  assignee_user_id   uuid REFERENCES team_members(id) ON DELETE SET NULL,
  due_at             timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by         uuid REFERENCES team_members(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE office_meeting_action_items
  ADD COLUMN IF NOT EXISTS source_artifact_id uuid REFERENCES office_meeting_artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS line_index int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assignee_user_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_office_meeting_action_items_source_line
  ON office_meeting_action_items(source_artifact_id, line_index)
  WHERE source_artifact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_office_meeting_action_items_meeting
  ON office_meeting_action_items(meeting_session_id, status, created_at DESC);

COMMIT;
