-- ============================================
-- Client Portal Schema
-- Client self-service with project visibility, approvals, gallery, and communication
-- ============================================

-- ============================================
-- Client Users (Portal Access)
-- ============================================
CREATE TABLE IF NOT EXISTS client_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,

  -- User details
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(100),
  phone VARCHAR(50),
  avatar_url TEXT,

  -- Authentication
  password_hash TEXT,
  is_primary_contact BOOLEAN DEFAULT false,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMPTZ,

  -- Role-based permissions (admin, manager, viewer, guest)
  role VARCHAR(50) DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer', 'guest')),

  -- Legacy permissions (kept for backward compatibility)
  can_view_projects BOOLEAN DEFAULT true,
  can_view_invoices BOOLEAN DEFAULT true,
  can_approve_work BOOLEAN DEFAULT false,
  can_view_time_entries BOOLEAN DEFAULT false,
  can_view_budgets BOOLEAN DEFAULT false,
  can_add_comments BOOLEAN DEFAULT true,
  can_upload_files BOOLEAN DEFAULT true,
  can_invite_users BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'deactivated')),
  invited_at TIMESTAMPTZ,
  invited_by UUID REFERENCES team_members(id),
  activated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,

  -- SSO
  sso_provider VARCHAR(50),
  sso_id VARCHAR(255),

  -- Notifications
  email_notifications BOOLEAN DEFAULT true,
  notification_preferences JSONB DEFAULT '{"project_updates": true, "invoice_sent": true, "approval_requested": true, "deliverable_ready": true, "comment_mentions": true}',
  timezone VARCHAR(100) DEFAULT 'UTC',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(client_id, email)
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

-- Add public approval token columns (for external link-based approvals without login)
ALTER TABLE client_approvals ADD COLUMN IF NOT EXISTS approval_token VARCHAR(64);
ALTER TABLE client_approvals ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_approvals_token ON client_approvals(approval_token) WHERE approval_token IS NOT NULL;

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
-- Deliverables (Gallery/Asset Management)
-- ============================================
CREATE TABLE IF NOT EXISTS client_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Context
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Deliverable details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  deliverable_type VARCHAR(50) DEFAULT 'file' CHECK (deliverable_type IN ('file', 'link', 'video', 'image', 'document', 'design', 'code', 'other')),

  -- File information
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_type VARCHAR(100),
  file_size INTEGER,
  thumbnail_url TEXT,
  preview_url TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}', -- dimensions, duration, pages, etc.
  tags TEXT[],

  -- Status
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'archived')),
  is_featured BOOLEAN DEFAULT false,
  is_final BOOLEAN DEFAULT false,

  -- Versioning
  version INTEGER DEFAULT 1,
  parent_deliverable_id UUID REFERENCES client_deliverables(id),

  -- Visibility
  is_visible_to_client BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES team_members(id),

  -- Approval tracking
  approval_id UUID REFERENCES client_approvals(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES client_users(id),

  -- Stats
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  last_downloaded_at TIMESTAMPTZ,

  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_deliverables_client ON client_deliverables(client_id);
CREATE INDEX IF NOT EXISTS idx_client_deliverables_project ON client_deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_client_deliverables_status ON client_deliverables(status);
CREATE INDEX IF NOT EXISTS idx_client_deliverables_visible ON client_deliverables(is_visible_to_client) WHERE is_visible_to_client = true;
CREATE INDEX IF NOT EXISTS idx_client_deliverables_featured ON client_deliverables(is_featured) WHERE is_featured = true;

-- ============================================
-- Deliverable Collections (Galleries/Albums)
-- ============================================
CREATE TABLE IF NOT EXISTS deliverable_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Collection details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  collection_type VARCHAR(50) DEFAULT 'gallery' CHECK (collection_type IN ('gallery', 'album', 'portfolio', 'archive', 'deliverables')),

  -- Settings
  is_public BOOLEAN DEFAULT false, -- Publicly shareable link
  share_token VARCHAR(100),
  share_expires_at TIMESTAMPTZ,
  allow_downloads BOOLEAN DEFAULT true,
  require_approval BOOLEAN DEFAULT false,

  -- Display settings
  layout VARCHAR(20) DEFAULT 'grid' CHECK (layout IN ('grid', 'masonry', 'list', 'carousel')),
  sort_order VARCHAR(20) DEFAULT 'newest' CHECK (sort_order IN ('newest', 'oldest', 'name', 'custom')),

  -- Stats
  item_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  last_updated_at TIMESTAMPTZ,

  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliverable_collections_client ON deliverable_collections(client_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_collections_project ON deliverable_collections(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_collections_share ON deliverable_collections(share_token) WHERE share_token IS NOT NULL;

-- ============================================
-- Collection Items (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES deliverable_collections(id) ON DELETE CASCADE,
  deliverable_id UUID NOT NULL REFERENCES client_deliverables(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES team_members(id),

  UNIQUE(collection_id, deliverable_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_deliverable ON collection_items(deliverable_id);

-- ============================================
-- Client Project Access (Granular Permissions)
-- ============================================
CREATE TABLE IF NOT EXISTS client_project_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_user_id UUID NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Permission overrides (null = inherit from client_users)
  can_view BOOLEAN DEFAULT true,
  can_comment BOOLEAN,
  can_approve BOOLEAN,
  can_download BOOLEAN,
  can_view_budget BOOLEAN,
  can_view_time BOOLEAN,

  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES team_members(id),

  UNIQUE(client_user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_client_project_access_user ON client_project_access(client_user_id);
CREATE INDEX IF NOT EXISTS idx_client_project_access_project ON client_project_access(project_id);

-- ============================================
-- Client Notifications (In-App)
-- ============================================
CREATE TABLE IF NOT EXISTS client_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_user_id UUID NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,

  -- Notification content
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'approval_requested', 'deliverable_ready', 'project_update',
    'invoice_sent', 'comment_reply', 'mention', 'milestone_reached',
    'file_shared', 'status_change', 'reminder', 'system'
  )),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  action_url TEXT,

  -- Related entities
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES client_approvals(id) ON DELETE SET NULL,
  deliverable_id UUID REFERENCES client_deliverables(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES client_comments(id) ON DELETE SET NULL,

  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT false,

  -- Delivery
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_notifications_user ON client_notifications(client_user_id);
CREATE INDEX IF NOT EXISTS idx_client_notifications_unread ON client_notifications(client_user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_client_notifications_type ON client_notifications(type);
CREATE INDEX IF NOT EXISTS idx_client_notifications_created ON client_notifications(created_at DESC);

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

-- Client Gallery Overview
DROP VIEW IF EXISTS v_client_gallery_overview;
CREATE VIEW v_client_gallery_overview AS
SELECT
  c.id AS client_id,
  c.name AS client_name,
  COUNT(DISTINCT cd.id) AS total_deliverables,
  COUNT(DISTINCT cd.id) FILTER (WHERE cd.is_visible_to_client = true) AS visible_deliverables,
  COUNT(DISTINCT cd.id) FILTER (WHERE cd.status = 'pending_review') AS pending_review,
  COUNT(DISTINCT cd.id) FILTER (WHERE cd.status = 'approved') AS approved,
  COUNT(DISTINCT dc.id) AS total_collections,
  COUNT(DISTINCT p.id) AS projects_with_deliverables,
  MAX(cd.created_at) AS last_deliverable_at
FROM agency_clients c
LEFT JOIN client_deliverables cd ON c.id = cd.client_id
LEFT JOIN deliverable_collections dc ON c.id = dc.client_id
LEFT JOIN projects p ON cd.project_id = p.id
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

CREATE TRIGGER update_client_deliverables_updated_at BEFORE UPDATE ON client_deliverables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliverable_collections_updated_at BEFORE UPDATE ON deliverable_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper Functions
-- ============================================

-- Update collection item count
CREATE OR REPLACE FUNCTION update_collection_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE deliverable_collections
    SET item_count = item_count + 1, last_updated_at = NOW()
    WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE deliverable_collections
    SET item_count = GREATEST(0, item_count - 1), last_updated_at = NOW()
    WHERE id = OLD.collection_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_collection_count_on_insert
  AFTER INSERT ON collection_items
  FOR EACH ROW EXECUTE FUNCTION update_collection_item_count();

CREATE TRIGGER update_collection_count_on_delete
  AFTER DELETE ON collection_items
  FOR EACH ROW EXECUTE FUNCTION update_collection_item_count();

-- Generate share token for collections
CREATE OR REPLACE FUNCTION generate_collection_share_token()
RETURNS VARCHAR(100) AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;
