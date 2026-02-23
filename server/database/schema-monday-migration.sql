-- ============================================
-- Monday.com Migration Schema
-- Tracks migration state and mappings
-- ============================================

-- ============================================
-- 1. Migration Sessions
-- Tracks each migration run
-- ============================================
CREATE TABLE monday_migration_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'paused')),
  started_by UUID REFERENCES team_members(id),
  -- Source info
  monday_account_id VARCHAR(100),
  monday_account_name VARCHAR(255),
  -- Statistics
  boards_total INTEGER DEFAULT 0,
  boards_migrated INTEGER DEFAULT 0,
  items_total INTEGER DEFAULT 0,
  items_migrated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  -- Configuration
  config JSONB DEFAULT '{}', -- migration options
  -- Error info
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monday_migration_status ON monday_migration_sessions(status);
CREATE INDEX idx_monday_migration_started ON monday_migration_sessions(started_at DESC);

-- ============================================
-- 2. Board Mappings
-- Maps Monday boards to departments
-- ============================================
CREATE TABLE monday_board_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_session_id UUID REFERENCES monday_migration_sessions(id) ON DELETE CASCADE,
  -- Monday source
  monday_board_id VARCHAR(100) NOT NULL,
  monday_board_name VARCHAR(255) NOT NULL,
  monday_board_type VARCHAR(50), -- board, sub_items_board
  -- Local target
  department_id UUID REFERENCES departments(id),
  -- Mapping configuration
  status_mapping JSONB DEFAULT '{}', -- Monday status label -> local status_id
  column_mappings JSONB DEFAULT '{}', -- Monday column -> local custom column
  user_mappings JSONB DEFAULT '{}', -- Monday user -> local team_member
  -- Migration state
  items_total INTEGER DEFAULT 0,
  items_migrated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  last_item_cursor VARCHAR(255), -- for pagination
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'migrating', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(migration_session_id, monday_board_id)
);

CREATE INDEX idx_monday_board_mappings_session ON monday_board_mappings(migration_session_id);
CREATE INDEX idx_monday_board_mappings_status ON monday_board_mappings(status);
CREATE INDEX idx_monday_board_mappings_monday_id ON monday_board_mappings(monday_board_id);

-- ============================================
-- 3. Item Mappings
-- Maps Monday items to tasks
-- ============================================
CREATE TABLE monday_item_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_session_id UUID REFERENCES monday_migration_sessions(id) ON DELETE CASCADE,
  board_mapping_id UUID REFERENCES monday_board_mappings(id) ON DELETE CASCADE,
  -- Monday source
  monday_item_id VARCHAR(100) NOT NULL,
  monday_item_name VARCHAR(500) NOT NULL,
  monday_parent_item_id VARCHAR(100), -- for subitems
  -- Local target
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  -- Migration data
  source_data JSONB NOT NULL, -- original Monday item data
  column_values JSONB DEFAULT '{}', -- mapped column values
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'migrating', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(migration_session_id, monday_item_id)
);

CREATE INDEX idx_monday_item_mappings_session ON monday_item_mappings(migration_session_id);
CREATE INDEX idx_monday_item_mappings_board ON monday_item_mappings(board_mapping_id);
CREATE INDEX idx_monday_item_mappings_status ON monday_item_mappings(status);
CREATE INDEX idx_monday_item_mappings_monday_id ON monday_item_mappings(monday_item_id);
CREATE INDEX idx_monday_item_mappings_task ON monday_item_mappings(task_id);

-- ============================================
-- 4. Update Tracking
-- Tracks updates/comments from Monday
-- ============================================
CREATE TABLE monday_update_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_session_id UUID REFERENCES monday_migration_sessions(id) ON DELETE CASCADE,
  item_mapping_id UUID REFERENCES monday_item_mappings(id) ON DELETE CASCADE,
  -- Monday source
  monday_update_id VARCHAR(100) NOT NULL,
  monday_creator_id VARCHAR(100),
  monday_creator_name VARCHAR(255),
  -- Local target
  activity_id UUID REFERENCES task_activities(id) ON DELETE SET NULL,
  -- Migration data
  source_data JSONB NOT NULL,
  body_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(migration_session_id, monday_update_id)
);

CREATE INDEX idx_monday_update_mappings_item ON monday_update_mappings(item_mapping_id);
CREATE INDEX idx_monday_update_mappings_activity ON monday_update_mappings(activity_id);

-- ============================================
-- 5. File/Asset Mappings
-- Tracks file attachments from Monday
-- ============================================
CREATE TABLE monday_file_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_session_id UUID REFERENCES monday_migration_sessions(id) ON DELETE CASCADE,
  item_mapping_id UUID REFERENCES monday_item_mappings(id) ON DELETE CASCADE,
  -- Monday source
  monday_asset_id VARCHAR(100) NOT NULL,
  monday_file_name VARCHAR(255) NOT NULL,
  monday_file_url TEXT,
  monday_file_size INTEGER,
  -- Local target
  attachment_id UUID REFERENCES task_attachments(id) ON DELETE SET NULL,
  local_file_url TEXT,
  -- Migration state
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(migration_session_id, monday_asset_id)
);

CREATE INDEX idx_monday_file_mappings_item ON monday_file_mappings(item_mapping_id);
CREATE INDEX idx_monday_file_mappings_status ON monday_file_mappings(status);

-- ============================================
-- 6. API Token Storage
-- Secure storage for Monday.com API tokens
-- ============================================
CREATE TABLE monday_api_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_name VARCHAR(100) NOT NULL DEFAULT 'default',
  api_token TEXT NOT NULL, -- encrypted
  monday_account_id VARCHAR(100),
  monday_account_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monday_api_tokens_active ON monday_api_tokens(is_active);

-- ============================================
-- 7. Migration Settings
-- Configuration for migrations
-- ============================================
CREATE TABLE monday_migration_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Default mappings
  default_department_id UUID REFERENCES departments(id),
  default_project_id UUID REFERENCES projects(id),
  default_assignee_id UUID REFERENCES team_members(id),
  -- Import options
  import_updates BOOLEAN DEFAULT true,
  import_files BOOLEAN DEFAULT true,
  import_subitems BOOLEAN DEFAULT true,
  skip_completed_items BOOLEAN DEFAULT false,
  skip_archived_boards BOOLEAN DEFAULT true,
  -- Field mappings (defaults)
  priority_mapping JSONB DEFAULT '{"High": "high", "Medium": "medium", "Low": "low", "Urgent": "urgent"}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO monday_migration_settings DEFAULT VALUES;

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER update_monday_migration_sessions_updated_at BEFORE UPDATE ON monday_migration_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_board_mappings_updated_at BEFORE UPDATE ON monday_board_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_item_mappings_updated_at BEFORE UPDATE ON monday_item_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_file_mappings_updated_at BEFORE UPDATE ON monday_file_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_api_tokens_updated_at BEFORE UPDATE ON monday_api_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_migration_settings_updated_at BEFORE UPDATE ON monday_migration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views
-- ============================================

-- Migration progress view
CREATE OR REPLACE VIEW v_monday_migration_progress AS
SELECT
  ms.id AS session_id,
  ms.status AS session_status,
  ms.started_at,
  ms.completed_at,
  ms.boards_total,
  ms.boards_migrated,
  ms.items_total,
  ms.items_migrated,
  ms.items_failed,
  CASE 
    WHEN ms.items_total > 0 
    THEN ROUND((ms.items_migrated::numeric / ms.items_total::numeric) * 100, 2)
    ELSE 0 
  END AS items_progress_percent,
  COUNT(bm.id) FILTER (WHERE bm.status = 'pending') AS boards_pending,
  COUNT(bm.id) FILTER (WHERE bm.status = 'migrating') AS boards_migrating,
  COUNT(bm.id) FILTER (WHERE bm.status = 'completed') AS boards_completed,
  COUNT(bm.id) FILTER (WHERE bm.status = 'failed') AS boards_failed
FROM monday_migration_sessions ms
LEFT JOIN monday_board_mappings bm ON ms.id = bm.migration_session_id
GROUP BY ms.id;

-- Board mapping details view
CREATE OR REPLACE VIEW v_monday_board_mapping_details AS
SELECT
  bm.*,
  d.name AS department_name,
  d.color AS department_color,
  COUNT(im.id) FILTER (WHERE im.status = 'completed') AS items_completed_count,
  COUNT(im.id) FILTER (WHERE im.status = 'failed') AS items_failed_count,
  COUNT(im.id) FILTER (WHERE im.status = 'pending') AS items_pending_count
FROM monday_board_mappings bm
LEFT JOIN departments d ON bm.department_id = d.id
LEFT JOIN monday_item_mappings im ON bm.id = im.board_mapping_id
GROUP BY bm.id, d.name, d.color;
