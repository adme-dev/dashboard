-- Reset user-controllable notifications to opt-in.
-- Existing users can re-enable individual channels from /settings/notifications.

BEGIN;

ALTER TABLE team_members
  ALTER COLUMN notification_preferences SET DEFAULT '{
    "email_task_assigned": false,
    "email_task_mentioned": false,
    "email_task_due": false,
    "email_approval_request": false,
    "email_weekly_digest": false,
    "email_board_member_added": false,
    "email_brief_assigned": false,
    "email_brief_status": false,
    "email_brief_comment": false,
    "inapp_task_assigned": false,
    "inapp_task_mentioned": false,
    "inapp_task_status": false,
    "inapp_task_comment": false,
    "inapp_task_due": false,
    "inapp_approval": false,
    "inapp_board_member_added": false,
    "inapp_brief_assigned": false,
    "inapp_brief_status": false,
    "inapp_brief_comment": false,
    "inapp_chat_mention": false,
    "inapp_chat_dm": false
  }'::jsonb;

ALTER TABLE team_members
  ALTER COLUMN auto_subscribe_on_participation SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS app_migration_markers (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The marker makes the data reset safe to re-run after users have opted in.
-- Schema defaults above remain repeatable, while this UPDATE executes once.
WITH first_run AS (
  INSERT INTO app_migration_markers (name)
  VALUES ('266_notification_preferences_opt_in')
  ON CONFLICT (name) DO NOTHING
  RETURNING name
)
UPDATE team_members
SET
  notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || '{
    "email_task_assigned": false,
    "email_task_mentioned": false,
    "email_task_due": false,
    "email_approval_request": false,
    "email_weekly_digest": false,
    "email_board_member_added": false,
    "email_brief_assigned": false,
    "email_brief_status": false,
    "email_brief_comment": false,
    "inapp_task_assigned": false,
    "inapp_task_mentioned": false,
    "inapp_task_status": false,
    "inapp_task_comment": false,
    "inapp_task_due": false,
    "inapp_approval": false,
    "inapp_board_member_added": false,
    "inapp_brief_assigned": false,
    "inapp_brief_status": false,
    "inapp_brief_comment": false,
    "inapp_chat_mention": false,
    "inapp_chat_dm": false
  }'::jsonb,
  auto_subscribe_on_participation = FALSE
WHERE EXISTS (SELECT 1 FROM first_run);

COMMIT;
