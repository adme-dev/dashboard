-- ============================================
-- Project Templates Schema
-- Reusable project structures with tasks, milestones, and budgets
-- ============================================

-- ============================================
-- Project Templates (Master)
-- ============================================
CREATE TABLE IF NOT EXISTS project_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Classification
  category VARCHAR(100), -- e.g., 'Web Development', 'Marketing Campaign', 'Brand Identity'
  tags TEXT[],

  -- Default settings
  default_budget_type VARCHAR(50) CHECK (default_budget_type IN ('fixed', 'time_materials', 'retainer_allocation', 'media_commission')),
  default_budget_amount DECIMAL(12, 2),
  estimated_duration_days INTEGER,
  estimated_hours DECIMAL(8, 2),

  -- Billing defaults
  default_hourly_rate DECIMAL(10, 2),
  default_billing_method VARCHAR(50) DEFAULT 'hourly' CHECK (default_billing_method IN ('hourly', 'fixed', 'milestone', 'retainer')),

  -- Visibility
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false, -- Visible to all team members
  is_system BOOLEAN DEFAULT false, -- System templates can't be deleted

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- AI Generation Support
  estimated_budget_min DECIMAL(12, 2),
  estimated_budget_max DECIMAL(12, 2),
  default_project_type VARCHAR(50),
  phases JSONB DEFAULT '[]', -- High-level stages for AI generation
  default_tasks JSONB DEFAULT '[]', -- Task templates for AI generation
  required_skills JSONB DEFAULT '[]', -- Skills needed
  recommended_team_size INTEGER,
  discovery_questions JSONB DEFAULT '[]', -- Questions to ask client
  ai_context TEXT, -- Additional context for AI when generating

  -- Ownership
  created_by UUID REFERENCES team_members(id),
  department_id UUID REFERENCES departments(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_templates_category ON project_templates(category);
CREATE INDEX IF NOT EXISTS idx_project_templates_active ON project_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_project_templates_department ON project_templates(department_id);

-- ============================================
-- Template Phases/Milestones
-- ============================================
CREATE TABLE IF NOT EXISTS template_phases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Ordering and timing
  sort_order INTEGER DEFAULT 0,
  duration_days INTEGER,

  -- Dependencies
  depends_on_phase_id UUID REFERENCES template_phases(id) ON DELETE SET NULL,

  -- Budget allocation (percentage of project budget)
  budget_percentage DECIMAL(5, 2),

  -- Deliverables
  deliverables TEXT[],

  -- Approval requirements
  requires_client_approval BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_phases_template ON template_phases(template_id);
CREATE INDEX IF NOT EXISTS idx_template_phases_order ON template_phases(template_id, sort_order);

-- ============================================
-- Template Tasks
-- ============================================
CREATE TABLE IF NOT EXISTS template_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES template_phases(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES template_tasks(id) ON DELETE CASCADE,

  -- Task details
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Estimates
  estimated_hours DECIMAL(6, 2),

  -- Timing (relative to phase start)
  start_day_offset INTEGER DEFAULT 0, -- Days after phase/project start
  duration_days INTEGER,

  -- Assignment
  default_role VARCHAR(100), -- e.g., 'Designer', 'Developer', 'Project Manager'
  default_department_id UUID REFERENCES departments(id),

  -- Task properties
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  task_type VARCHAR(50) DEFAULT 'task' CHECK (task_type IN ('task', 'milestone', 'deliverable', 'review', 'approval')),

  -- Dependencies (within template)
  depends_on_task_ids UUID[],

  -- Checklist items
  checklist JSONB,

  -- Tags
  tags TEXT[],

  -- Billable
  billable BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_tasks_template ON template_tasks(template_id);
CREATE INDEX IF NOT EXISTS idx_template_tasks_phase ON template_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_template_tasks_parent ON template_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_template_tasks_order ON template_tasks(template_id, phase_id, sort_order);

-- ============================================
-- Template Team Roles (Default assignments)
-- ============================================
CREATE TABLE IF NOT EXISTS template_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,

  role_name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Allocation
  estimated_hours DECIMAL(6, 2),
  hourly_rate DECIMAL(10, 2),

  -- Required skills
  required_skills TEXT[],

  -- Assignment
  department_id UUID REFERENCES departments(id),
  default_member_id UUID REFERENCES team_members(id), -- Optional default assignee

  -- Capacity
  allocation_percentage DECIMAL(5, 2) DEFAULT 100, -- How much of their time

  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_roles_template ON template_roles(template_id);

-- ============================================
-- Template Documents (Attachments)
-- ============================================
CREATE TABLE IF NOT EXISTS template_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,
  document_type VARCHAR(50), -- 'brief', 'contract', 'checklist', 'guideline'

  -- File or content
  file_url TEXT,
  content TEXT, -- For inline documents/templates

  -- Usage
  include_on_creation BOOLEAN DEFAULT true,

  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_documents_template ON template_documents(template_id);

-- ============================================
-- Template Usage History
-- ============================================
CREATE TABLE IF NOT EXISTS template_usage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  used_by UUID REFERENCES team_members(id),
  used_at TIMESTAMPTZ DEFAULT NOW(),

  -- Customizations made
  customizations JSONB,

  -- Feedback
  feedback TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX IF NOT EXISTS idx_template_usage_template ON template_usage_history(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_project ON template_usage_history(project_id);

-- ============================================
-- Views
-- ============================================

-- Template Overview
DROP VIEW IF EXISTS v_template_overview;
CREATE VIEW v_template_overview AS
SELECT
  pt.id,
  pt.name,
  pt.description,
  pt.category,
  pt.tags,
  pt.default_budget_type,
  pt.default_budget_amount,
  pt.estimated_duration_days,
  pt.estimated_hours,
  pt.is_active,
  pt.is_public,
  pt.times_used,
  pt.last_used_at,
  pt.created_at,
  tm.name AS created_by_name,
  d.name AS department_name,
  COALESCE(phases.count, 0) AS phase_count,
  COALESCE(tasks.count, 0) AS task_count,
  COALESCE(roles.count, 0) AS role_count,
  COALESCE(tasks.total_hours, 0) AS total_estimated_hours
FROM project_templates pt
LEFT JOIN team_members tm ON pt.created_by = tm.id
LEFT JOIN departments d ON pt.department_id = d.id
LEFT JOIN (
  SELECT template_id, COUNT(*) AS count
  FROM template_phases
  GROUP BY template_id
) phases ON pt.id = phases.template_id
LEFT JOIN (
  SELECT template_id, COUNT(*) AS count, SUM(estimated_hours) AS total_hours
  FROM template_tasks
  GROUP BY template_id
) tasks ON pt.id = tasks.template_id
LEFT JOIN (
  SELECT template_id, COUNT(*) AS count
  FROM template_roles
  GROUP BY template_id
) roles ON pt.id = roles.template_id;

-- ============================================
-- Functions
-- ============================================

-- Create project from template
CREATE OR REPLACE FUNCTION create_project_from_template(
  p_template_id UUID,
  p_client_id UUID,
  p_project_name VARCHAR(255),
  p_start_date DATE,
  p_created_by UUID,
  p_budget_override DECIMAL(12, 2) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_template RECORD;
  v_project_id UUID;
  v_phase RECORD;
  v_phase_map JSONB := '{}';
  v_task RECORD;
  v_task_map JSONB := '{}';
  v_new_task_id UUID;
  v_new_phase_start DATE;
BEGIN
  -- Get template
  SELECT * INTO v_template FROM project_templates WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  -- Create project
  INSERT INTO projects (
    name,
    client_id,
    status,
    budget_type,
    budget_amount,
    start_date,
    end_date,
    created_by
  ) VALUES (
    p_project_name,
    p_client_id,
    'active',
    v_template.default_budget_type,
    COALESCE(p_budget_override, v_template.default_budget_amount),
    p_start_date,
    p_start_date + COALESCE(v_template.estimated_duration_days, 30),
    p_created_by
  ) RETURNING id INTO v_project_id;

  -- Create tasks from template (simplified - phases and tasks)
  v_new_phase_start := p_start_date;

  FOR v_task IN
    SELECT *
    FROM template_tasks
    WHERE template_id = p_template_id
    ORDER BY phase_id NULLS FIRST, sort_order
  LOOP
    INSERT INTO tasks (
      project_id,
      title,
      description,
      priority,
      task_type,
      estimated_hours,
      due_date,
      created_by
    ) VALUES (
      v_project_id,
      v_task.title,
      v_task.description,
      v_task.priority,
      v_task.task_type,
      v_task.estimated_hours,
      p_start_date + COALESCE(v_task.start_day_offset, 0) + COALESCE(v_task.duration_days, 1),
      p_created_by
    ) RETURNING id INTO v_new_task_id;

    -- Store mapping for dependencies
    v_task_map := v_task_map || jsonb_build_object(v_task.id::text, v_new_task_id::text);
  END LOOP;

  -- Update template usage
  UPDATE project_templates
  SET
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE id = p_template_id;

  -- Record usage
  INSERT INTO template_usage_history (template_id, project_id, used_by)
  VALUES (p_template_id, v_project_id, p_created_by);

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_project_templates_updated_at BEFORE UPDATE ON project_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_template_phases_updated_at BEFORE UPDATE ON template_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_template_tasks_updated_at BEFORE UPDATE ON template_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Seed Data - Common Templates with AI Support
-- ============================================

-- Website Redesign Template (AI-ready)
INSERT INTO project_templates (
  name, description, category, default_budget_type, estimated_duration_days, estimated_hours,
  estimated_budget_min, estimated_budget_max, default_project_type, is_public, is_system,
  phases, default_tasks, required_skills, recommended_team_size, discovery_questions
)
VALUES (
  'Website Redesign',
  'Complete website redesign project including UX research, design, and development',
  'Web Development',
  'time_materials',
  60,
  200,
  25000,
  75000,
  'fixed',
  true,
  true,
  '[
    {"name": "Discovery", "duration_days": 10, "deliverables": ["Project Brief", "Sitemap", "Content Audit"]},
    {"name": "Design", "duration_days": 20, "deliverables": ["Wireframes", "UI Design", "Style Guide"]},
    {"name": "Development", "duration_days": 25, "deliverables": ["Frontend", "CMS Integration", "Testing"]},
    {"name": "Launch", "duration_days": 5, "deliverables": ["Deployment", "Training", "Documentation"]}
  ]',
  '[
    {"name": "Project Kickoff", "phase": "Discovery", "hours": 2, "required_skills": ["project_management"]},
    {"name": "Stakeholder Interviews", "phase": "Discovery", "hours": 8, "required_skills": ["strategy"]},
    {"name": "Content Audit", "phase": "Discovery", "hours": 12, "required_skills": ["strategy", "copywriting"]},
    {"name": "Wireframes", "phase": "Design", "hours": 24, "required_skills": ["design"]},
    {"name": "UI Design - Homepage", "phase": "Design", "hours": 16, "required_skills": ["design"]},
    {"name": "UI Design - Inner Pages", "phase": "Design", "hours": 32, "required_skills": ["design"]},
    {"name": "Frontend Development", "phase": "Development", "hours": 80, "required_skills": ["development"]},
    {"name": "CMS Integration", "phase": "Development", "hours": 24, "required_skills": ["development"]},
    {"name": "QA Testing", "phase": "Development", "hours": 16, "required_skills": ["qa"]},
    {"name": "Deployment", "phase": "Launch", "hours": 8, "required_skills": ["development"]}
  ]',
  '["design", "development", "strategy", "project_management"]',
  4,
  '[
    {"question": "What is the primary goal of the new website?", "type": "text", "required": true},
    {"question": "Who is your target audience?", "type": "text", "required": true},
    {"question": "Do you have existing brand guidelines?", "type": "boolean", "required": true},
    {"question": "How many pages do you need?", "type": "number", "required": true},
    {"question": "Do you need a CMS?", "type": "boolean", "required": true},
    {"question": "Any specific features or integrations needed?", "type": "text", "required": false}
  ]'
) ON CONFLICT DO NOTHING;

-- Marketing Campaign Template (AI-ready)
INSERT INTO project_templates (
  name, description, category, default_budget_type, estimated_duration_days, estimated_hours,
  estimated_budget_min, estimated_budget_max, default_project_type, is_public, is_system,
  phases, default_tasks, required_skills, recommended_team_size, discovery_questions
)
VALUES (
  'Marketing Campaign',
  'Multi-channel marketing campaign including strategy, creative, and execution',
  'Marketing',
  'fixed',
  45,
  120,
  20000,
  60000,
  'retainer',
  true,
  true,
  '[
    {"name": "Strategy", "duration_days": 10, "deliverables": ["Campaign Strategy", "Media Plan", "Creative Brief"]},
    {"name": "Creative Development", "duration_days": 15, "deliverables": ["Ad Creative", "Copy", "Landing Pages"]},
    {"name": "Execution", "duration_days": 15, "deliverables": ["Campaign Launch", "Monitoring", "Optimization"]},
    {"name": "Reporting", "duration_days": 5, "deliverables": ["Performance Report", "Recommendations"]}
  ]',
  '[
    {"name": "Campaign Strategy Development", "phase": "Strategy", "hours": 16, "required_skills": ["strategy", "marketing"]},
    {"name": "Audience Research", "phase": "Strategy", "hours": 12, "required_skills": ["marketing"]},
    {"name": "Media Planning", "phase": "Strategy", "hours": 8, "required_skills": ["marketing"]},
    {"name": "Creative Concepting", "phase": "Creative Development", "hours": 16, "required_skills": ["design", "copywriting"]},
    {"name": "Ad Design", "phase": "Creative Development", "hours": 24, "required_skills": ["design"]},
    {"name": "Copywriting", "phase": "Creative Development", "hours": 16, "required_skills": ["copywriting"]},
    {"name": "Landing Page Design", "phase": "Creative Development", "hours": 16, "required_skills": ["design"]},
    {"name": "Campaign Setup", "phase": "Execution", "hours": 8, "required_skills": ["marketing"]},
    {"name": "Campaign Monitoring", "phase": "Execution", "hours": 20, "required_skills": ["marketing"]},
    {"name": "Performance Reporting", "phase": "Reporting", "hours": 8, "required_skills": ["marketing"]}
  ]',
  '["marketing", "design", "copywriting", "strategy"]',
  3,
  '[
    {"question": "What is the campaign objective?", "type": "text", "required": true},
    {"question": "What is your target audience?", "type": "text", "required": true},
    {"question": "What channels do you want to use?", "type": "text", "required": true},
    {"question": "What is your campaign budget?", "type": "number", "required": true},
    {"question": "When should the campaign launch?", "type": "date", "required": true}
  ]'
) ON CONFLICT DO NOTHING;

-- Brand Identity Template (AI-ready)
INSERT INTO project_templates (
  name, description, category, default_budget_type, estimated_duration_days, estimated_hours,
  estimated_budget_min, estimated_budget_max, default_project_type, is_public, is_system,
  phases, default_tasks, required_skills, recommended_team_size, discovery_questions
)
VALUES (
  'Brand Identity',
  'Complete brand identity development including logo, colors, typography, and brand guidelines',
  'Branding',
  'fixed',
  30,
  80,
  15000,
  40000,
  'fixed',
  true,
  true,
  '[
    {"name": "Discovery", "duration_days": 5, "deliverables": ["Brand Brief", "Competitor Analysis"]},
    {"name": "Concept", "duration_days": 10, "deliverables": ["Logo Concepts", "Moodboards"]},
    {"name": "Refinement", "duration_days": 10, "deliverables": ["Final Logo", "Color Palette", "Typography"]},
    {"name": "Delivery", "duration_days": 5, "deliverables": ["Brand Guidelines", "Asset Package"]}
  ]',
  '[
    {"name": "Brand Discovery Workshop", "phase": "Discovery", "hours": 4, "required_skills": ["strategy", "design"]},
    {"name": "Competitor Analysis", "phase": "Discovery", "hours": 8, "required_skills": ["strategy"]},
    {"name": "Logo Concepts", "phase": "Concept", "hours": 24, "required_skills": ["design"]},
    {"name": "Moodboard Creation", "phase": "Concept", "hours": 8, "required_skills": ["design"]},
    {"name": "Logo Refinement", "phase": "Refinement", "hours": 16, "required_skills": ["design"]},
    {"name": "Color Palette Development", "phase": "Refinement", "hours": 8, "required_skills": ["design"]},
    {"name": "Typography Selection", "phase": "Refinement", "hours": 4, "required_skills": ["design"]},
    {"name": "Brand Guidelines Document", "phase": "Delivery", "hours": 16, "required_skills": ["design"]},
    {"name": "Asset Package Preparation", "phase": "Delivery", "hours": 8, "required_skills": ["design"]}
  ]',
  '["design", "strategy"]',
  2,
  '[
    {"question": "Describe your company in 3 words", "type": "text", "required": true},
    {"question": "Who are your main competitors?", "type": "text", "required": true},
    {"question": "What emotions should your brand evoke?", "type": "text", "required": true},
    {"question": "Any colors to avoid?", "type": "text", "required": false},
    {"question": "Where will the logo be used most?", "type": "text", "required": true}
  ]'
) ON CONFLICT DO NOTHING;
