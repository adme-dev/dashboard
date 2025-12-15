-- ============================================
-- Agency Workflow Management Schema
-- Monday.com-style task and department management
-- ============================================

-- ============================================
-- 1.1 Departments
-- ============================================

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7) NOT NULL DEFAULT '#6B7280', -- Hex color
  icon VARCHAR(50) DEFAULT 'briefcase', -- Lucide icon name
  manager_id UUID REFERENCES team_members(id),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_departments_active ON departments(is_active);
CREATE INDEX idx_departments_slug ON departments(slug);

-- Department Members (many-to-many with roles)
CREATE TABLE department_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('lead', 'senior', 'member', 'junior')),
  is_primary BOOLEAN DEFAULT false, -- Primary department for this member
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, team_member_id)
);

CREATE INDEX idx_dept_members_dept ON department_members(department_id);
CREATE INDEX idx_dept_members_member ON department_members(team_member_id);

-- Add department_id to team_members as shortcut for primary department
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

-- ============================================
-- 1.2 Task Statuses (Configurable Workflow Stages)
-- ============================================

CREATE TABLE task_statuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for global statuses
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6B7280',
  icon VARCHAR(50),
  category VARCHAR(50) NOT NULL CHECK (category IN ('not_started', 'in_progress', 'review', 'done', 'cancelled')),
  is_default BOOLEAN DEFAULT false, -- Default status for new tasks
  is_final BOOLEAN DEFAULT false, -- Marks task as complete
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, slug)
);

CREATE INDEX idx_task_statuses_dept ON task_statuses(department_id);
CREATE INDEX idx_task_statuses_category ON task_statuses(category);

-- ============================================
-- 1.2 Tasks
-- ============================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  department_id UUID NOT NULL REFERENCES departments(id),
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE, -- For subtasks
  status_id UUID NOT NULL REFERENCES task_statuses(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  task_type VARCHAR(50) DEFAULT 'task' CHECK (task_type IN ('task', 'milestone', 'bug', 'feature', 'review', 'meeting')),
  assignee_id UUID REFERENCES team_members(id), -- Primary assignee
  reporter_id UUID REFERENCES team_members(id), -- Who created the task
  due_date DATE,
  start_date DATE,
  estimated_hours DECIMAL(5, 2),
  actual_hours DECIMAL(5, 2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_blocked BOOLEAN DEFAULT false,
  blocked_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_department ON tasks(department_id);
CREATE INDEX idx_tasks_status ON tasks(status_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_reporter ON tasks(reporter_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_dept_status ON tasks(department_id, status_id);
CREATE INDEX idx_tasks_assignee_status ON tasks(assignee_id, status_id);

-- Multiple assignees support (reviewers, approvers, etc.)
CREATE TABLE task_assignees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'assignee' CHECK (role IN ('assignee', 'reviewer', 'approver', 'watcher')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, team_member_id, role)
);

CREATE INDEX idx_task_assignees_task ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_member ON task_assignees(team_member_id);

-- ============================================
-- 1.2 Task Labels
-- ============================================

CREATE TABLE task_labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6B7280',
  description TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for global labels
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, department_id)
);

CREATE INDEX idx_task_labels_dept ON task_labels(department_id);

-- Task-Label junction
CREATE TABLE task_label_assignments (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES task_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, label_id)
);

CREATE INDEX idx_task_label_assign_task ON task_label_assignments(task_id);
CREATE INDEX idx_task_label_assign_label ON task_label_assignments(label_id);

-- ============================================
-- 1.2 Task Dependencies
-- ============================================

CREATE TABLE task_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, -- The dependent task
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, -- The blocking task
  dependency_type VARCHAR(50) DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'is_blocked_by', 'relates_to')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, depends_on_task_id),
  CHECK (task_id != depends_on_task_id) -- Prevent self-reference
);

CREATE INDEX idx_task_deps_task ON task_dependencies(task_id);
CREATE INDEX idx_task_deps_depends ON task_dependencies(depends_on_task_id);

-- ============================================
-- 1.3 Task Activities (Activity Feed)
-- ============================================

CREATE TABLE task_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
    'created', 'updated', 'status_change', 'assignment', 'comment',
    'attachment', 'due_date_change', 'priority_change', 'label_change',
    'dependency_added', 'dependency_removed', 'approval_requested',
    'approved', 'rejected', 'completed', 'reopened'
  )),
  old_value JSONB, -- Previous state
  new_value JSONB, -- New state
  content TEXT, -- For comments
  is_internal BOOLEAN DEFAULT false, -- Internal comments not visible to clients
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_activities_task ON task_activities(task_id);
CREATE INDEX idx_task_activities_user ON task_activities(user_id);
CREATE INDEX idx_task_activities_type ON task_activities(activity_type);
CREATE INDEX idx_task_activities_created ON task_activities(task_id, created_at DESC);

-- ============================================
-- 1.3 Task Attachments
-- ============================================

CREATE TABLE task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER, -- in bytes
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);

-- ============================================
-- 1.4 Approval Workflows
-- ============================================

CREATE TABLE approval_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for global workflows
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Default workflow for department
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_workflows_dept ON approval_workflows(department_id);

-- Workflow Steps
CREATE TABLE approval_workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL, -- 'Internal Review', 'Client Review', 'Final Approval'
  description TEXT,
  approver_type VARCHAR(50) NOT NULL CHECK (approver_type IN (
    'specific_user', 'role', 'department_lead', 'project_manager', 'client', 'any_department_member'
  )),
  approver_id UUID REFERENCES team_members(id), -- For specific_user
  approver_role VARCHAR(50), -- For role-based (e.g., 'senior', 'lead')
  required_approvals INTEGER DEFAULT 1,
  can_skip BOOLEAN DEFAULT false,
  auto_approve_after_hours INTEGER, -- Auto-approve if no response
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, step_order)
);

CREATE INDEX idx_workflow_steps_workflow ON approval_workflow_steps(workflow_id);

-- Task Approval Records
CREATE TABLE task_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id),
  current_step_id UUID REFERENCES approval_workflow_steps(id),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_approvals_task ON task_approvals(task_id);
CREATE INDEX idx_task_approvals_status ON task_approvals(status);

-- Individual Step Approvals
CREATE TABLE task_approval_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_approval_id UUID NOT NULL REFERENCES task_approvals(id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES approval_workflow_steps(id),
  responded_by UUID REFERENCES team_members(id),
  response VARCHAR(50) CHECK (response IN ('approved', 'rejected', 'skipped')),
  comments TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_responses_approval ON task_approval_responses(task_approval_id);
CREATE INDEX idx_approval_responses_step ON task_approval_responses(workflow_step_id);

-- ============================================
-- 1.5 Views for Reporting
-- ============================================

-- Task Summary View
CREATE OR REPLACE VIEW v_task_summary AS
SELECT
  t.id,
  t.title,
  t.description,
  t.priority,
  t.task_type,
  t.due_date,
  t.start_date,
  t.estimated_hours,
  t.actual_hours,
  t.is_blocked,
  t.blocked_reason,
  t.sort_order,
  t.created_at,
  t.updated_at,
  t.completed_at,
  -- Status
  ts.id AS status_id,
  ts.name AS status_name,
  ts.color AS status_color,
  ts.category AS status_category,
  ts.is_final AS status_is_final,
  -- Department
  d.id AS department_id,
  d.name AS department_name,
  d.color AS department_color,
  d.slug AS department_slug,
  -- Project
  p.id AS project_id,
  p.name AS project_name,
  -- Client (through project)
  c.id AS client_id,
  c.name AS client_name,
  -- Assignee
  a.id AS assignee_id,
  a.name AS assignee_name,
  a.email AS assignee_email,
  -- Reporter
  r.id AS reporter_id,
  r.name AS reporter_name,
  -- Parent task
  t.parent_task_id,
  pt.title AS parent_task_title,
  -- Counts
  (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id) AS subtask_count,
  (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.completed_at IS NOT NULL) AS completed_subtask_count,
  (SELECT COUNT(*) FROM task_activities ta WHERE ta.task_id = t.id AND ta.activity_type = 'comment') AS comment_count,
  (SELECT COUNT(*) FROM task_attachments att WHERE att.task_id = t.id) AS attachment_count
FROM tasks t
JOIN task_statuses ts ON t.status_id = ts.id
JOIN departments d ON t.department_id = d.id
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN agency_clients c ON p.client_id = c.id
LEFT JOIN team_members a ON t.assignee_id = a.id
LEFT JOIN team_members r ON t.reporter_id = r.id
LEFT JOIN tasks pt ON t.parent_task_id = pt.id;

-- Department Workload View
CREATE OR REPLACE VIEW v_department_workload AS
SELECT
  d.id AS department_id,
  d.name AS department_name,
  d.color AS department_color,
  ts.category AS status_category,
  COUNT(t.id) AS task_count,
  SUM(t.estimated_hours) AS total_estimated_hours,
  SUM(t.actual_hours) AS total_actual_hours,
  COUNT(CASE WHEN t.due_date < CURRENT_DATE AND ts.is_final = false THEN 1 END) AS overdue_count,
  COUNT(CASE WHEN t.due_date = CURRENT_DATE THEN 1 END) AS due_today_count,
  COUNT(CASE WHEN t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 1 END) AS due_this_week_count
FROM departments d
LEFT JOIN tasks t ON d.id = t.department_id
LEFT JOIN task_statuses ts ON t.status_id = ts.id
WHERE d.is_active = true
GROUP BY d.id, d.name, d.color, ts.category;

-- Team Capacity View
CREATE OR REPLACE VIEW v_team_capacity AS
SELECT
  tm.id AS team_member_id,
  tm.name AS team_member_name,
  tm.email AS team_member_email,
  tm.target_utilization,
  d.id AS department_id,
  d.name AS department_name,
  -- Current week's assigned tasks
  COUNT(t.id) FILTER (WHERE t.due_date BETWEEN date_trunc('week', CURRENT_DATE) AND date_trunc('week', CURRENT_DATE) + INTERVAL '6 days') AS tasks_this_week,
  SUM(t.estimated_hours) FILTER (WHERE t.due_date BETWEEN date_trunc('week', CURRENT_DATE) AND date_trunc('week', CURRENT_DATE) + INTERVAL '6 days') AS estimated_hours_this_week,
  -- All active tasks
  COUNT(t.id) FILTER (WHERE ts.is_final = false) AS active_tasks,
  SUM(t.estimated_hours) FILTER (WHERE ts.is_final = false) AS total_estimated_hours,
  -- Overdue
  COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND ts.is_final = false) AS overdue_tasks,
  -- Completed this week
  COUNT(t.id) FILTER (WHERE t.completed_at >= date_trunc('week', CURRENT_DATE)) AS completed_this_week
FROM team_members tm
LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
LEFT JOIN departments d ON dm.department_id = d.id
LEFT JOIN tasks t ON tm.id = t.assignee_id
LEFT JOIN task_statuses ts ON t.status_id = ts.id
WHERE tm.is_active = true
GROUP BY tm.id, tm.name, tm.email, tm.target_utilization, d.id, d.name;

-- ============================================
-- Triggers
-- ============================================

-- Update timestamps
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approval_workflows_updated_at BEFORE UPDATE ON approval_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-set completed_at when task moves to final status
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_id != OLD.status_id THEN
    IF EXISTS (SELECT 1 FROM task_statuses WHERE id = NEW.status_id AND is_final = true) THEN
      NEW.completed_at = NOW();
    ELSE
      NEW.completed_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_task_completed_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();

-- Auto-calculate actual_hours from linked time entries
CREATE OR REPLACE FUNCTION update_task_actual_hours()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the task's actual_hours when time entries change
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE tasks SET actual_hours = (
      SELECT COALESCE(SUM(hours), 0)
      FROM time_entries
      WHERE project_id = NEW.project_id
      -- Note: In future, add task_id to time_entries for direct linking
    )
    WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger would need time_entries to have a task_id column
-- CREATE TRIGGER trigger_update_task_hours AFTER INSERT OR UPDATE ON time_entries
--   FOR EACH ROW EXECUTE FUNCTION update_task_actual_hours();
