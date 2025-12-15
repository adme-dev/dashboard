-- ============================================
-- Project Brief Submission System Schema
-- Supports Marketing, Advertising, Website, IT, Support briefs
-- ============================================

-- ============================================
-- 1. Brief Categories (Top-level organization)
-- ============================================

CREATE TABLE brief_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'file-text',
  color VARCHAR(7) DEFAULT '#6B7280',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO brief_categories (name, slug, description, icon, color, sort_order) VALUES
  ('Marketing', 'marketing', 'Marketing campaigns, content, and promotional materials', 'megaphone', '#8B5CF6', 1),
  ('Advertising', 'advertising', 'Ad campaigns, creative assets, and media buying', 'tv', '#F59E0B', 2),
  ('Digital Marketing', 'digital-marketing', 'Facebook, Google, TikTok, and Instagram advertising campaigns', 'target', '#EC4899', 3),
  ('Website', 'website', 'Web development, redesigns, and updates', 'globe', '#3B82F6', 4),
  ('IT Request', 'it-request', 'Hardware, software, access, and technical support', 'monitor', '#10B981', 5),
  ('Support Ticket', 'support', 'General support requests and issue reporting', 'life-buoy', '#EF4444', 6);

-- ============================================
-- 2. Brief Templates (Form structures per category)
-- ============================================

CREATE TABLE brief_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES brief_categories(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  description TEXT,
  icon VARCHAR(50),

  -- Workflow settings
  requires_approval BOOLEAN DEFAULT true,
  auto_assign_to UUID REFERENCES team_members(id), -- Auto-assign to specific person
  auto_assign_department UUID REFERENCES departments(id), -- Or auto-assign to department
  default_priority VARCHAR(20) DEFAULT 'medium',

  -- Form settings
  is_multi_step BOOLEAN DEFAULT false, -- Wizard-style or single page
  show_progress BOOLEAN DEFAULT true,
  allow_drafts BOOLEAN DEFAULT true,
  allow_attachments BOOLEAN DEFAULT true,
  max_attachments INTEGER DEFAULT 10,

  -- Access control
  is_public BOOLEAN DEFAULT false, -- Can external clients submit?
  require_client_link BOOLEAN DEFAULT false, -- Must be linked to a client

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(category_id, slug)
);

CREATE INDEX idx_brief_templates_category ON brief_templates(category_id);
CREATE INDEX idx_brief_templates_department ON brief_templates(department_id);
CREATE INDEX idx_brief_templates_active ON brief_templates(is_active);

-- ============================================
-- 3. Template Field Definitions
-- ============================================

CREATE TABLE brief_template_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES brief_templates(id) ON DELETE CASCADE,

  -- Field identification
  field_key VARCHAR(50) NOT NULL, -- Programmatic key (e.g., 'project_name')
  field_label VARCHAR(100) NOT NULL, -- Display label
  field_type VARCHAR(30) NOT NULL CHECK (field_type IN (
    'text', 'textarea', 'richtext', 'number', 'currency',
    'date', 'daterange', 'datetime', 'time',
    'dropdown', 'multiselect', 'checkbox', 'checkboxgroup', 'radio',
    'file', 'files', 'image', 'images',
    'url', 'email', 'phone',
    'rating', 'slider', 'color',
    'user', 'users', 'client', 'project', 'department',
    'heading', 'paragraph', 'divider' -- Layout elements
  )),

  -- Field configuration
  placeholder TEXT,
  help_text TEXT,
  default_value JSONB,

  -- Validation
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB DEFAULT '{}', -- {min, max, minLength, maxLength, pattern, etc.}

  -- Options for select/radio/checkbox fields
  options JSONB DEFAULT '[]', -- [{value, label, color?}]

  -- Conditional logic
  conditional_logic JSONB, -- {field_key, operator, value, action}

  -- Layout
  step_number INTEGER DEFAULT 1, -- For multi-step forms
  step_title VARCHAR(100), -- Step name for multi-step
  section VARCHAR(100), -- Group fields into sections
  width VARCHAR(20) DEFAULT 'full', -- 'full', 'half', 'third'
  sort_order INTEGER DEFAULT 0,

  -- Display
  show_in_preview BOOLEAN DEFAULT true, -- Show in brief preview/summary
  show_in_list BOOLEAN DEFAULT false, -- Show as column in brief list

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, field_key)
);

CREATE INDEX idx_brief_fields_template ON brief_template_fields(template_id);
CREATE INDEX idx_brief_fields_sort ON brief_template_fields(template_id, step_number, sort_order);

-- ============================================
-- 4. Brief Submissions
-- ============================================

CREATE TABLE briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES brief_templates(id),

  -- Reference number for tracking
  reference_number VARCHAR(20) NOT NULL UNIQUE,

  -- Submission info
  title VARCHAR(255) NOT NULL,
  submitted_by UUID REFERENCES team_members(id), -- Internal submitter
  submitted_by_name VARCHAR(100), -- For external/guest submissions
  submitted_by_email VARCHAR(255), -- For external/guest submissions

  -- Relationships
  client_id UUID REFERENCES agency_clients(id),
  project_id UUID REFERENCES projects(id), -- If linked to existing project
  department_id UUID REFERENCES departments(id),

  -- Status tracking
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'under_review', 'needs_info',
    'approved', 'rejected', 'in_progress', 'completed', 'cancelled'
  )),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Assignment
  assigned_to UUID REFERENCES team_members(id),
  assigned_at TIMESTAMPTZ,

  -- Review
  reviewed_by UUID REFERENCES team_members(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Conversion
  converted_to_task_id UUID REFERENCES tasks(id),
  converted_to_project_id UUID REFERENCES projects(id),
  converted_at TIMESTAMPTZ,

  -- Timing
  requested_deadline DATE,
  estimated_completion DATE,

  -- Budget
  budget_min DECIMAL(12, 2),
  budget_max DECIMAL(12, 2),
  budget_currency VARCHAR(3) DEFAULT 'USD',

  -- Metadata
  source VARCHAR(50) DEFAULT 'internal', -- 'internal', 'client_portal', 'email', 'api'
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_briefs_template ON briefs(template_id);
CREATE INDEX idx_briefs_status ON briefs(status);
CREATE INDEX idx_briefs_submitted_by ON briefs(submitted_by);
CREATE INDEX idx_briefs_assigned_to ON briefs(assigned_to);
CREATE INDEX idx_briefs_client ON briefs(client_id);
CREATE INDEX idx_briefs_department ON briefs(department_id);
CREATE INDEX idx_briefs_created ON briefs(created_at DESC);
CREATE INDEX idx_briefs_reference ON briefs(reference_number);

-- ============================================
-- 5. Brief Field Values (Submitted data)
-- ============================================

CREATE TABLE brief_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES brief_template_fields(id),

  -- Store value as JSONB for flexibility
  value JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(brief_id, field_id)
);

CREATE INDEX idx_brief_values_brief ON brief_field_values(brief_id);
CREATE INDEX idx_brief_values_field ON brief_field_values(field_id);

-- ============================================
-- 6. Brief Attachments
-- ============================================

CREATE TABLE brief_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  field_id UUID REFERENCES brief_template_fields(id), -- Optional link to specific field

  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER, -- bytes
  thumbnail_url TEXT,

  uploaded_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brief_attachments_brief ON brief_attachments(brief_id);

-- ============================================
-- 7. Brief Comments/Discussion
-- ============================================

CREATE TABLE brief_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES brief_comments(id) ON DELETE CASCADE, -- For threaded comments

  user_id UUID REFERENCES team_members(id),
  content TEXT NOT NULL,

  is_internal BOOLEAN DEFAULT false, -- Internal comments not visible to clients
  is_resolution BOOLEAN DEFAULT false, -- Marks this as resolution/answer

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brief_comments_brief ON brief_comments(brief_id);
CREATE INDEX idx_brief_comments_parent ON brief_comments(parent_id);

-- ============================================
-- 8. Brief Activity Log
-- ============================================

CREATE TABLE brief_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES team_members(id),

  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
    'created', 'submitted', 'updated', 'status_changed',
    'assigned', 'unassigned', 'commented', 'attachment_added',
    'reviewed', 'approved', 'rejected', 'needs_info',
    'converted_to_task', 'converted_to_project',
    'priority_changed', 'deadline_changed', 'completed', 'cancelled'
  )),

  old_value JSONB,
  new_value JSONB,
  content TEXT, -- Additional context

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brief_activities_brief ON brief_activities(brief_id);
CREATE INDEX idx_brief_activities_created ON brief_activities(brief_id, created_at DESC);

-- ============================================
-- 9. Brief Watchers (Notifications)
-- ============================================

CREATE TABLE brief_watchers (
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,

  notify_on_update BOOLEAN DEFAULT true,
  notify_on_comment BOOLEAN DEFAULT true,
  notify_on_status_change BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (brief_id, user_id)
);

-- ============================================
-- 10. Views
-- ============================================

-- Brief Summary View
CREATE OR REPLACE VIEW v_brief_summary AS
SELECT
  b.id,
  b.reference_number,
  b.title,
  b.status,
  b.priority,
  b.source,
  b.budget_min,
  b.budget_max,
  b.budget_currency,
  b.requested_deadline,
  b.created_at,
  b.submitted_at,
  b.completed_at,

  -- Template info
  bt.id AS template_id,
  bt.name AS template_name,
  bt.slug AS template_slug,

  -- Category info
  bc.id AS category_id,
  bc.name AS category_name,
  bc.slug AS category_slug,
  bc.icon AS category_icon,
  bc.color AS category_color,

  -- Submitter
  b.submitted_by,
  COALESCE(sm.name, b.submitted_by_name) AS submitter_name,
  COALESCE(sm.email, b.submitted_by_email) AS submitter_email,

  -- Assignment
  b.assigned_to,
  am.name AS assignee_name,
  am.email AS assignee_email,

  -- Client
  b.client_id,
  c.name AS client_name,

  -- Department
  b.department_id,
  d.name AS department_name,
  d.color AS department_color,

  -- Counts
  (SELECT COUNT(*) FROM brief_comments bc2 WHERE bc2.brief_id = b.id) AS comment_count,
  (SELECT COUNT(*) FROM brief_attachments ba WHERE ba.brief_id = b.id) AS attachment_count

FROM briefs b
JOIN brief_templates bt ON b.template_id = bt.id
JOIN brief_categories bc ON bt.category_id = bc.id
LEFT JOIN team_members sm ON b.submitted_by = sm.id
LEFT JOIN team_members am ON b.assigned_to = am.id
LEFT JOIN agency_clients c ON b.client_id = c.id
LEFT JOIN departments d ON b.department_id = d.id;

-- ============================================
-- 11. Functions
-- ============================================

-- Generate reference number
CREATE OR REPLACE FUNCTION generate_brief_reference()
RETURNS TRIGGER AS $$
DECLARE
  category_prefix VARCHAR(3);
  year_suffix VARCHAR(2);
  sequence_num INTEGER;
BEGIN
  -- Get category prefix
  SELECT UPPER(LEFT(slug, 3)) INTO category_prefix
  FROM brief_categories bc
  JOIN brief_templates bt ON bc.id = bt.category_id
  WHERE bt.id = NEW.template_id;

  -- Get year suffix
  year_suffix := TO_CHAR(NOW(), 'YY');

  -- Get next sequence number for this category/year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(reference_number FROM '[0-9]+$') AS INTEGER)
  ), 0) + 1 INTO sequence_num
  FROM briefs b
  JOIN brief_templates bt ON b.template_id = bt.id
  JOIN brief_categories bc ON bt.category_id = bc.id
  WHERE UPPER(LEFT(bc.slug, 3)) = category_prefix
    AND TO_CHAR(b.created_at, 'YY') = year_suffix;

  -- Generate reference: MAR-25-0001
  NEW.reference_number := category_prefix || '-' || year_suffix || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_brief_reference
  BEFORE INSERT ON briefs
  FOR EACH ROW
  WHEN (NEW.reference_number IS NULL)
  EXECUTE FUNCTION generate_brief_reference();

-- Update timestamps
CREATE TRIGGER update_brief_categories_updated_at BEFORE UPDATE ON brief_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brief_templates_updated_at BEFORE UPDATE ON brief_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_briefs_updated_at BEFORE UPDATE ON briefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brief_field_values_updated_at BEFORE UPDATE ON brief_field_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brief_comments_updated_at BEFORE UPDATE ON brief_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. Default Templates
-- ============================================

-- Marketing Brief Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'Marketing Campaign Brief', 'marketing-campaign', 'Submit a new marketing campaign request', 'megaphone', true, true, 'medium'
FROM brief_categories bc WHERE bc.slug = 'marketing';

-- Advertising Brief Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'Advertising Creative Brief', 'ad-creative', 'Request advertising creative assets', 'palette', true, true, 'medium'
FROM brief_categories bc WHERE bc.slug = 'advertising';

-- Website Brief Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'Website Development Brief', 'website-dev', 'Request website development or updates', 'code', true, true, 'medium'
FROM brief_categories bc WHERE bc.slug = 'website';

-- IT Request Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'IT Support Request', 'it-support', 'Submit an IT support or hardware/software request', 'wrench', false, false, 'medium'
FROM brief_categories bc WHERE bc.slug = 'it-request';

-- Support Ticket Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'Support Ticket', 'support-ticket', 'Submit a general support request', 'help-circle', false, false, 'medium'
FROM brief_categories bc WHERE bc.slug = 'support';

-- ============================================
-- Digital Marketing Templates
-- ============================================

-- Facebook Ads Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'Facebook Ads Campaign', 'facebook-ads', 'Launch Facebook advertising campaigns with targeted audience reach', 'facebook', true, true, 'medium'
FROM brief_categories bc WHERE bc.slug = 'digital-marketing';

-- Google Ads Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'Google Ads Campaign', 'google-ads', 'Create Google Search, Display, or YouTube advertising campaigns', 'search', true, true, 'medium'
FROM brief_categories bc WHERE bc.slug = 'digital-marketing';

-- TikTok Ads Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'TikTok Ads Campaign', 'tiktok-ads', 'Create engaging TikTok advertising campaigns for younger audiences', 'video', true, true, 'medium'
FROM brief_categories bc WHERE bc.slug = 'digital-marketing';

-- Instagram Ads Template
INSERT INTO brief_templates (category_id, name, slug, description, icon, requires_approval, is_multi_step, default_priority)
SELECT bc.id, 'Instagram Ads Campaign', 'instagram-ads', 'Launch Instagram Feed, Stories, and Reels advertising campaigns', 'instagram', true, true, 'medium'
FROM brief_categories bc WHERE bc.slug = 'digital-marketing';
