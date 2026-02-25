-- 022-chat-board-links.sql
-- Board ↔ Chat feed settings: configures which board events post to linked chat channels.

-- Board feed settings
CREATE TABLE IF NOT EXISTS chat_board_feed_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  event_types TEXT[] NOT NULL DEFAULT ARRAY['task_created', 'status_changed'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, board_id)
);

-- Fast lookup: which channels receive events for a board
CREATE INDEX IF NOT EXISTS idx_chat_board_feed_board
  ON chat_board_feed_settings(board_id)
  WHERE is_active = true;

-- Index on task_id in chat_channels for fast task→channel lookup
CREATE INDEX IF NOT EXISTS idx_chat_channels_task
  ON chat_channels(task_id)
  WHERE task_id IS NOT NULL;

-- Index on department_id in chat_channels for board→channel lookup
CREATE INDEX IF NOT EXISTS idx_chat_channels_department
  ON chat_channels(department_id)
  WHERE department_id IS NOT NULL;
