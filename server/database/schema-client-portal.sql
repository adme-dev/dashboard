-- ============================================
-- Client Portal Schema
-- Client self-service with project visibility, approvals, and communication
-- ============================================

-- ============================================
-- Client Users (Portal Access)
-- ============================================
CREATE TABLE IF NOT EXISTS client_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,

  -- User details
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(100),
  phone VARCHAR(50),

  -- Authentication
  password_hash TEXT,
  is_primary_contact BOOLEAN DEFAULT false,

  -- Permissions
  can_view_projects BOOLEAN DEFAULT true,
  can_view_invoices BOOLEAN DEFAULT true,
  can_approve_work BOOLEAN DEFAULT false,
  can_view_time_entries BOOLEAN DEFAULT false,
  can_view_budgets BOOLEAN DEFAULT false,
  can_add_comments BOOLEAN DEFAULT true,
  can_upload_files BOOLEAN DEFAULT true,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'deactivated')),
  invited_at TIMESTAMPTZ,
  invited_by UUID REFERENCES team_members(id),
  activated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,

  -- Notifications
  email_notifications BOOLEAN DEFAULT true,
  notification_preferences JSONB DEFAULT '{"project_updates": true, "invoice_sent": true, "approval_requested": true}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_users_client ON client_users(client_id);
CREATE INDEX IF NOT EXISTS idx_client_users_email ON client_users(email);
CREATE INDEX IF NOT EXISTS idx_client_users_status ON client_users(status);

-- ============================================
-- Client Portal Sessions
-- ============================================
CREATE TABLE IF NOT EXISTS client_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_user_id UUID NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_sessions_user ON client_sessions(client_user_id);
CREATE INDEX IF NOT EXISTS idx_client_sessions_token ON client_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_client_sessions_expires ON client_sessions(expires_at);

-- ============================================
-- Client Invitations
-- ============================================
CREATE TABLE IF NOT EXISTS client_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  token VARCHAR(100) NOT NULL UNIQUE,
  permissions JSONB,

  invited_by UUID REFERENCES team_members(id),
  expires_at TIMESTAMPTZ NOT NULL,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES client_users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_invitations_token ON client_invitations(token);
CREATE INDEX IF NOT EXISTS idx_client_invitations_email ON client_invitations(email);
CREATE INDEX IF NOT EXISTS idx_client_invitations_client ON client_invitations(client_id);

-- ============================================
-- Client Approvals
-- ============================================
CREATE TABLE IF NOT EXISTS client_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What's being approved
  approval_type VARCHAR(50) NOT NULL CHECK (approval_type IN ('deliverable', 'milestone', 'design', 'content', 'budget_change', 'scope_change', 'invoice')),

  -- References
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Approval details
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Files/attachments for review
  attachments JSONB, -- Array of {name, url, type}

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested', 'cancelled')),

  -- Request info
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requested_by UUID REFERENCES team_members(id),
  due_date DATE,

  -- Response info
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES client_users(id),
  response_notes TEXT,

  -- Revision tracking
  revision_number INTEGER DEFAULT 1,
  previous_approval_id UUID REFERENCES client_approvals(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_approvals_project ON client_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_client_approvals_status ON client_approvals(status);
CREATE INDEX IF NOT EXISTS idx_client_approvals_type ON client_approvals(approval_type);

-- ============================================
-- Client Comments/Feedback
-- ============================================
CREATE TABLE IF NOT EXISTS client_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Context
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES client_approvals(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Who commented
  client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL,
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,

  -- Comment content
  content TEXT NOT NULL,
  attachments JSONB, -- Array of {name, url, type}

  -- Threading
  parent_comment_id UUID REFERENCES client_comments(id) ON DELETE CASCADE,

  -- Status
  is_internal BOOLEAN DEFAULT false, -- Internal notes not visible to client
  is_resolved BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_comments_project ON client_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_client_comments_task ON client_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_client_comments_approval ON client_comments(approval_id);
CREATE INDEX IF NOT EXISTS idx_client_comments_parent ON client_comments(parent_comment_id);

-- ============================================
-- Client File Shares
-- ============================================
CREATE TABLE IF NOT EXISTS client_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Context
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- File details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  thumbnail_url TEXT,

  -- Category
  category VARCHAR(50), -- 'deliverable', 'asset', 'document', 'reference'

  -- Visibility
  is_visible_to_client BOOLEAN DEFAULT true,
  shared_at TIMESTAMPTZ,
  shared_by UUID REFERENCES team_members(id),

  -- Downloads
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  last_downloaded_by UUID REFERENCES client_users(id),

  -- Versioning
  version INTEGER DEFAULT 1,
  previous_version_id UUID REFERENCES client_files(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_files_client ON client_files(client_id);
CREATE INDEX IF NOT EXISTS idx_client_files_project ON client_files(project_id);
CREATE INDEX IF NOT EXISTS idx_client_files_visible ON client_files(is_visible_to_client) WHERE is_visible_to_client = true;

-- ============================================
-- Client Activity Log
-- ============================================
CREATE TABLE IF NOT EXISTS client_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,

  -- Activity details
  action VARCHAR(50) NOT NULL, -- 'login', 'view_project', 'download_file', 'approve', 'comment', etc.
  entity_type VARCHAR(50), -- 'project', 'invoice', 'file', 'approval'
  entity_id UUID,

  -- Additional context
  details JSONB,
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_activity_user ON client_activity_log(client_user_id);
CREATE INDEX IF NOT EXISTS idx_client_activity_client ON client_activity_log(client_id);
CREATE INDEX IF NOT EXISTS idx_client_activity_action ON client_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_client_activity_created ON client_activity_log(created_at DESC);

-- ============================================
-- Client Project Settings (Per-project portal settings)
-- ============================================
CREATE TABLE IF NOT EXISTS client_project_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Visibility settings
  show_budget BOOLEAN DEFAULT false,
  show_time_tracking BOOLEAN DEFAULT false,
  show_team_members BOOLEAN DEFAULT true,
  show_task_details BOOLEAN DEFAULT true,
  show_task_assignees BOOLEAN DEFAULT true,
  show_task_hours BOOLEAN DEFAULT false,

  -- Notification settings
  notify_on_status_change BOOLEAN DEFAULT true,
  notify_on_deliverable BOOLEAN DEFAULT true,
  notify_on_milestone BOOLEAN DEFAULT true,

  -- Access settings
  allow_comments BOOLEAN DEFAULT true,
  allow_file_upload BOOLEAN DEFAULT true,
  require_approval_for VARCHAR(50)[], -- e.g., ['milestone', 'deliverable']

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_client_project_settings_project ON client_project_settings(project_id);

-- ============================================
-- Views
-- ============================================

-- Client Portal Dashboard View
DROP VIEW IF EXISTS v_client_portal_dashboard;
CREATE VIEW v_client_portal_dashboard AS
SELECT
  c.id AS client_id,
  c.name AS client_name,
  COUNT(DISTINCT p.id) AS active_projects,
  COUNT(DISTINCT CASE WHEN ca.status = 'pending' THEN ca.id END) AS pending_approvals,
  COUNT(DISTINCT CASE WHEN i.status IN ('sent', 'overdue') THEN i.id END) AS outstanding_invoices,
  COALESCE(SUM(CASE WHEN i.status IN ('sent', 'overdue') THEN i.total_amount - i.amount_paid ELSE 0 END), 0) AS outstanding_amount,
  COUNT(DISTINCT cc.id) FILTER (WHERE cc.created_at > NOW() - INTERVAL '7 days') AS recent_comments,
  MAX(ca2.created_at) FILTER (WHERE ca2.action = 'login') AS last_portal_visit
FROM agency_clients c
LEFT JOIN projects p ON c.id = p.client_id AND p.status = 'active'
LEFT JOIN client_approvals ca ON p.id = ca.project_id AND ca.status = 'pending'
LEFT JOIN invoices i ON c.id = i.client_id AND i.status IN ('sent', 'overdue')
LEFT JOIN client_comments cc ON p.id = cc.project_id
LEFT JOIN client_activity_log ca2 ON c.id = ca2.client_id
GROUP BY c.id, c.name;

-- Client User Overview
DROP VIEW IF EXISTS v_client_user_overview;
CREATE VIEW v_client_user_overview AS
SELECT
  cu.id,
  cu.email,
  cu.name,
  cu.title,
  cu.status,
  cu.last_login_at,
  cu.created_at,
  c.id AS client_id,
  c.name AS client_name,
  cu.can_view_projects,
  cu.can_view_invoices,
  cu.can_approve_work,
  cu.is_primary_contact,
  COALESCE(approvals.count, 0) AS pending_approvals,
  COALESCE(comments.count, 0) AS recent_comments
FROM client_users cu
JOIN agency_clients c ON cu.client_id = c.id
LEFT JOIN (
  SELECT responded_by, COUNT(*) AS count
  FROM client_approvals
  WHERE status = 'pending'
  GROUP BY responded_by
) approvals ON cu.id = approvals.responded_by
LEFT JOIN (
  SELECT client_user_id, COUNT(*) AS count
  FROM client_comments
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY client_user_id
) comments ON cu.id = comments.client_user_id;

-- ============================================
-- Functions
-- ============================================

-- Generate invitation token
CREATE OR REPLACE FUNCTION generate_client_invitation_token()
RETURNS VARCHAR(100) AS $$
BEGIN
  RETURN encode(gen_random_bytes(48), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Clean up expired sessions and invitations
CREATE OR REPLACE FUNCTION cleanup_client_portal_expired()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  -- Delete expired sessions
  DELETE FROM client_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Mark expired invitations
  UPDATE client_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_client_users_updated_at BEFORE UPDATE ON client_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_approvals_updated_at BEFORE UPDATE ON client_approvals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_comments_updated_at BEFORE UPDATE ON client_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_files_updated_at BEFORE UPDATE ON client_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_project_settings_updated_at BEFORE UPDATE ON client_project_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
