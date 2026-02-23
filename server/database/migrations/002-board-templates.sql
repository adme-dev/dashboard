-- Board Templates: save board structure (columns, groups, views) as reusable templates

CREATE TABLE IF NOT EXISTS board_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  icon VARCHAR(50) DEFAULT 'layout-grid',
  color VARCHAR(7) DEFAULT '#579BFC',
  -- Snapshot of board structure as JSONB
  columns JSONB DEFAULT '[]',
  groups JSONB DEFAULT '[]',
  views JSONB DEFAULT '[]',
  -- Metadata
  source_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_templates_category ON board_templates(category);
CREATE INDEX IF NOT EXISTS idx_board_templates_public ON board_templates(is_public);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_board_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_board_templates_updated_at ON board_templates;
CREATE TRIGGER trg_board_templates_updated_at
  BEFORE UPDATE ON board_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_board_templates_updated_at();
