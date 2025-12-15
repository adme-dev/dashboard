-- ============================================
-- Seed Data for Agency Workflow System
-- ============================================

-- ============================================
-- 1.6.1 Default Departments
-- ============================================

INSERT INTO departments (id, name, slug, description, color, icon, sort_order) VALUES
  ('d0000001-0000-0000-0000-000000000001', 'Creative', 'creative', 'Design, art direction, copywriting, and brand creative work', '#8B5CF6', 'palette', 1),
  ('d0000001-0000-0000-0000-000000000002', 'Marketing', 'marketing', 'Strategy, campaigns, analytics, and market research', '#F59E0B', 'megaphone', 2),
  ('d0000001-0000-0000-0000-000000000003', 'Production', 'production', 'Web development, video production, and print production', '#10B981', 'video', 3),
  ('d0000001-0000-0000-0000-000000000004', 'Account Services', 'account-services', 'Client relationships, project coordination, and communications', '#3B82F6', 'users', 4),
  ('d0000001-0000-0000-0000-000000000005', 'Operations', 'operations', 'Resource planning, traffic management, and internal operations', '#6B7280', 'settings', 5)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- 1.6.2 Default Task Statuses (Global)
-- ============================================

-- Global statuses (department_id = NULL)
INSERT INTO task_statuses (id, department_id, name, slug, color, icon, category, is_default, is_final, sort_order) VALUES
  -- Not Started
  ('s0000001-0000-0000-0000-000000000001', NULL, 'Backlog', 'backlog', '#6B7280', 'inbox', 'not_started', false, false, 1),
  ('s0000001-0000-0000-0000-000000000002', NULL, 'To Do', 'todo', '#3B82F6', 'circle', 'not_started', true, false, 2),
  -- In Progress
  ('s0000001-0000-0000-0000-000000000003', NULL, 'In Progress', 'in-progress', '#F59E0B', 'loader', 'in_progress', false, false, 3),
  ('s0000001-0000-0000-0000-000000000004', NULL, 'Revisions', 'revisions', '#EF4444', 'refresh-cw', 'in_progress', false, false, 4),
  -- Review
  ('s0000001-0000-0000-0000-000000000005', NULL, 'Internal Review', 'internal-review', '#8B5CF6', 'eye', 'review', false, false, 5),
  ('s0000001-0000-0000-0000-000000000006', NULL, 'Client Review', 'client-review', '#EC4899', 'user-check', 'review', false, false, 6),
  ('s0000001-0000-0000-0000-000000000007', NULL, 'Approved', 'approved', '#10B981', 'check-circle', 'review', false, false, 7),
  -- Done
  ('s0000001-0000-0000-0000-000000000008', NULL, 'Done', 'done', '#10B981', 'check-circle-2', 'done', false, true, 8),
  -- Cancelled
  ('s0000001-0000-0000-0000-000000000009', NULL, 'Cancelled', 'cancelled', '#6B7280', 'x-circle', 'cancelled', false, true, 9),
  -- On Hold
  ('s0000001-0000-0000-0000-000000000010', NULL, 'On Hold', 'on-hold', '#6B7280', 'pause-circle', 'not_started', false, false, 10)
ON CONFLICT (department_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  is_default = EXCLUDED.is_default,
  is_final = EXCLUDED.is_final,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- 1.6.3 Default Labels (Global)
-- ============================================

INSERT INTO task_labels (id, name, color, department_id) VALUES
  -- Priority/Urgency labels
  ('l0000001-0000-0000-0000-000000000001', 'Urgent', '#EF4444', NULL),
  ('l0000001-0000-0000-0000-000000000002', 'Important', '#F59E0B', NULL),
  -- Type labels
  ('l0000001-0000-0000-0000-000000000003', 'Bug', '#EF4444', NULL),
  ('l0000001-0000-0000-0000-000000000004', 'Feature', '#3B82F6', NULL),
  ('l0000001-0000-0000-0000-000000000005', 'Enhancement', '#8B5CF6', NULL),
  ('l0000001-0000-0000-0000-000000000006', 'Documentation', '#6B7280', NULL),
  -- Work type labels
  ('l0000001-0000-0000-0000-000000000007', 'Design', '#EC4899', NULL),
  ('l0000001-0000-0000-0000-000000000008', 'Development', '#10B981', NULL),
  ('l0000001-0000-0000-0000-000000000009', 'Copywriting', '#F59E0B', NULL),
  ('l0000001-0000-0000-0000-000000000010', 'Strategy', '#3B82F6', NULL),
  ('l0000001-0000-0000-0000-000000000011', 'Research', '#8B5CF6', NULL),
  ('l0000001-0000-0000-0000-000000000012', 'Meeting', '#6B7280', NULL),
  -- Client-related
  ('l0000001-0000-0000-0000-000000000013', 'Client Request', '#EC4899', NULL),
  ('l0000001-0000-0000-0000-000000000014', 'Internal', '#6B7280', NULL),
  -- Status helpers
  ('l0000001-0000-0000-0000-000000000015', 'Blocked', '#EF4444', NULL),
  ('l0000001-0000-0000-0000-000000000016', 'Needs Info', '#F59E0B', NULL)
ON CONFLICT (name, department_id) DO UPDATE SET
  color = EXCLUDED.color;

-- ============================================
-- Department-Specific Labels
-- ============================================

-- Creative Department Labels
INSERT INTO task_labels (name, color, department_id) VALUES
  ('Brand', '#8B5CF6', 'd0000001-0000-0000-0000-000000000001'),
  ('Social Media', '#EC4899', 'd0000001-0000-0000-0000-000000000001'),
  ('Print', '#6B7280', 'd0000001-0000-0000-0000-000000000001'),
  ('Digital', '#3B82F6', 'd0000001-0000-0000-0000-000000000001'),
  ('Video', '#10B981', 'd0000001-0000-0000-0000-000000000001')
ON CONFLICT (name, department_id) DO NOTHING;

-- Marketing Department Labels
INSERT INTO task_labels (name, color, department_id) VALUES
  ('SEO', '#10B981', 'd0000001-0000-0000-0000-000000000002'),
  ('PPC', '#3B82F6', 'd0000001-0000-0000-0000-000000000002'),
  ('Social Ads', '#EC4899', 'd0000001-0000-0000-0000-000000000002'),
  ('Email', '#F59E0B', 'd0000001-0000-0000-0000-000000000002'),
  ('Analytics', '#8B5CF6', 'd0000001-0000-0000-0000-000000000002')
ON CONFLICT (name, department_id) DO NOTHING;

-- Production Department Labels
INSERT INTO task_labels (name, color, department_id) VALUES
  ('Frontend', '#3B82F6', 'd0000001-0000-0000-0000-000000000003'),
  ('Backend', '#10B981', 'd0000001-0000-0000-0000-000000000003'),
  ('QA', '#EF4444', 'd0000001-0000-0000-0000-000000000003'),
  ('Deployment', '#8B5CF6', 'd0000001-0000-0000-0000-000000000003'),
  ('Maintenance', '#6B7280', 'd0000001-0000-0000-0000-000000000003')
ON CONFLICT (name, department_id) DO NOTHING;

-- ============================================
-- 1.6.4 Default Approval Workflows
-- ============================================

-- Standard Creative Approval Workflow
INSERT INTO approval_workflows (id, name, description, department_id, is_active, is_default) VALUES
  ('w0000001-0000-0000-0000-000000000001', 'Standard Creative Approval', 'Default approval workflow for creative deliverables', 'd0000001-0000-0000-0000-000000000001', true, true)
ON CONFLICT DO NOTHING;

-- Workflow Steps for Standard Creative Approval
INSERT INTO approval_workflow_steps (id, workflow_id, step_order, name, description, approver_type, required_approvals, can_skip) VALUES
  ('ws000001-0000-0000-0000-000000000001', 'w0000001-0000-0000-0000-000000000001', 1, 'Internal Review', 'Review by creative team lead or senior designer', 'department_lead', 1, false),
  ('ws000001-0000-0000-0000-000000000002', 'w0000001-0000-0000-0000-000000000001', 2, 'Account Review', 'Review by account manager before client presentation', 'role', 1, true),
  ('ws000001-0000-0000-0000-000000000003', 'w0000001-0000-0000-0000-000000000001', 3, 'Client Review', 'Client reviews and approves deliverable', 'client', 1, false)
ON CONFLICT DO NOTHING;

-- Marketing Campaign Approval Workflow
INSERT INTO approval_workflows (id, name, description, department_id, is_active, is_default) VALUES
  ('w0000001-0000-0000-0000-000000000002', 'Marketing Campaign Approval', 'Approval workflow for marketing campaigns and content', 'd0000001-0000-0000-0000-000000000002', true, true)
ON CONFLICT DO NOTHING;

INSERT INTO approval_workflow_steps (id, workflow_id, step_order, name, description, approver_type, required_approvals, can_skip) VALUES
  ('ws000001-0000-0000-0000-000000000004', 'w0000001-0000-0000-0000-000000000002', 1, 'Strategy Review', 'Marketing strategy alignment check', 'department_lead', 1, false),
  ('ws000001-0000-0000-0000-000000000005', 'w0000001-0000-0000-0000-000000000002', 2, 'Client Approval', 'Final client sign-off', 'client', 1, false)
ON CONFLICT DO NOTHING;

-- Production Deployment Workflow
INSERT INTO approval_workflows (id, name, description, department_id, is_active, is_default) VALUES
  ('w0000001-0000-0000-0000-000000000003', 'Production Deployment', 'Approval workflow for production deployments', 'd0000001-0000-0000-0000-000000000003', true, true)
ON CONFLICT DO NOTHING;

INSERT INTO approval_workflow_steps (id, workflow_id, step_order, name, description, approver_type, required_approvals, can_skip) VALUES
  ('ws000001-0000-0000-0000-000000000006', 'w0000001-0000-0000-0000-000000000003', 1, 'Code Review', 'Technical code review', 'role', 1, false),
  ('ws000001-0000-0000-0000-000000000007', 'w0000001-0000-0000-0000-000000000003', 2, 'QA Approval', 'Quality assurance sign-off', 'role', 1, false),
  ('ws000001-0000-0000-0000-000000000008', 'w0000001-0000-0000-0000-000000000003', 3, 'Client UAT', 'Client user acceptance testing', 'client', 1, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- Assign existing team members to departments
-- ============================================

-- Assign team members to departments based on their roles
-- This assumes team_members already exist from seed-coa.sql
DO $$
DECLARE
  member_record RECORD;
BEGIN
  FOR member_record IN SELECT id, role FROM team_members WHERE is_active = true LOOP
    -- Assign based on role keywords
    IF member_record.role ILIKE '%design%' OR member_record.role ILIKE '%creative%' OR member_record.role ILIKE '%art%' THEN
      INSERT INTO department_members (department_id, team_member_id, role, is_primary)
      VALUES ('d0000001-0000-0000-0000-000000000001', member_record.id, 'member', true)
      ON CONFLICT (department_id, team_member_id) DO NOTHING;

      UPDATE team_members SET department_id = 'd0000001-0000-0000-0000-000000000001' WHERE id = member_record.id;

    ELSIF member_record.role ILIKE '%market%' OR member_record.role ILIKE '%seo%' OR member_record.role ILIKE '%ppc%' THEN
      INSERT INTO department_members (department_id, team_member_id, role, is_primary)
      VALUES ('d0000001-0000-0000-0000-000000000002', member_record.id, 'member', true)
      ON CONFLICT (department_id, team_member_id) DO NOTHING;

      UPDATE team_members SET department_id = 'd0000001-0000-0000-0000-000000000002' WHERE id = member_record.id;

    ELSIF member_record.role ILIKE '%develop%' OR member_record.role ILIKE '%engineer%' OR member_record.role ILIKE '%video%' THEN
      INSERT INTO department_members (department_id, team_member_id, role, is_primary)
      VALUES ('d0000001-0000-0000-0000-000000000003', member_record.id, 'member', true)
      ON CONFLICT (department_id, team_member_id) DO NOTHING;

      UPDATE team_members SET department_id = 'd0000001-0000-0000-0000-000000000003' WHERE id = member_record.id;

    ELSIF member_record.role ILIKE '%account%' OR member_record.role ILIKE '%client%' THEN
      INSERT INTO department_members (department_id, team_member_id, role, is_primary)
      VALUES ('d0000001-0000-0000-0000-000000000004', member_record.id, 'member', true)
      ON CONFLICT (department_id, team_member_id) DO NOTHING;

      UPDATE team_members SET department_id = 'd0000001-0000-0000-0000-000000000004' WHERE id = member_record.id;

    ELSE
      -- Default to Operations
      INSERT INTO department_members (department_id, team_member_id, role, is_primary)
      VALUES ('d0000001-0000-0000-0000-000000000005', member_record.id, 'member', true)
      ON CONFLICT (department_id, team_member_id) DO NOTHING;

      UPDATE team_members SET department_id = 'd0000001-0000-0000-0000-000000000005' WHERE id = member_record.id;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- Sample Tasks (for demonstration)
-- ============================================

-- Get the first team member for assignment
DO $$
DECLARE
  first_member_id UUID;
  first_project_id UUID;
BEGIN
  SELECT id INTO first_member_id FROM team_members WHERE is_active = true LIMIT 1;
  SELECT id INTO first_project_id FROM projects WHERE status = 'active' LIMIT 1;

  IF first_member_id IS NOT NULL AND first_project_id IS NOT NULL THEN
    -- Creative Department Tasks
    INSERT INTO tasks (project_id, department_id, status_id, title, description, priority, task_type, assignee_id, reporter_id, due_date, estimated_hours) VALUES
      (first_project_id, 'd0000001-0000-0000-0000-000000000001', 's0000001-0000-0000-0000-000000000002', 'Design homepage hero banner', 'Create a compelling hero banner for the new campaign landing page', 'high', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '3 days', 4),
      (first_project_id, 'd0000001-0000-0000-0000-000000000001', 's0000001-0000-0000-0000-000000000003', 'Create social media templates', 'Design 5 social media post templates for Instagram and Facebook', 'medium', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '5 days', 6),
      (first_project_id, 'd0000001-0000-0000-0000-000000000001', 's0000001-0000-0000-0000-000000000001', 'Brand guidelines update', 'Update brand guidelines document with new color palette', 'low', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '14 days', 8)
    ON CONFLICT DO NOTHING;

    -- Marketing Department Tasks
    INSERT INTO tasks (project_id, department_id, status_id, title, description, priority, task_type, assignee_id, reporter_id, due_date, estimated_hours) VALUES
      (first_project_id, 'd0000001-0000-0000-0000-000000000002', 's0000001-0000-0000-0000-000000000002', 'Set up Google Ads campaign', 'Configure new Google Ads campaign with targeting and budget', 'high', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '2 days', 3),
      (first_project_id, 'd0000001-0000-0000-0000-000000000002', 's0000001-0000-0000-0000-000000000005', 'Monthly analytics report', 'Compile monthly analytics report for client review', 'medium', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '1 day', 4)
    ON CONFLICT DO NOTHING;

    -- Production Department Tasks
    INSERT INTO tasks (project_id, department_id, status_id, title, description, priority, task_type, assignee_id, reporter_id, due_date, estimated_hours) VALUES
      (first_project_id, 'd0000001-0000-0000-0000-000000000003', 's0000001-0000-0000-0000-000000000003', 'Implement responsive navigation', 'Build responsive navigation component with mobile menu', 'high', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '4 days', 8),
      (first_project_id, 'd0000001-0000-0000-0000-000000000003', 's0000001-0000-0000-0000-000000000002', 'Fix contact form validation', 'Resolve validation issues on contact form submission', 'urgent', 'bug', first_member_id, first_member_id, CURRENT_DATE, 2)
    ON CONFLICT DO NOTHING;

    -- Account Services Tasks
    INSERT INTO tasks (project_id, department_id, status_id, title, description, priority, task_type, assignee_id, reporter_id, due_date, estimated_hours) VALUES
      (first_project_id, 'd0000001-0000-0000-0000-000000000004', 's0000001-0000-0000-0000-000000000002', 'Prepare client presentation', 'Create presentation for Q4 campaign review meeting', 'high', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '7 days', 4),
      (first_project_id, 'd0000001-0000-0000-0000-000000000004', 's0000001-0000-0000-0000-000000000006', 'Awaiting client feedback', 'Waiting for client feedback on proposed timeline', 'medium', 'task', first_member_id, first_member_id, CURRENT_DATE + INTERVAL '3 days', 1)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================
-- Verify Data
-- ============================================

-- Check departments
SELECT 'Departments:' AS info;
SELECT id, name, slug, color FROM departments ORDER BY sort_order;

-- Check statuses
SELECT 'Task Statuses:' AS info;
SELECT id, name, category, is_default, is_final FROM task_statuses ORDER BY sort_order;

-- Check labels count
SELECT 'Labels count:' AS info;
SELECT COUNT(*) AS total_labels FROM task_labels;

-- Check workflows
SELECT 'Approval Workflows:' AS info;
SELECT aw.name, COUNT(aws.id) AS steps
FROM approval_workflows aw
LEFT JOIN approval_workflow_steps aws ON aw.id = aws.workflow_id
GROUP BY aw.id, aw.name;

-- Check sample tasks
SELECT 'Sample Tasks:' AS info;
SELECT t.title, d.name AS department, ts.name AS status, t.priority
FROM tasks t
JOIN departments d ON t.department_id = d.id
JOIN task_statuses ts ON t.status_id = ts.id
ORDER BY d.sort_order, t.created_at;
