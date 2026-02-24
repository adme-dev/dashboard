-- Board Automations: simple per-board automation rules
-- "When [trigger] happens on this board → then [action]"
CREATE TABLE IF NOT EXISTS board_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  -- Trigger
  trigger_type VARCHAR(50) NOT NULL,  -- 'status_changed', 'date_arrived', 'item_created', 'column_changed'
  trigger_config JSONB DEFAULT '{}',  -- e.g. {"statusColumnId": "...", "toValue": "Done"}
  -- Action
  action_type VARCHAR(50) NOT NULL,   -- 'send_email', 'create_notification', 'update_column'
  action_config JSONB DEFAULT '{}',   -- e.g. {"to": "assignee", "subject": "...", "body": "..."}
  -- Metadata
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_automations_board ON board_automations(board_id);
CREATE INDEX IF NOT EXISTS idx_board_automations_active ON board_automations(board_id, is_active) WHERE is_active = true;
