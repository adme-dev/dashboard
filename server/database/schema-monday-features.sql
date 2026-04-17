-- ============================================
-- Monday.com-Style Advanced Features Schema
-- Global Tags, Custom Columns, Board Views, Pricing
-- ============================================

-- ============================================
-- 2.1 Global Tags/Hashtags System
-- Searchable tags across all boards and tasks
-- ============================================

CREATE TABLE global_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE, -- lowercase, no spaces for #hashtag format
  color VARCHAR(7) NOT NULL DEFAULT '#6B7280',
  description TEXT,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_global_tags_name ON global_tags(name);
CREATE INDEX idx_global_tags_slug ON global_tags(slug);
CREATE INDEX idx_global_tags_usage ON global_tags(usage_count DESC);

-- Task-Tag junction (separate from task_labels which are department-specific)
CREATE TABLE task_tags (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES global_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX idx_task_tags_task ON task_tags(task_id);
CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);

-- Auto-increment usage count trigger
CREATE OR REPLACE FUNCTION update_tag_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE global_tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE global_tags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.tag_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tag_usage_count
  AFTER INSERT OR DELETE ON task_tags
  FOR EACH ROW EXECUTE FUNCTION update_tag_usage_count();

-- ============================================
-- 2.2 Custom Column Types (Monday.com-style)
-- Configurable columns per board/department
-- ============================================

CREATE TYPE column_type AS ENUM (
  'text',          -- Simple text
  'number',        -- Numeric value
  'currency',      -- Money with currency
  'date',          -- Single date
  'timeline',      -- Date range (start + end)
  'status',        -- Dropdown status (uses task_statuses)
  'dropdown',      -- Custom dropdown options
  'people',        -- Person/assignee
  'checkbox',      -- Boolean
  'rating',        -- 1-5 stars
  'link',          -- URL
  'email',         -- Email address
  'phone',         -- Phone number
  'location',      -- Address/location
  'formula',       -- Calculated field
  'tags',          -- Multiple tags
  'files',         -- Attachments
  'progress',      -- Progress percentage
  'color',         -- Color picker
  'dependency'     -- Task dependency
);

CREATE TABLE custom_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for global columns
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  column_type column_type NOT NULL,
  description TEXT,
  -- Column settings (JSON for flexibility)
  settings JSONB DEFAULT '{}', -- Options, formula, default value, etc.
  -- Visibility & permissions
  is_visible BOOLEAN DEFAULT true,
  is_required BOOLEAN DEFAULT false,
  allowed_roles TEXT[], -- Roles that can view this column (NULL = all)
  editable_roles TEXT[], -- Roles that can edit (NULL = all)
  -- Display settings
  width INTEGER DEFAULT 150,
  sort_order INTEGER DEFAULT 0,
  -- Audit
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, slug)
);

CREATE INDEX idx_custom_columns_dept ON custom_columns(department_id);
CREATE INDEX idx_custom_columns_type ON custom_columns(column_type);

-- Custom column values for tasks
CREATE TABLE task_column_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES custom_columns(id) ON DELETE CASCADE,
  -- Values stored based on column type
  text_value TEXT,
  number_value DECIMAL(15, 4),
  date_value DATE,
  date_end_value DATE, -- For timeline columns
  json_value JSONB, -- For complex types (dropdown options, people array, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, column_id)
);

CREATE INDEX idx_task_column_values_task ON task_column_values(task_id);
CREATE INDEX idx_task_column_values_column ON task_column_values(column_id);
CREATE INDEX idx_task_column_values_number ON task_column_values(column_id, number_value) WHERE number_value IS NOT NULL;
CREATE INDEX idx_task_column_values_date ON task_column_values(column_id, date_value) WHERE date_value IS NOT NULL;

-- Dropdown options for custom columns
CREATE TABLE column_dropdown_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  column_id UUID NOT NULL REFERENCES custom_columns(id) ON DELETE CASCADE,
  value VARCHAR(100) NOT NULL,
  label VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#6B7280',
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(column_id, value)
);

CREATE INDEX idx_column_dropdown_column ON column_dropdown_options(column_id);

-- ============================================
-- 2.3 Pricing Column (Role-based visibility)
-- Connected to Xero for invoicing
-- ============================================

-- Add pricing fields to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(12, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(12, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS billing_rate DECIMAL(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'AUD';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT true;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS xero_invoice_id VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;

-- Pricing visibility configuration per department
CREATE TABLE pricing_visibility_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for global
  -- Roles that can view pricing (NULL = no one except admin)
  view_roles TEXT[] DEFAULT ARRAY['admin', 'owner', 'lead'],
  -- Roles that can edit pricing
  edit_roles TEXT[] DEFAULT ARRAY['admin', 'owner'],
  -- Show/hide specific pricing columns
  show_estimated_cost BOOLEAN DEFAULT true,
  show_actual_cost BOOLEAN DEFAULT true,
  show_billing_rate BOOLEAN DEFAULT true,
  show_currency BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_visibility_dept ON pricing_visibility_rules(department_id);

-- Task cost breakdown (for detailed cost tracking)
CREATE TABLE task_cost_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  cost_type VARCHAR(50) NOT NULL CHECK (cost_type IN ('labor', 'material', 'contractor', 'software', 'other')),
  description TEXT,
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit_cost DECIMAL(12, 2) NOT NULL,
  total_cost DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  is_billable BOOLEAN DEFAULT true,
  markup_percentage DECIMAL(5, 2) DEFAULT 0,
  entered_by UUID REFERENCES team_members(id),
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_cost_entries_task ON task_cost_entries(task_id);

-- ============================================
-- 2.4 Board Views (Kanban, Table, Timeline, Calendar)
-- ============================================

CREATE TYPE board_view_type AS ENUM ('kanban', 'table', 'timeline', 'calendar', 'list', 'gallery');

CREATE TABLE board_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  view_type board_view_type NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true, -- Visible to all department members
  created_by UUID REFERENCES team_members(id),
  -- View configuration
  config JSONB DEFAULT '{}', -- Filters, sorting, grouping, visible columns, etc.
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_board_views_dept ON board_views(department_id);
CREATE INDEX idx_board_views_type ON board_views(view_type);

-- Saved filters/views per user
CREATE TABLE user_saved_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for cross-department views
  name VARCHAR(100) NOT NULL,
  view_type board_view_type DEFAULT 'table',
  -- Filter configuration
  filters JSONB DEFAULT '{}', -- assigneeId, priority, labels, tags, date ranges, etc.
  -- Sorting configuration
  sort_config JSONB DEFAULT '[]', -- [{column: 'dueDate', direction: 'asc'}]
  -- Grouping configuration
  group_by VARCHAR(50), -- 'status', 'assignee', 'priority', 'project', 'tag', custom column
  -- Column visibility
  visible_columns TEXT[], -- Array of column IDs/slugs to show
  -- Layout settings
  column_widths JSONB DEFAULT '{}', -- {columnId: width}
  is_pinned BOOLEAN DEFAULT false, -- Show in quick access
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_saved_views_user ON user_saved_views(user_id);
CREATE INDEX idx_user_saved_views_dept ON user_saved_views(department_id);

-- ============================================
-- 2.5 Board Grouping Configuration
-- ============================================

CREATE TABLE board_grouping_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  group_by VARCHAR(50) NOT NULL, -- 'status', 'assignee', 'priority', 'project', 'tag', 'due_date', custom column slug
  display_name VARCHAR(100) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  -- For custom grouping (e.g., date buckets)
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_board_grouping_dept ON board_grouping_options(department_id);

-- Insert default grouping options
INSERT INTO board_grouping_options (department_id, group_by, display_name, sort_order) VALUES
  (NULL, 'status', 'Status', 1),
  (NULL, 'assignee', 'Assignee', 2),
  (NULL, 'priority', 'Priority', 3),
  (NULL, 'project', 'Project', 4),
  (NULL, 'due_date', 'Due Date', 5),
  (NULL, 'task_type', 'Type', 6);

-- ============================================
-- 2.6 Sorting Presets
-- ============================================

CREATE TABLE sorting_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  -- Sort configuration (multi-column)
  sort_rules JSONB NOT NULL DEFAULT '[]', -- [{column: 'dueDate', direction: 'asc', nullsLast: true}]
  is_default BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false, -- Built-in presets
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sorting_presets_dept ON sorting_presets(department_id);

-- Insert default sorting presets
INSERT INTO sorting_presets (department_id, name, sort_rules, is_system) VALUES
  (NULL, 'Due Date (Soonest First)', '[{"column": "due_date", "direction": "asc", "nullsLast": true}]', true),
  (NULL, 'Due Date (Latest First)', '[{"column": "due_date", "direction": "desc", "nullsLast": true}]', true),
  (NULL, 'Priority (Urgent First)', '[{"column": "priority", "direction": "desc"}, {"column": "due_date", "direction": "asc"}]', true),
  (NULL, 'Recently Updated', '[{"column": "updated_at", "direction": "desc"}]', true),
  (NULL, 'Recently Created', '[{"column": "created_at", "direction": "desc"}]', true),
  (NULL, 'Assignee, then Due Date', '[{"column": "assignee", "direction": "asc"}, {"column": "due_date", "direction": "asc"}]', true);

-- ============================================
-- 2.7 Timeline/Gantt View Support
-- ============================================

-- Task date constraints for timeline view
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS date_constraint_type VARCHAR(20)
  CHECK (date_constraint_type IN ('asap', 'alap', 'must_start_on', 'must_end_on', 'start_no_earlier', 'start_no_later', 'end_no_earlier', 'end_no_later'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS constraint_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_date DATE; -- For milestone tasks

-- Task time spans for calendar/timeline
CREATE OR REPLACE VIEW v_task_timeline AS
SELECT
  t.id,
  t.title,
  t.department_id,
  t.project_id,
  t.assignee_id,
  t.priority,
  t.task_type,
  COALESCE(t.start_date, t.created_at::DATE) as start_date,
  COALESCE(t.due_date, t.start_date + INTERVAL '7 days', t.created_at::DATE + INTERVAL '7 days') as end_date,
  t.progress_percentage,
  t.estimated_hours,
  t.actual_hours,
  ts.name as status_name,
  ts.color as status_color,
  ts.category as status_category,
  t.status_is_final,
  d.name as department_name,
  d.color as department_color,
  a.name as assignee_name,
  p.name as project_name
FROM tasks t
JOIN task_statuses ts ON t.status_id = ts.id
JOIN departments d ON t.department_id = d.id
LEFT JOIN team_members a ON t.assignee_id = a.id
LEFT JOIN projects p ON t.project_id = p.id;

-- ============================================
-- Triggers for updates
-- ============================================

CREATE TRIGGER update_global_tags_updated_at BEFORE UPDATE ON global_tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_columns_updated_at BEFORE UPDATE ON custom_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_column_values_updated_at BEFORE UPDATE ON task_column_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_board_views_updated_at BEFORE UPDATE ON board_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_saved_views_updated_at BEFORE UPDATE ON user_saved_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_visibility_updated_at BEFORE UPDATE ON pricing_visibility_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
