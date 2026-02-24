-- Board Subscriptions: board, item, and column level subscriptions
CREATE TABLE IF NOT EXISTS board_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  item_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  column_id UUID REFERENCES custom_columns(id) ON DELETE CASCADE,
  events TEXT[] DEFAULT '{}',
  notify_inapp BOOLEAN DEFAULT true,
  notify_email BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, board_id, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'), COALESCE(column_id, '00000000-0000-0000-0000-000000000000'))
);

CREATE INDEX IF NOT EXISTS idx_board_subs_user ON board_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_board_subs_board ON board_subscriptions(board_id);
CREATE INDEX IF NOT EXISTS idx_board_subs_item ON board_subscriptions(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_subs_column ON board_subscriptions(column_id) WHERE column_id IS NOT NULL;
