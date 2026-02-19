-- ============================================
-- Creative Proofs & Asset Review Schema
-- Client feedback and approval workflow
-- ============================================

-- ============================================
-- Creative Proofs (Main entity)
-- ============================================
CREATE TABLE IF NOT EXISTS creative_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Ownership
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  created_by UUID REFERENCES team_members(id),

  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  proof_type VARCHAR(50) DEFAULT 'design' CHECK (proof_type IN (
    'design', 'video', 'document', 'website', 'email', 'social', 'print', 'other'
  )),

  -- Versioning
  version INTEGER DEFAULT 1,
  parent_proof_id UUID REFERENCES creative_proofs(id), -- Previous version

  -- Status
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft', 'internal_review', 'client_review', 'changes_requested',
    'approved', 'rejected', 'archived'
  )),

  -- Due date
  due_date DATE,
  is_urgent BOOLEAN DEFAULT false,

  -- Approval settings
  requires_all_approvers BOOLEAN DEFAULT false, -- All must approve vs any
  approval_deadline TIMESTAMPTZ,

  -- Review settings
  allow_comments BOOLEAN DEFAULT true,
  allow_annotations BOOLEAN DEFAULT true,
  password_protected BOOLEAN DEFAULT false,
  access_password VARCHAR(255), -- Hashed

  -- Public sharing
  share_token VARCHAR(64) UNIQUE,
  share_expires_at TIMESTAMPTZ,
  public_link_enabled BOOLEAN DEFAULT false,

  -- Stats
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_proofs_project ON creative_proofs(project_id);
CREATE INDEX IF NOT EXISTS idx_creative_proofs_task ON creative_proofs(task_id);
CREATE INDEX IF NOT EXISTS idx_creative_proofs_status ON creative_proofs(status);
CREATE INDEX IF NOT EXISTS idx_creative_proofs_share ON creative_proofs(share_token);
CREATE INDEX IF NOT EXISTS idx_creative_proofs_parent ON creative_proofs(parent_proof_id);

-- ============================================
-- Proof Assets (Files attached to proofs)
-- ============================================
CREATE TABLE IF NOT EXISTS proof_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proof_id UUID NOT NULL REFERENCES creative_proofs(id) ON DELETE CASCADE,

  -- File info
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100), -- MIME type
  file_size INTEGER, -- Bytes
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,

  -- Order and metadata
  sort_order INTEGER DEFAULT 0,
  page_count INTEGER, -- For PDFs
  duration_seconds INTEGER, -- For videos/audio
  dimensions JSONB, -- {"width": 1920, "height": 1080}

  -- Processing status
  processing_status VARCHAR(20) DEFAULT 'complete' CHECK (processing_status IN (
    'pending', 'processing', 'complete', 'failed'
  )),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_assets_proof ON proof_assets(proof_id);

-- ============================================
-- Proof Approvers (Who needs to approve)
-- ============================================
CREATE TABLE IF NOT EXISTS proof_approvers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proof_id UUID NOT NULL REFERENCES creative_proofs(id) ON DELETE CASCADE,

  -- Approver info
  approver_type VARCHAR(20) NOT NULL CHECK (approver_type IN ('team_member', 'client_contact', 'email')),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  client_contact_id UUID REFERENCES client_users(id) ON DELETE CASCADE,
  email VARCHAR(255), -- For external email approvers

  name VARCHAR(255), -- Display name
  role VARCHAR(100), -- "Creative Director", "Client", etc.

  -- Approval status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  decision_at TIMESTAMPTZ,
  decision_comment TEXT,

  -- Notifications
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  notification_count INTEGER DEFAULT 0,

  -- Access
  access_token VARCHAR(64) UNIQUE,
  last_accessed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_approvers_proof ON proof_approvers(proof_id);
CREATE INDEX IF NOT EXISTS idx_proof_approvers_team ON proof_approvers(team_member_id);
CREATE INDEX IF NOT EXISTS idx_proof_approvers_client ON proof_approvers(client_contact_id);
CREATE INDEX IF NOT EXISTS idx_proof_approvers_status ON proof_approvers(status);
CREATE INDEX IF NOT EXISTS idx_proof_approvers_token ON proof_approvers(access_token);

-- ============================================
-- Proof Comments (Feedback and annotations)
-- ============================================
CREATE TABLE IF NOT EXISTS proof_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proof_id UUID NOT NULL REFERENCES creative_proofs(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES proof_assets(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES proof_comments(id) ON DELETE CASCADE, -- For replies

  -- Author
  author_type VARCHAR(20) NOT NULL CHECK (author_type IN ('team_member', 'client_contact', 'guest')),
  team_member_id UUID REFERENCES team_members(id),
  client_contact_id UUID REFERENCES client_users(id),
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),

  -- Comment content
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false, -- Internal team notes

  -- Annotation data (for positioned comments)
  annotation_type VARCHAR(20) CHECK (annotation_type IN ('point', 'rectangle', 'circle', 'arrow', 'freehand')),
  annotation_data JSONB,
  /*
  point: {"x": 100, "y": 200, "page": 1}
  rectangle: {"x": 100, "y": 200, "width": 50, "height": 30, "page": 1}
  freehand: {"points": [[x,y], [x,y]], "page": 1, "color": "#ff0000"}
  */

  -- Timestamps for video/audio
  timestamp_start INTEGER, -- Seconds
  timestamp_end INTEGER,

  -- Status
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES team_members(id),
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_comments_proof ON proof_comments(proof_id);
CREATE INDEX IF NOT EXISTS idx_proof_comments_asset ON proof_comments(asset_id);
CREATE INDEX IF NOT EXISTS idx_proof_comments_parent ON proof_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_proof_comments_resolved ON proof_comments(is_resolved);

-- ============================================
-- Proof Activity Log
-- ============================================
CREATE TABLE IF NOT EXISTS proof_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proof_id UUID NOT NULL REFERENCES creative_proofs(id) ON DELETE CASCADE,

  -- Actor
  actor_type VARCHAR(20) CHECK (actor_type IN ('team_member', 'client_contact', 'guest', 'system')),
  team_member_id UUID REFERENCES team_members(id),
  client_contact_id UUID REFERENCES client_users(id),
  guest_name VARCHAR(255),

  -- Activity
  activity_type VARCHAR(50) NOT NULL,
  /*
  'created', 'updated', 'status_changed', 'version_created',
  'comment_added', 'comment_resolved', 'annotation_added',
  'approver_added', 'approver_removed', 'approved', 'rejected',
  'changes_requested', 'viewed', 'downloaded', 'shared'
  */

  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_activities_proof ON proof_activities(proof_id);
CREATE INDEX IF NOT EXISTS idx_proof_activities_type ON proof_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_proof_activities_date ON proof_activities(created_at);

-- ============================================
-- Proof Templates (Reusable proof configurations)
-- ============================================
CREATE TABLE IF NOT EXISTS proof_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(255) NOT NULL,
  description TEXT,
  proof_type VARCHAR(50),

  -- Default settings
  default_approvers JSONB DEFAULT '[]',
  /*
  [
    {"type": "role", "role": "Account Manager"},
    {"type": "team_member", "team_member_id": "uuid"},
    {"type": "client_primary_contact"}
  ]
  */
  requires_all_approvers BOOLEAN DEFAULT false,
  allow_comments BOOLEAN DEFAULT true,
  allow_annotations BOOLEAN DEFAULT true,

  -- Default content
  default_message TEXT,
  email_template_id UUID REFERENCES email_templates(id),

  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_templates_active ON proof_templates(is_active) WHERE is_active = true;

-- ============================================
-- Views
-- ============================================

-- Proof Summary with Approval Status
DROP VIEW IF EXISTS v_proof_summary;
CREATE VIEW v_proof_summary AS
SELECT
  cp.id,
  cp.name,
  cp.description,
  cp.proof_type,
  cp.version,
  cp.status,
  cp.due_date,
  cp.is_urgent,
  cp.project_id,
  p.name AS project_name,
  cp.task_id,
  t.title AS task_name,
  c.id AS client_id,
  c.name AS client_name,
  cp.created_by,
  tm.name AS created_by_name,
  cp.share_token,
  cp.public_link_enabled,
  cp.view_count,
  cp.created_at,
  cp.updated_at,
  (SELECT COUNT(*) FROM proof_assets WHERE proof_id = cp.id) AS asset_count,
  (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id) AS approver_count,
  (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id AND status = 'approved') AS approved_count,
  (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id AND status = 'rejected') AS rejected_count,
  (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id AND status = 'changes_requested') AS changes_requested_count,
  (SELECT COUNT(*) FROM proof_comments WHERE proof_id = cp.id AND is_internal = false) AS comment_count,
  (SELECT COUNT(*) FROM proof_comments WHERE proof_id = cp.id AND is_resolved = false AND is_internal = false) AS unresolved_comment_count
FROM creative_proofs cp
LEFT JOIN projects p ON cp.project_id = p.id
LEFT JOIN agency_clients c ON p.client_id = c.id
LEFT JOIN tasks t ON cp.task_id = t.id
LEFT JOIN team_members tm ON cp.created_by = tm.id;

-- Pending Approvals
DROP VIEW IF EXISTS v_pending_proof_approvals;
CREATE VIEW v_pending_proof_approvals AS
SELECT
  pa.id,
  pa.proof_id,
  cp.name AS proof_name,
  cp.proof_type,
  cp.version,
  cp.due_date,
  cp.is_urgent,
  p.id AS project_id,
  p.name AS project_name,
  c.id AS client_id,
  c.name AS client_name,
  pa.approver_type,
  pa.team_member_id,
  pa.client_contact_id,
  pa.email,
  pa.name AS approver_name,
  pa.role AS approver_role,
  pa.status,
  pa.invited_at,
  pa.last_accessed_at,
  (cp.due_date - CURRENT_DATE) AS days_until_due
FROM proof_approvers pa
JOIN creative_proofs cp ON pa.proof_id = cp.id
LEFT JOIN projects p ON cp.project_id = p.id
LEFT JOIN agency_clients c ON p.client_id = c.id
WHERE pa.status = 'pending'
  AND cp.status IN ('internal_review', 'client_review')
ORDER BY cp.is_urgent DESC, cp.due_date, pa.invited_at;

-- Proof Version History
DROP VIEW IF EXISTS v_proof_versions;
CREATE VIEW v_proof_versions AS
SELECT
  cp.id,
  cp.name,
  cp.version,
  cp.status,
  cp.parent_proof_id,
  cp.created_by,
  tm.name AS created_by_name,
  cp.created_at,
  (SELECT COUNT(*) FROM proof_comments WHERE proof_id = cp.id) AS comment_count,
  (SELECT COUNT(*) FROM proof_approvers WHERE proof_id = cp.id AND status = 'approved') AS approval_count
FROM creative_proofs cp
LEFT JOIN team_members tm ON cp.created_by = tm.id
ORDER BY cp.version DESC;

-- ============================================
-- Functions
-- ============================================

-- Generate share token
CREATE OR REPLACE FUNCTION generate_proof_share_token(p_proof_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');

  UPDATE creative_proofs
  SET
    share_token = v_token,
    public_link_enabled = true
  WHERE id = p_proof_id;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Generate approver access token
CREATE OR REPLACE FUNCTION generate_approver_access_token(p_approver_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');

  UPDATE proof_approvers
  SET access_token = v_token
  WHERE id = p_approver_id;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Create new version from existing proof
CREATE OR REPLACE FUNCTION create_proof_version(p_proof_id UUID, p_created_by UUID)
RETURNS UUID AS $$
DECLARE
  v_old_proof RECORD;
  v_new_proof_id UUID;
  v_new_version INTEGER;
BEGIN
  -- Get the original proof (or root if this is already a version)
  SELECT * INTO v_old_proof FROM creative_proofs WHERE id = p_proof_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get max version for this proof chain
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM creative_proofs
  WHERE id = p_proof_id OR parent_proof_id = p_proof_id;

  -- Create new version
  INSERT INTO creative_proofs (
    project_id,
    task_id,
    created_by,
    name,
    description,
    proof_type,
    version,
    parent_proof_id,
    status,
    due_date,
    is_urgent,
    requires_all_approvers,
    allow_comments,
    allow_annotations
  ) VALUES (
    v_old_proof.project_id,
    v_old_proof.task_id,
    p_created_by,
    v_old_proof.name,
    v_old_proof.description,
    v_old_proof.proof_type,
    v_new_version,
    COALESCE(v_old_proof.parent_proof_id, p_proof_id),
    'draft',
    v_old_proof.due_date,
    v_old_proof.is_urgent,
    v_old_proof.requires_all_approvers,
    v_old_proof.allow_comments,
    v_old_proof.allow_annotations
  ) RETURNING id INTO v_new_proof_id;

  -- Copy approvers
  INSERT INTO proof_approvers (
    proof_id,
    approver_type,
    team_member_id,
    client_contact_id,
    email,
    name,
    role
  )
  SELECT
    v_new_proof_id,
    approver_type,
    team_member_id,
    client_contact_id,
    email,
    name,
    role
  FROM proof_approvers
  WHERE proof_id = p_proof_id;

  -- Log activity
  INSERT INTO proof_activities (proof_id, actor_type, team_member_id, activity_type, description, metadata)
  VALUES (v_new_proof_id, 'team_member', p_created_by, 'version_created',
          'Created version ' || v_new_version || ' from version ' || v_old_proof.version,
          jsonb_build_object('previous_version', v_old_proof.version, 'new_version', v_new_version));

  RETURN v_new_proof_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_creative_proofs_updated_at BEFORE UPDATE ON creative_proofs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proof_comments_updated_at BEFORE UPDATE ON proof_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proof_templates_updated_at BEFORE UPDATE ON proof_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
