-- Idempotent provenance for comments imported by recurring operational sync.
-- This is deliberately separate from one-off migration session mappings.
CREATE TABLE IF NOT EXISTS monday_sync_comment_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monday_comment_id VARCHAR(100) NOT NULL UNIQUE,
  monday_item_id VARCHAR(100) NOT NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_monday_comment_id VARCHAR(100),
  monday_creator_id VARCHAR(100),
  activity_id UUID REFERENCES task_activities(id) ON DELETE SET NULL,
  body_text TEXT NOT NULL,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_created_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monday_sync_comments_task
  ON monday_sync_comment_mappings (task_id, source_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monday_sync_comments_item
  ON monday_sync_comment_mappings (monday_item_id);
