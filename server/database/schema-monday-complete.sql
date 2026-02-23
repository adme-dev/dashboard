-- ============================================
-- Complete Monday.com Migration Schema
-- Supports ALL Monday column types for seamless transition
-- ============================================

-- ============================================
-- 1. Mirror Column Support (Cross-board data sync)
-- ============================================
CREATE TABLE monday_mirror_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES departments(id), -- Local department/board
  monday_board_id VARCHAR(100) NOT NULL,
  monday_column_id VARCHAR(100) NOT NULL,
  column_title VARCHAR(255) NOT NULL,
  source_board_id VARCHAR(100) NOT NULL, -- Source Monday board
  source_column_id VARCHAR(100) NOT NULL,
  mirror_type VARCHAR(50) NOT NULL CHECK (mirror_type IN ('column', 'name', 'status', 'date', 'numbers')),
  config JSONB DEFAULT '{}', -- Mirror configuration
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monday_board_id, monday_column_id)
);

CREATE INDEX idx_monday_mirror_columns_board ON monday_mirror_columns(board_id);
CREATE INDEX idx_monday_mirror_columns_monday ON monday_mirror_columns(monday_board_id, monday_column_id);

-- Store mirror values per task
CREATE TABLE task_mirror_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mirror_column_id UUID NOT NULL REFERENCES monday_mirror_columns(id) ON DELETE CASCADE,
  mirrored_task_id UUID REFERENCES tasks(id), -- Local task being mirrored
  monday_source_item_id VARCHAR(100), -- Original Monday item ID
  value JSONB NOT NULL, -- Mirrored value
  cached_text TEXT, -- Text representation for display
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, mirror_column_id)
);

CREATE INDEX idx_task_mirror_values_task ON task_mirror_values(task_id);
CREATE INDEX idx_task_mirror_values_column ON task_mirror_values(mirror_column_id);

-- ============================================
-- 2. Document Storage (Monday Docs)
-- ============================================
CREATE TABLE monday_docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monday_doc_id VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT, -- Extracted text content
  content_html TEXT, -- HTML representation
  content_json JSONB, -- Structured content blocks
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monday_docs_monday_id ON monday_docs(monday_doc_id);

-- Link docs to tasks
CREATE TABLE task_doc_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  doc_id UUID NOT NULL REFERENCES monday_docs(id) ON DELETE CASCADE,
  monday_column_id VARCHAR(100), -- Original Monday column
  column_title VARCHAR(255),
  display_type VARCHAR(50) DEFAULT 'embedded', -- embedded, linked, preview
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, doc_id)
);

CREATE INDEX idx_task_doc_links_task ON task_doc_links(task_id);
CREATE INDEX idx_task_doc_links_doc ON task_doc_links(doc_id);

-- ============================================
-- 3. Board Relations (Connected Boards)
-- ============================================
CREATE TABLE monday_board_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES departments(id),
  monday_board_id VARCHAR(100) NOT NULL,
  monday_column_id VARCHAR(100) NOT NULL,
  column_title VARCHAR(255) NOT NULL,
  related_board_id VARCHAR(100) NOT NULL, -- Monday board being linked to
  relation_type VARCHAR(50) DEFAULT 'one_way' CHECK (relation_type IN ('one_way', 'two_way')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monday_board_id, monday_column_id)
);

CREATE INDEX idx_monday_board_relations_board ON monday_board_relations(board_id);

-- Store relations per task
CREATE TABLE task_board_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  relation_column_id UUID NOT NULL REFERENCES monday_board_relations(id) ON DELETE CASCADE,
  related_task_id UUID REFERENCES tasks(id), -- Local related task
  monday_related_item_id VARCHAR(100) NOT NULL, -- Original Monday item ID
  relation_data JSONB DEFAULT '{}', -- Additional relation metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, relation_column_id, related_task_id)
);

CREATE INDEX idx_task_board_relations_task ON task_board_relations(task_id);
CREATE INDEX idx_task_board_relations_related ON task_board_relations(related_task_id);
CREATE INDEX idx_task_board_relations_monday ON task_board_relations(monday_related_item_id);

-- ============================================
-- 4. Enhanced Time Tracking (Monday time_tracking column)
-- ============================================
-- Extend time_entries with Monday-specific data
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS monday_time_tracking_id VARCHAR(100);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS monday_column_id VARCHAR(100);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'manual' CHECK (source_type IN ('manual', 'monday_import', 'timer'));
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS monday_raw_data JSONB;

CREATE INDEX idx_time_entries_monday_id ON time_entries(monday_time_tracking_id);
CREATE INDEX idx_time_entries_source ON time_entries(source_type);

-- Track Monday time tracking sessions
CREATE TABLE monday_time_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  monday_item_id VARCHAR(100) NOT NULL,
  monday_column_id VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  tracked_by UUID REFERENCES team_members(id),
  monday_session_data JSONB, -- Original Monday session data
  time_entry_id UUID REFERENCES time_entries(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monday_time_sessions_task ON monday_time_sessions(task_id);
CREATE INDEX idx_monday_time_sessions_monday ON monday_time_sessions(monday_item_id, monday_column_id);

-- ============================================
-- 5. Enhanced Dependencies (Monday dependency column)
-- ============================================
-- Extend existing task_dependencies with Monday data
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS monday_dependency_id VARCHAR(100);
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS dependency_column_id VARCHAR(100);
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS dependency_label VARCHAR(100);
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS lag_days INTEGER DEFAULT 0;
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS monday_raw_data JSONB;

CREATE INDEX idx_task_dependencies_monday ON task_dependencies(monday_dependency_id);

-- Dependency configuration per board/column
CREATE TABLE monday_dependency_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES departments(id),
  monday_board_id VARCHAR(100) NOT NULL,
  monday_column_id VARCHAR(100) NOT NULL,
  column_title VARCHAR(255) NOT NULL,
  dependency_type VARCHAR(50) DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'is_blocked_by', 'relates_to')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monday_board_id, monday_column_id)
);

-- ============================================
-- 6. Voting System (Monday vote column)
-- ============================================
CREATE TABLE monday_vote_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES departments(id),
  monday_board_id VARCHAR(100) NOT NULL,
  monday_column_id VARCHAR(100) NOT NULL,
  column_title VARCHAR(255) NOT NULL,
  vote_type VARCHAR(50) DEFAULT 'single' CHECK (vote_type IN ('single', 'multiple')),
  max_votes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monday_board_id, monday_column_id)
);

CREATE TABLE task_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  vote_column_id UUID NOT NULL REFERENCES monday_vote_columns(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES team_members(id),
  vote_value INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, vote_column_id, voter_id)
);

CREATE INDEX idx_task_votes_task ON task_votes(task_id);
CREATE INDEX idx_task_votes_voter ON task_votes(voter_id);

-- Vote totals cache
CREATE VIEW v_task_vote_totals AS
SELECT 
  task_id,
  vote_column_id,
  COUNT(*) as total_votes,
  SUM(vote_value) as vote_score
FROM task_votes
GROUP BY task_id, vote_column_id;

-- ============================================
-- 7. Column Value Storage (Custom columns from Monday)
-- ============================================
-- Store ALL Monday column values as JSON for preservation
CREATE TABLE task_monday_column_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  monday_column_id VARCHAR(100) NOT NULL,
  column_title VARCHAR(255) NOT NULL,
  column_type VARCHAR(100) NOT NULL,
  value_json JSONB, -- Raw Monday value
  text_value TEXT, -- Human-readable text
  settings_str TEXT, -- Column settings from Monday
  migrated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, monday_column_id)
);

CREATE INDEX idx_task_monday_column_values_task ON task_monday_column_values(task_id);
CREATE INDEX idx_task_monday_column_values_type ON task_monday_column_values(column_type);

-- ============================================
-- 8. Migration Metadata Extension
-- ============================================
-- Add more tracking to item mappings
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS monday_board_id VARCHAR(100);
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS monday_group_id VARCHAR(100);
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS monday_group_title VARCHAR(255);
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS monday_item_position VARCHAR(50);
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS mirror_values JSONB DEFAULT '{}';
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS doc_links JSONB DEFAULT '[]';
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS board_relations JSONB DEFAULT '[]';
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS time_tracking JSONB DEFAULT '{}';
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]';
ALTER TABLE monday_item_mappings ADD COLUMN IF NOT EXISTS votes JSONB DEFAULT '{}';

-- ============================================
-- 9. Sync Tracking for Mirror/Related Data
-- ============================================
CREATE TABLE monday_sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('mirror_sync', 'relation_sync', 'full_refresh')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  items_processed INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. Triggers
-- ============================================
CREATE TRIGGER update_monday_mirror_columns_updated_at BEFORE UPDATE ON monday_mirror_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_mirror_values_updated_at BEFORE UPDATE ON task_mirror_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_docs_updated_at BEFORE UPDATE ON monday_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_board_relations_updated_at BEFORE UPDATE ON monday_board_relations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monday_vote_columns_updated_at BEFORE UPDATE ON monday_vote_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 11. Views for Reporting
-- ============================================
-- Complete task view with all Monday data
CREATE OR REPLACE VIEW v_task_complete AS
SELECT 
  t.*,
  d.name as department_name,
  d.color as department_color,
  ts.name as status_name,
  ts.color as status_color,
  ts.category as status_category,
  a.name as assignee_name,
  a.email as assignee_email,
  r.name as reporter_name,
  p.name as project_name,
  c.name as client_name,
  -- Monday mapping info
  mim.monday_item_id,
  mim.monday_board_id,
  mim.source_data as monday_source_data,
  -- Aggregated counts
  COALESCE((SELECT COUNT(*) FROM task_activities ta WHERE ta.task_id = t.id AND ta.activity_type = 'comment'), 0) as comment_count,
  COALESCE((SELECT COUNT(*) FROM task_attachments att WHERE att.task_id = t.id), 0) as attachment_count,
  COALESCE((SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id), 0) as subtask_count,
  COALESCE((SELECT SUM(vote_value) FROM task_votes tv WHERE tv.task_id = t.id), 0) as vote_total
FROM tasks t
JOIN departments d ON t.department_id = d.id
JOIN task_statuses ts ON t.status_id = ts.id
LEFT JOIN team_members a ON t.assignee_id = a.id
LEFT JOIN team_members r ON t.reporter_id = r.id
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN agency_clients c ON p.client_id = c.id
LEFT JOIN monday_item_mappings mim ON t.id = mim.task_id;
