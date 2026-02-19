-- ============================================
-- Automation Rules Engine Schema
-- Event-driven workflow automation
-- ============================================

-- ============================================
-- Automation Rules (Trigger + Conditions + Actions)
-- ============================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,

  -- Trigger definition
  trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN (
    'task_created', 'task_updated', 'task_status_changed', 'task_assigned', 'task_due_soon', 'task_overdue',
    'project_created', 'project_updated', 'project_status_changed', 'project_budget_threshold',
    'time_entry_created', 'time_entry_approved',
    'invoice_created', 'invoice_sent', 'invoice_overdue', 'invoice_paid',
    'client_created', 'client_updated',
    'intake_submitted', 'intake_approved',
    'schedule', 'manual'
  )),
  trigger_config JSONB DEFAULT '{}',
  /*
  Examples:
  task_due_soon: {"days_before": 3}
  project_budget_threshold: {"percentage": 80}
  schedule: {"cron": "0 9 * * 1", "timezone": "America/New_York"}
  */

  -- Conditions (all must be true)
  conditions JSONB DEFAULT '[]',
  /*
  [
    {"field": "status", "operator": "equals", "value": "in_progress"},
    {"field": "priority", "operator": "in", "value": ["high", "urgent"]},
    {"field": "client.type", "operator": "equals", "value": "enterprise"}
  ]
  Operators: equals, not_equals, contains, not_contains, starts_with, ends_with,
             greater_than, less_than, in, not_in, is_empty, is_not_empty,
             before, after, between
  */

  -- Actions to execute (in order)
  actions JSONB DEFAULT '[]',
  /*
  [
    {"type": "update_field", "config": {"field": "priority", "value": "high"}},
    {"type": "assign_to", "config": {"team_member_id": "uuid", "mode": "round_robin"}},
    {"type": "send_notification", "config": {"template": "task_assigned", "recipients": ["assignee", "manager"]}},
    {"type": "create_task", "config": {"name": "Follow-up", "project_id": "same", "days_from_now": 7}},
    {"type": "send_email", "config": {"template_id": "uuid", "recipients": "client"}},
    {"type": "webhook", "config": {"url": "https://...", "method": "POST"}}
  ]
  Action types: update_field, assign_to, send_notification, create_task, create_subtask,
                send_email, add_tag, remove_tag, move_to_status, set_due_date,
                add_comment, webhook, slack_message, delay
  */

  -- Scope restrictions
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL for all projects
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE, -- NULL for all clients

  -- Execution settings
  run_once_per_entity BOOLEAN DEFAULT false, -- Only trigger once per entity
  cooldown_minutes INTEGER DEFAULT 0, -- Minimum time between triggers for same entity
  max_executions_per_day INTEGER, -- Rate limiting
  stop_on_first_action_failure BOOLEAN DEFAULT true,

  -- Metadata
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON automation_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON automation_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_project ON automation_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_client ON automation_rules(client_id);

-- ============================================
-- Automation Executions (History log)
-- ============================================
CREATE TABLE IF NOT EXISTS automation_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,

  -- Trigger info
  trigger_type VARCHAR(50) NOT NULL,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),

  -- Entity that triggered the rule
  entity_type VARCHAR(50) NOT NULL, -- 'task', 'project', 'invoice', etc.
  entity_id UUID NOT NULL,

  -- Execution details
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Conditions evaluation
  conditions_met BOOLEAN,
  conditions_result JSONB, -- Details of each condition evaluation

  -- Actions execution
  actions_executed JSONB DEFAULT '[]',
  /*
  [
    {"action_index": 0, "type": "update_field", "status": "success", "result": {...}},
    {"action_index": 1, "type": "send_notification", "status": "failed", "error": "..."}
  ]
  */

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_executions_rule ON automation_executions(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_entity ON automation_executions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_status ON automation_executions(status);
CREATE INDEX IF NOT EXISTS idx_automation_executions_date ON automation_executions(triggered_at);

-- ============================================
-- Automation Cooldowns (Rate limiting)
-- ============================================
CREATE TABLE IF NOT EXISTS automation_cooldowns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,

  last_triggered_at TIMESTAMPTZ DEFAULT NOW(),
  trigger_count INTEGER DEFAULT 1,

  UNIQUE(rule_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_cooldowns_rule ON automation_cooldowns(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_cooldowns_entity ON automation_cooldowns(entity_type, entity_id);

-- ============================================
-- Email Templates (For automation actions)
-- ============================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'notification', 'invoice', 'reminder', 'marketing', etc.

  -- Template content
  subject_template TEXT NOT NULL, -- Supports {{variables}}
  body_template TEXT NOT NULL, -- HTML with {{variables}}
  plain_text_template TEXT, -- Plain text fallback

  -- Variables definition
  available_variables JSONB DEFAULT '[]',
  /*
  [
    {"name": "project_name", "description": "Name of the project"},
    {"name": "task_name", "description": "Name of the task"},
    {"name": "due_date", "description": "Due date formatted"},
    {"name": "assignee_name", "description": "Name of the assignee"}
  ]
  */

  -- Settings
  is_system BOOLEAN DEFAULT false, -- System templates can't be deleted
  is_active BOOLEAN DEFAULT true,

  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active) WHERE is_active = true;

-- ============================================
-- Webhook Endpoints (For automation actions)
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,

  -- Authentication
  auth_type VARCHAR(20) DEFAULT 'none' CHECK (auth_type IN ('none', 'basic', 'bearer', 'api_key', 'oauth2')),
  auth_config JSONB DEFAULT '{}', -- Encrypted credentials
  /*
  basic: {"username": "...", "password": "..."}
  bearer: {"token": "..."}
  api_key: {"header": "X-API-Key", "key": "..."}
  */

  -- Request config
  default_headers JSONB DEFAULT '{}',
  timeout_seconds INTEGER DEFAULT 30,
  retry_count INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 5,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_called_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER DEFAULT 0,

  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints(is_active) WHERE is_active = true;

-- ============================================
-- Scheduled Jobs (For scheduled automations)
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,

  -- Schedule
  cron_expression VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Status
  is_active BOOLEAN DEFAULT true,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_status VARCHAR(20),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(rule_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_rule ON scheduled_jobs(rule_id);

-- ============================================
-- Views
-- ============================================

-- Active Rules Summary
DROP VIEW IF EXISTS v_automation_rules_summary;
CREATE VIEW v_automation_rules_summary AS
SELECT
  ar.id,
  ar.name,
  ar.description,
  ar.is_active,
  ar.trigger_type,
  ar.project_id,
  p.name AS project_name,
  ar.client_id,
  c.name AS client_name,
  jsonb_array_length(ar.conditions) AS condition_count,
  jsonb_array_length(ar.actions) AS action_count,
  ar.created_by,
  tm.name AS created_by_name,
  ar.created_at,
  ar.updated_at,
  (SELECT COUNT(*) FROM automation_executions ae WHERE ae.rule_id = ar.id) AS total_executions,
  (SELECT COUNT(*) FROM automation_executions ae WHERE ae.rule_id = ar.id AND ae.status = 'completed') AS successful_executions,
  (SELECT COUNT(*) FROM automation_executions ae WHERE ae.rule_id = ar.id AND ae.status = 'failed') AS failed_executions,
  (SELECT MAX(triggered_at) FROM automation_executions ae WHERE ae.rule_id = ar.id) AS last_triggered_at
FROM automation_rules ar
LEFT JOIN projects p ON ar.project_id = p.id
LEFT JOIN agency_clients c ON ar.client_id = c.id
LEFT JOIN team_members tm ON ar.created_by = tm.id;

-- Recent Executions
DROP VIEW IF EXISTS v_recent_automation_executions;
CREATE VIEW v_recent_automation_executions AS
SELECT
  ae.id,
  ae.rule_id,
  ar.name AS rule_name,
  ar.trigger_type,
  ae.entity_type,
  ae.entity_id,
  ae.status,
  ae.conditions_met,
  ae.triggered_at,
  ae.started_at,
  ae.completed_at,
  ae.duration_ms,
  ae.error_message,
  jsonb_array_length(ae.actions_executed) AS actions_count
FROM automation_executions ae
JOIN automation_rules ar ON ae.rule_id = ar.id
ORDER BY ae.triggered_at DESC;

-- Execution Stats by Rule
DROP VIEW IF EXISTS v_automation_stats;
CREATE VIEW v_automation_stats AS
SELECT
  ar.id AS rule_id,
  ar.name AS rule_name,
  ar.trigger_type,
  COUNT(ae.id) AS total_executions,
  COUNT(ae.id) FILTER (WHERE ae.status = 'completed') AS successful,
  COUNT(ae.id) FILTER (WHERE ae.status = 'failed') AS failed,
  COUNT(ae.id) FILTER (WHERE ae.status = 'skipped') AS skipped,
  ROUND(AVG(ae.duration_ms)::numeric, 2) AS avg_duration_ms,
  MAX(ae.triggered_at) AS last_triggered,
  COUNT(ae.id) FILTER (WHERE ae.triggered_at > NOW() - INTERVAL '24 hours') AS executions_24h,
  COUNT(ae.id) FILTER (WHERE ae.triggered_at > NOW() - INTERVAL '7 days') AS executions_7d
FROM automation_rules ar
LEFT JOIN automation_executions ae ON ar.id = ae.rule_id
GROUP BY ar.id, ar.name, ar.trigger_type;

-- ============================================
-- Functions
-- ============================================

-- Check if rule should execute (cooldown check)
CREATE OR REPLACE FUNCTION check_automation_cooldown(
  p_rule_id UUID,
  p_entity_type VARCHAR,
  p_entity_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rule RECORD;
  v_cooldown RECORD;
  v_can_execute BOOLEAN := true;
BEGIN
  -- Get rule settings
  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id;

  IF NOT FOUND OR NOT v_rule.is_active THEN
    RETURN false;
  END IF;

  -- Check run_once_per_entity
  IF v_rule.run_once_per_entity THEN
    SELECT * INTO v_cooldown
    FROM automation_cooldowns
    WHERE rule_id = p_rule_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id;

    IF FOUND THEN
      RETURN false;
    END IF;
  END IF;

  -- Check cooldown period
  IF v_rule.cooldown_minutes > 0 THEN
    SELECT * INTO v_cooldown
    FROM automation_cooldowns
    WHERE rule_id = p_rule_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND last_triggered_at > NOW() - (v_rule.cooldown_minutes || ' minutes')::INTERVAL;

    IF FOUND THEN
      RETURN false;
    END IF;
  END IF;

  -- Check max executions per day
  IF v_rule.max_executions_per_day IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM automation_executions
        WHERE rule_id = p_rule_id
        AND triggered_at > NOW() - INTERVAL '24 hours') >= v_rule.max_executions_per_day THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Record cooldown entry
CREATE OR REPLACE FUNCTION record_automation_cooldown(
  p_rule_id UUID,
  p_entity_type VARCHAR,
  p_entity_id UUID
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO automation_cooldowns (rule_id, entity_type, entity_id, last_triggered_at, trigger_count)
  VALUES (p_rule_id, p_entity_type, p_entity_id, NOW(), 1)
  ON CONFLICT (rule_id, entity_type, entity_id) DO UPDATE SET
    last_triggered_at = NOW(),
    trigger_count = automation_cooldowns.trigger_count + 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_jobs_updated_at BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Seed Default Email Templates
-- ============================================
INSERT INTO email_templates (name, description, category, subject_template, body_template, is_system, available_variables)
VALUES
  (
    'Task Assigned',
    'Notification when a task is assigned to someone',
    'notification',
    'You have been assigned to: {{task_name}}',
    '<h2>New Task Assignment</h2><p>Hi {{assignee_name}},</p><p>You have been assigned to the task <strong>{{task_name}}</strong> in project <strong>{{project_name}}</strong>.</p><p><strong>Due Date:</strong> {{due_date}}</p><p><strong>Priority:</strong> {{priority}}</p><p><a href="{{task_url}}">View Task</a></p>',
    true,
    '[{"name": "task_name", "description": "Name of the task"}, {"name": "assignee_name", "description": "Name of the assignee"}, {"name": "project_name", "description": "Name of the project"}, {"name": "due_date", "description": "Due date of the task"}, {"name": "priority", "description": "Task priority"}, {"name": "task_url", "description": "Link to the task"}]'
  ),
  (
    'Task Due Soon',
    'Reminder when a task is due soon',
    'reminder',
    'Reminder: {{task_name}} is due in {{days_until_due}} days',
    '<h2>Task Due Soon</h2><p>Hi {{assignee_name}},</p><p>This is a reminder that <strong>{{task_name}}</strong> is due in <strong>{{days_until_due}} days</strong>.</p><p><strong>Due Date:</strong> {{due_date}}</p><p><a href="{{task_url}}">View Task</a></p>',
    true,
    '[{"name": "task_name", "description": "Name of the task"}, {"name": "assignee_name", "description": "Name of the assignee"}, {"name": "days_until_due", "description": "Days until due date"}, {"name": "due_date", "description": "Due date of the task"}, {"name": "task_url", "description": "Link to the task"}]'
  ),
  (
    'Task Overdue',
    'Alert when a task is overdue',
    'notification',
    'OVERDUE: {{task_name}} was due {{days_overdue}} days ago',
    '<h2 style="color: #dc2626;">Task Overdue</h2><p>Hi {{assignee_name}},</p><p>The task <strong>{{task_name}}</strong> was due <strong>{{days_overdue}} days ago</strong>.</p><p><strong>Original Due Date:</strong> {{due_date}}</p><p>Please update the status or contact your project manager.</p><p><a href="{{task_url}}">View Task</a></p>',
    true,
    '[{"name": "task_name", "description": "Name of the task"}, {"name": "assignee_name", "description": "Name of the assignee"}, {"name": "days_overdue", "description": "Days past due date"}, {"name": "due_date", "description": "Original due date"}, {"name": "task_url", "description": "Link to the task"}]'
  ),
  (
    'Invoice Sent',
    'Confirmation when invoice is sent to client',
    'invoice',
    'Invoice #{{invoice_number}} sent to {{client_name}}',
    '<h2>Invoice Sent</h2><p>Invoice <strong>#{{invoice_number}}</strong> has been sent to <strong>{{client_name}}</strong>.</p><p><strong>Amount:</strong> {{amount}}</p><p><strong>Due Date:</strong> {{due_date}}</p><p><a href="{{invoice_url}}">View Invoice</a></p>',
    true,
    '[{"name": "invoice_number", "description": "Invoice number"}, {"name": "client_name", "description": "Client name"}, {"name": "amount", "description": "Invoice amount"}, {"name": "due_date", "description": "Payment due date"}, {"name": "invoice_url", "description": "Link to invoice"}]'
  ),
  (
    'Project Budget Alert',
    'Alert when project budget threshold is reached',
    'notification',
    'Budget Alert: {{project_name}} has reached {{percentage}}% of budget',
    '<h2 style="color: #f59e0b;">Budget Alert</h2><p><strong>{{project_name}}</strong> has reached <strong>{{percentage}}%</strong> of its allocated budget.</p><p><strong>Budget:</strong> {{budget}}</p><p><strong>Spent:</strong> {{spent}}</p><p><strong>Remaining:</strong> {{remaining}}</p><p>Please review project expenses and adjust if necessary.</p><p><a href="{{project_url}}">View Project</a></p>',
    true,
    '[{"name": "project_name", "description": "Name of the project"}, {"name": "percentage", "description": "Percentage of budget used"}, {"name": "budget", "description": "Total budget"}, {"name": "spent", "description": "Amount spent"}, {"name": "remaining", "description": "Amount remaining"}, {"name": "project_url", "description": "Link to project"}]'
  )
ON CONFLICT DO NOTHING;
