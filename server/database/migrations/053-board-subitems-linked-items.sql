-- 053: Board Subitems + Linked Items
-- Adds 'linked_items' column type and relational linking table

-- Add 'linked_items' to column_type enum
ALTER TYPE column_type ADD VALUE IF NOT EXISTS 'linked_items';

-- Relational table for bidirectional task linking
CREATE TABLE IF NOT EXISTS task_linked_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  linked_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type VARCHAR(50) DEFAULT 'related'
    CHECK (link_type IN ('related', 'duplicate', 'blocks', 'is_blocked_by')),
  column_id UUID REFERENCES custom_columns(id) ON DELETE SET NULL,
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, linked_task_id),
  CHECK (task_id != linked_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_linked_items_task ON task_linked_items(task_id);
CREATE INDEX IF NOT EXISTS idx_task_linked_items_linked ON task_linked_items(linked_task_id);
CREATE INDEX IF NOT EXISTS idx_task_linked_items_column ON task_linked_items(column_id);
