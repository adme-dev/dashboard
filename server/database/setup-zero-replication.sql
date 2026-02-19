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
  task_approval_responses,
  -- Project Templates (schema-templates.sql)
  project_templates,
  template_phases,
  template_tasks,
  template_roles,
  template_documents,
  template_usage_history,
  -- Feature 1: AI Project Generation
  ai_generation_sessions,
  ai_task_suggestions,
  ai_estimation_history,
  -- Feature 2: Intake Forms
  intake_forms,
  intake_form_fields,
  intake_submissions,
  intake_submission_attachments,
  intake_submission_activities,
  -- Feature 3: Resource Forecasting
  team_member_skills,
  capacity_adjustments,
  resource_forecasts,
  department_forecasts,
  -- Feature 4: Creative Proofs
  creative_proofs,
  proof_assets,
  proof_approvers,
  proof_comments,
  proof_activities,
  proof_templates,
  -- Feature 5: Automation Rules
  automation_rules,
  automation_executions,
  automation_cooldowns,
  email_templates,
  webhook_endpoints,
  scheduled_jobs,
  -- Feature 6: Project Health Dashboard
  health_factor_config,
  project_health_snapshots,
  health_alerts;

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

-- Project Templates
ALTER TABLE project_templates REPLICA IDENTITY FULL;
ALTER TABLE template_phases REPLICA IDENTITY FULL;
ALTER TABLE template_tasks REPLICA IDENTITY FULL;
ALTER TABLE template_roles REPLICA IDENTITY FULL;
ALTER TABLE template_documents REPLICA IDENTITY FULL;
ALTER TABLE template_usage_history REPLICA IDENTITY FULL;

-- Feature 1: AI Project Generation
ALTER TABLE ai_generation_sessions REPLICA IDENTITY FULL;
ALTER TABLE ai_task_suggestions REPLICA IDENTITY FULL;
ALTER TABLE ai_estimation_history REPLICA IDENTITY FULL;

-- Feature 2: Intake Forms
ALTER TABLE intake_forms REPLICA IDENTITY FULL;
ALTER TABLE intake_form_fields REPLICA IDENTITY FULL;
ALTER TABLE intake_submissions REPLICA IDENTITY FULL;
ALTER TABLE intake_submission_attachments REPLICA IDENTITY FULL;
ALTER TABLE intake_submission_activities REPLICA IDENTITY FULL;

-- Feature 3: Resource Forecasting
ALTER TABLE team_member_skills REPLICA IDENTITY FULL;
ALTER TABLE capacity_adjustments REPLICA IDENTITY FULL;
ALTER TABLE resource_forecasts REPLICA IDENTITY FULL;
ALTER TABLE department_forecasts REPLICA IDENTITY FULL;

-- Feature 4: Creative Proofs
ALTER TABLE creative_proofs REPLICA IDENTITY FULL;
ALTER TABLE proof_assets REPLICA IDENTITY FULL;
ALTER TABLE proof_approvers REPLICA IDENTITY FULL;
ALTER TABLE proof_comments REPLICA IDENTITY FULL;
ALTER TABLE proof_activities REPLICA IDENTITY FULL;
ALTER TABLE proof_templates REPLICA IDENTITY FULL;

-- Feature 5: Automation Rules
ALTER TABLE automation_rules REPLICA IDENTITY FULL;
ALTER TABLE automation_executions REPLICA IDENTITY FULL;
ALTER TABLE automation_cooldowns REPLICA IDENTITY FULL;
ALTER TABLE email_templates REPLICA IDENTITY FULL;
ALTER TABLE webhook_endpoints REPLICA IDENTITY FULL;
ALTER TABLE scheduled_jobs REPLICA IDENTITY FULL;

-- Feature 6: Project Health Dashboard
ALTER TABLE health_factor_config REPLICA IDENTITY FULL;
ALTER TABLE project_health_snapshots REPLICA IDENTITY FULL;
ALTER TABLE health_alerts REPLICA IDENTITY FULL;

-- Verify publication was created
SELECT * FROM pg_publication WHERE pubname = 'zero_publication';

-- List tables in the publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'zero_publication';
