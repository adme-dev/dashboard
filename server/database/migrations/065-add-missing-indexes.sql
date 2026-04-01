-- 065: Add missing indexes on hot tables
-- Addresses performance issues found in code review

-- notifications: queried by (user_id, type, created_at) in due-reminders and notification feeds
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON notifications (user_id, type, created_at DESC);

-- task_column_values: queried by task_id on every board load, and by (task_id, column_id) for upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_column_values_task_column
  ON task_column_values (task_id, column_id);

CREATE INDEX IF NOT EXISTS idx_task_column_values_task_id
  ON task_column_values (task_id);

-- brief_comments: queried by (brief_id, is_internal) for comment listing, parent_id for replies
CREATE INDEX IF NOT EXISTS idx_brief_comments_brief_internal
  ON brief_comments (brief_id, is_internal);

CREATE INDEX IF NOT EXISTS idx_brief_comments_parent
  ON brief_comments (parent_id)
  WHERE parent_id IS NOT NULL;
