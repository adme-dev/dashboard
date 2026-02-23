-- Board Groups: first-class group management within boards
-- Each board (department) can have multiple groups for organizing tasks

CREATE TABLE IF NOT EXISTS board_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  color VARCHAR(7) DEFAULT '#579BFC',
  sort_order INTEGER DEFAULT 0,
  is_collapsed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_groups_department ON board_groups(department_id);
CREATE INDEX IF NOT EXISTS idx_board_groups_sort ON board_groups(department_id, sort_order);

-- Add group_id to tasks so tasks can belong to a board group
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES board_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_board_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_board_groups_updated_at ON board_groups;
CREATE TRIGGER trg_board_groups_updated_at
  BEFORE UPDATE ON board_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_board_groups_updated_at();
