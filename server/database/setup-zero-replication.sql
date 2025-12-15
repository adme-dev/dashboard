-- Setup Zero Replication for Postgres
-- Run this script after schema.sql to enable Zero sync

-- Create publication for Zero replication
-- This tells Postgres which tables to replicate
DROP PUBLICATION IF EXISTS zero_publication;

CREATE PUBLICATION zero_publication FOR TABLE
  -- Original agency tables
  chart_of_accounts,
  agency_clients,
  team_members,
  projects,
  time_entries,
  project_expenses,
  media_spend,
  agency_invoices,
  retainer_periods,
  -- Workflow management tables
  departments,
  department_members,
  task_statuses,
  tasks,
  task_assignees,
  task_labels,
  task_label_assignments,
  task_dependencies,
  task_activities,
  task_attachments,
  approval_workflows,
  approval_workflow_steps,
  task_approvals,
  task_approval_responses;

-- Grant necessary permissions for replication
-- (Neon handles this automatically, but included for completeness)

-- Add replica identity to tables (needed for UPDATE/DELETE replication)
-- FULL means the entire row is logged, which is safest but uses more space
-- Original agency tables
ALTER TABLE chart_of_accounts REPLICA IDENTITY FULL;
ALTER TABLE agency_clients REPLICA IDENTITY FULL;
ALTER TABLE team_members REPLICA IDENTITY FULL;
ALTER TABLE projects REPLICA IDENTITY FULL;
ALTER TABLE time_entries REPLICA IDENTITY FULL;
ALTER TABLE project_expenses REPLICA IDENTITY FULL;
ALTER TABLE media_spend REPLICA IDENTITY FULL;
ALTER TABLE agency_invoices REPLICA IDENTITY FULL;
ALTER TABLE retainer_periods REPLICA IDENTITY FULL;

-- Workflow management tables
ALTER TABLE departments REPLICA IDENTITY FULL;
ALTER TABLE department_members REPLICA IDENTITY FULL;
ALTER TABLE task_statuses REPLICA IDENTITY FULL;
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE task_assignees REPLICA IDENTITY FULL;
ALTER TABLE task_labels REPLICA IDENTITY FULL;
ALTER TABLE task_label_assignments REPLICA IDENTITY FULL;
ALTER TABLE task_dependencies REPLICA IDENTITY FULL;
ALTER TABLE task_activities REPLICA IDENTITY FULL;
ALTER TABLE task_attachments REPLICA IDENTITY FULL;
ALTER TABLE approval_workflows REPLICA IDENTITY FULL;
ALTER TABLE approval_workflow_steps REPLICA IDENTITY FULL;
ALTER TABLE task_approvals REPLICA IDENTITY FULL;
ALTER TABLE task_approval_responses REPLICA IDENTITY FULL;

-- Verify publication was created
SELECT * FROM pg_publication WHERE pubname = 'zero_publication';

-- List tables in the publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'zero_publication';
