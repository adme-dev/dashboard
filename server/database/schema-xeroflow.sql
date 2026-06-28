-- ============================================
-- XeroFlow Extension Schema
-- Task Management for Xero Implementations
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Xero Implementation Projects
-- Extends agency_clients for Xero onboarding
-- ============================================
CREATE TABLE xero_implementations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  
  -- Xero-specific fields
  xero_organization_id VARCHAR(255),
  xero_short_code VARCHAR(20),
  xero_connection_status VARCHAR(50) DEFAULT 'pending' 
    CHECK (xero_connection_status IN ('pending', 'connected', 'disconnected', 'error')),
  
  -- Implementation details
  implementation_type VARCHAR(50) NOT NULL 
    CHECK (implementation_type IN ('new_setup', 'migration', 'cleanup', 'training_only')),
  industry_template VARCHAR(100),
  company_type VARCHAR(50) 
    CHECK (company_type IN ('sole_trader', 'partnership', 'company', 'trust', 'non_profit')),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'not_started' 
    CHECK (status IN ('not_started', 'setup_phase', 'in_progress', 'review', 'go_live', 'complete', 'on_hold')),
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  
  -- Dates
  start_date DATE,
  target_date DATE,
  go_live_date DATE,
  completed_date DATE,
  
  -- Team assignments
  project_manager_id UUID REFERENCES team_members(id),
  assigned_consultant_id UUID REFERENCES team_members(id),
  
  -- Client portal
  client_portal_enabled BOOLEAN DEFAULT true,
  client_portal_url VARCHAR(500),
  client_portal_access_token VARCHAR(255),
  
  -- Metadata
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  estimated_hours INTEGER,
  actual_hours INTEGER DEFAULT 0,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_xero_impl_client ON xero_implementations(client_id);
CREATE INDEX idx_xero_impl_status ON xero_implementations(status);
CREATE INDEX idx_xero_impl_pm ON xero_implementations(project_manager_id);
CREATE INDEX idx_xero_impl_dates ON xero_implementations(start_date, target_date);
CREATE INDEX idx_xero_impl_type ON xero_implementations(implementation_type);

-- ============================================
-- Task Templates Library
-- Reusable templates for different client types
-- ============================================
CREATE TABLE implementation_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Template categorization
  template_type VARCHAR(50) NOT NULL 
    CHECK (template_type IN ('standard', 'retail', 'professional_services', 'construction', 'manufacturing', 'ecommerce', 'non_profit', 'multi_entity')),
  company_type VARCHAR(50) 
    CHECK (company_type IN ('sole_trader', 'partnership', 'company', 'trust', 'non_profit', 'any')),
  
  -- Template settings
  estimated_duration_days INTEGER,
  default_priority VARCHAR(20) DEFAULT 'medium',
  
  -- Is this a system template or custom?
  is_system_template BOOLEAN DEFAULT false,
  created_by_id UUID REFERENCES team_members(id),
  agency_id UUID, -- For multi-tenant agencies
  
  -- Template status
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_type ON implementation_templates(template_type);
CREATE INDEX idx_templates_active ON implementation_templates(is_active);

-- ============================================
-- Template Tasks (Template Definition)
-- Individual tasks within a template
-- ============================================
CREATE TABLE template_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES implementation_templates(id) ON DELETE CASCADE,
  
  -- Task details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Task categorization
  category VARCHAR(50) 
    CHECK (category IN ('setup', 'configuration', 'data_migration', 'training', 'review', 'go_live', 'support')),
  
  -- Estimates
  estimated_hours DECIMAL(5, 2),
  
  -- Dependencies (which tasks must be completed first)
  depends_on_task_id UUID REFERENCES template_tasks(id),
  
  -- Assignment defaults
  default_role VARCHAR(100), -- e.g., 'Designer', 'Developer', 'Project Manager'
  default_department_id UUID REFERENCES departments(id),
  default_assignee_id UUID REFERENCES team_members(id), -- optional explicit assignee (highest-priority in resolver)
  
  -- Checklist items (stored as JSON array)
  checklist_items JSONB DEFAULT '[]'::jsonb,
  
  -- Is this required or optional?
  is_required BOOLEAN DEFAULT true,
  
  -- Client-facing description
  client_description TEXT,
  show_to_client BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_template_tasks_template ON template_tasks(template_id);
CREATE INDEX idx_template_tasks_order ON template_tasks(template_id, sort_order);

-- ============================================
-- Implementation Tasks (Instance Tasks)
-- Actual tasks created for each implementation
-- ============================================
CREATE TABLE implementation_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  implementation_id UUID NOT NULL REFERENCES xero_implementations(id) ON DELETE CASCADE,
  template_task_id UUID REFERENCES template_tasks(id),
  
  -- Task details (copied from template but can be edited)
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'not_started' 
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'review', 'complete', 'skipped')),
  
  -- Assignment
  assigned_to_id UUID REFERENCES team_members(id),
  assigned_by_id UUID REFERENCES team_members(id),
  assigned_at TIMESTAMPTZ,
  
  -- Timing
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_hours DECIMAL(5, 2),
  actual_hours DECIMAL(5, 2) DEFAULT 0,
  
  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Checklist progress
  checklist_items JSONB DEFAULT '[]'::jsonb,
  checklist_progress INTEGER DEFAULT 0 CHECK (checklist_progress BETWEEN 0 AND 100),
  
  -- Client visibility
  show_to_client BOOLEAN DEFAULT true,
  client_notes TEXT,
  
  -- Blocking info
  is_blocked BOOLEAN DEFAULT false,
  blocked_reason TEXT,
  blocked_by_task_id UUID REFERENCES implementation_tasks(id),
  
  -- Dependencies
  depends_on_task_id UUID REFERENCES implementation_tasks(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_impl_tasks_implementation ON implementation_tasks(implementation_id);
CREATE INDEX idx_impl_tasks_status ON implementation_tasks(status);
CREATE INDEX idx_impl_tasks_assigned ON implementation_tasks(assigned_to_id);
CREATE INDEX idx_impl_tasks_due ON implementation_tasks(due_date);
CREATE INDEX idx_impl_tasks_order ON implementation_tasks(implementation_id, sort_order);

-- ============================================
-- Task Comments & Activity
-- Communication thread for each task
-- ============================================
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES implementation_tasks(id) ON DELETE CASCADE,
  
  -- Who commented
  author_id UUID REFERENCES team_members(id),
  author_type VARCHAR(20) NOT NULL CHECK (author_type IN ('team_member', 'client', 'system')),
  client_email VARCHAR(255), -- For client comments via email
  
  -- Comment content
  content TEXT NOT NULL,
  
  -- Mentions (stored as JSON array of user IDs)
  mentions JSONB DEFAULT '[]'::jsonb,
  
  -- Attachments
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of {name, url, type}
  
  -- Comment type
  comment_type VARCHAR(50) DEFAULT 'comment' 
    CHECK (comment_type IN ('comment', 'status_change', 'time_logged', 'file_attached', 'system_notification')),
  
  -- For status change comments
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  
  is_internal BOOLEAN DEFAULT false, -- Internal-only vs client-visible
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);
CREATE INDEX idx_task_comments_author ON task_comments(author_id);
CREATE INDEX idx_task_comments_created ON task_comments(created_at);

-- ============================================
-- Time Tracking on Tasks
-- Detailed time entries per task
-- ============================================
CREATE TABLE task_time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES implementation_tasks(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id),
  
  date DATE NOT NULL,
  hours DECIMAL(5, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  
  description TEXT,
  
  billable BOOLEAN DEFAULT true,
  hourly_rate DECIMAL(10, 2),
  
  -- Timer tracking
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  is_manual_entry BOOLEAN DEFAULT true,
  
  invoiced BOOLEAN DEFAULT false,
  invoice_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_time_task ON task_time_entries(task_id);
CREATE INDEX idx_task_time_user ON task_time_entries(team_member_id);
CREATE INDEX idx_task_time_date ON task_time_entries(date);

-- ============================================
-- Client Portal Activity Log
-- Track what clients see and do
-- ============================================
CREATE TABLE client_portal_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  implementation_id UUID NOT NULL REFERENCES xero_implementations(id) ON DELETE CASCADE,
  
  -- Who performed the action
  client_email VARCHAR(255) NOT NULL,
  
  -- What happened
  activity_type VARCHAR(50) NOT NULL 
    CHECK (activity_type IN ('viewed_implementation', 'viewed_task', 'downloaded_file', 'uploaded_file', 'added_comment', 'approved_task')),
  
  -- Related entities
  task_id UUID REFERENCES implementation_tasks(id),
  
  -- Additional data
  metadata JSONB DEFAULT '{}'::jsonb,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portal_activity_impl ON client_portal_activity(implementation_id);
CREATE INDEX idx_portal_activity_type ON client_portal_activity(activity_type);
CREATE INDEX idx_portal_activity_created ON client_portal_activity(created_at);

-- ============================================
-- Xero Sync Log
-- Track Xero API sync operations
-- ============================================
CREATE TABLE xero_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  implementation_id UUID REFERENCES xero_implementations(id),
  
  -- Sync details
  sync_type VARCHAR(50) NOT NULL 
    CHECK (sync_type IN ('organization', 'contacts', 'accounts', 'invoices', 'bank_feeds', 'users')),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('to_xero', 'from_xero')),
  
  -- Status
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'error', 'partial')),
  error_message TEXT,
  
  -- Record counts
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Raw response (for debugging)
  raw_response JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_xero_sync_impl ON xero_sync_log(implementation_id);
CREATE INDEX idx_xero_sync_type ON xero_sync_log(sync_type);
CREATE INDEX idx_xero_sync_status ON xero_sync_log(status);

-- ============================================
-- Implementation Documents
-- File attachments for implementations
-- ============================================
CREATE TABLE implementation_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  implementation_id UUID NOT NULL REFERENCES xero_implementations(id) ON DELETE CASCADE,
  task_id UUID REFERENCES implementation_tasks(id),
  
  -- File details
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size_bytes INTEGER,
  file_url VARCHAR(500) NOT NULL,
  storage_provider VARCHAR(50) DEFAULT 's3' CHECK (storage_provider IN ('s3', 'google_drive', 'dropbox', 'azure')),
  
  -- Upload info
  uploaded_by_id UUID REFERENCES team_members(id),
  uploaded_by_client BOOLEAN DEFAULT false,
  client_email VARCHAR(255),
  
  -- Categorization
  document_type VARCHAR(50) 
    CHECK (document_type IN ('onboarding_form', 'financial_statement', 'chart_of_accounts', 'contract', 'training_material', 'other')),
  
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_impl_docs_impl ON implementation_documents(implementation_id);
CREATE INDEX idx_impl_docs_task ON implementation_documents(task_id);
CREATE INDEX idx_impl_docs_type ON implementation_documents(document_type);

-- ============================================
-- Notifications
-- User notification queue
-- ============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  
  -- What triggered this
  implementation_id UUID REFERENCES xero_implementations(id),
  task_id UUID REFERENCES implementation_tasks(id),
  
  -- Notification content
  type VARCHAR(50) NOT NULL 
    CHECK (type IN ('task_assigned', 'task_due_soon', 'task_overdue', 'task_completed', 'client_commented', 'implementation_complete', 'go_live_reminder')),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  -- Action link
  action_url VARCHAR(500),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_xero_implementations_updated_at BEFORE UPDATE ON xero_implementations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_implementation_templates_updated_at BEFORE UPDATE ON implementation_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_template_tasks_updated_at BEFORE UPDATE ON template_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_implementation_tasks_updated_at BEFORE UPDATE ON implementation_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Views for Common Queries
-- ============================================

-- Implementation Progress View
CREATE VIEW implementation_progress AS
SELECT 
  i.*,
  c.name as client_name,
  c.xero_contact_id,
  pm.name as project_manager_name,
  ac.name as assigned_consultant_name,
  COUNT(t.id) FILTER (WHERE t.status = 'complete') as completed_tasks,
  COUNT(t.id) as total_tasks,
  CASE 
    WHEN COUNT(t.id) > 0 THEN (COUNT(t.id) FILTER (WHERE t.status = 'complete') * 100 / COUNT(t.id))
    ELSE 0
  END as calculated_progress
FROM xero_implementations i
JOIN agency_clients c ON i.client_id = c.id
LEFT JOIN team_members pm ON i.project_manager_id = pm.id
LEFT JOIN team_members ac ON i.assigned_consultant_id = ac.id
LEFT JOIN implementation_tasks t ON i.id = t.implementation_id
GROUP BY i.id, c.name, c.xero_contact_id, pm.name, ac.name;

-- Team Workload View
CREATE VIEW team_workload AS
SELECT 
  tm.id as team_member_id,
  tm.name,
  tm.email,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status NOT IN ('complete', 'cancelled')) as active_implementations,
  COUNT(t.id) FILTER (WHERE t.status IN ('not_started', 'in_progress')) as pending_tasks,
  SUM(t.estimated_hours) FILTER (WHERE t.status IN ('not_started', 'in_progress')) as estimated_hours_remaining,
  COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'complete') as overdue_tasks
FROM team_members tm
LEFT JOIN xero_implementations i ON tm.id = i.project_manager_id OR tm.id = i.assigned_consultant_id
LEFT JOIN implementation_tasks t ON (tm.id = t.assigned_to_id AND i.id = t.implementation_id)
WHERE tm.is_active = true
GROUP BY tm.id, tm.name, tm.email;

-- Task Overdue View
CREATE VIEW overdue_tasks AS
SELECT 
  t.*,
  i.client_id,
  c.name as client_name,
  i.project_manager_id,
  tm.name as assigned_to_name
FROM implementation_tasks t
JOIN xero_implementations i ON t.implementation_id = i.id
JOIN agency_clients c ON i.client_id = c.id
LEFT JOIN team_members tm ON t.assigned_to_id = tm.id
WHERE t.due_date < CURRENT_DATE 
  AND t.status NOT IN ('complete', 'skipped')
  AND t.is_blocked = false;

COMMENT ON TABLE xero_implementations IS 'Xero client implementation projects';
COMMENT ON TABLE implementation_templates IS 'Reusable templates for Xero implementations';
COMMENT ON TABLE implementation_tasks IS 'Individual tasks for each implementation';
COMMENT ON TABLE task_comments IS 'Communication thread for tasks';
