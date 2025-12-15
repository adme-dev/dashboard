-- ============================================
-- Authentication & User Management Schema
-- ============================================

-- ============================================
-- User Roles Enum
-- ============================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'admin', 'sales', 'member', 'viewer', 'guest');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add 'sales' to existing enum if it doesn't exist
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales' AFTER 'admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Users Table (extends team_members with auth)
-- ============================================
-- Add auth fields to existing team_members table
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_role user_role DEFAULT 'member';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'en';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "inApp": true}';

-- ============================================
-- User Sessions (for JWT token management)
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  device_info JSONB, -- { browser, os, device }
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- ============================================
-- Team Invitations
-- ============================================
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  invited_by UUID NOT NULL REFERENCES team_members(id),
  user_role user_role DEFAULT 'member',
  department_ids UUID[] DEFAULT '{}', -- Departments to add user to
  token VARCHAR(255) NOT NULL UNIQUE,
  message TEXT, -- Optional personal message
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON team_invitations(status);

-- ============================================
-- Password Reset Tokens
-- ============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);

-- ============================================
-- Email Verification Tokens
-- ============================================
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL, -- The email being verified
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_verification_tokens(token_hash);

-- ============================================
-- Notifications
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL, -- 'task_assigned', 'comment_mention', 'approval_required', etc.
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB, -- Additional context { taskId, projectId, etc. }
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ============================================
-- Permissions Table (granular permissions)
-- ============================================
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL, -- 'department', 'project', 'task'
  resource_id UUID, -- NULL means all resources of this type
  permission VARCHAR(50) NOT NULL, -- 'view', 'edit', 'delete', 'manage'
  granted_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, resource_type, resource_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_permissions_user ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource_type, resource_id);

-- ============================================
-- Activity Log (Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES team_members(id),
  action VARCHAR(100) NOT NULL, -- 'login', 'logout', 'create', 'update', 'delete'
  resource_type VARCHAR(50), -- 'user', 'task', 'project', etc.
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_resource ON activity_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

-- ============================================
-- Clean up expired sessions/tokens (scheduled job)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_auth_records()
RETURNS void AS $$
BEGIN
  -- Delete expired sessions
  DELETE FROM user_sessions WHERE expires_at < NOW();

  -- Delete expired password reset tokens
  DELETE FROM password_reset_tokens WHERE expires_at < NOW();

  -- Delete expired email verification tokens
  DELETE FROM email_verification_tokens WHERE expires_at < NOW();

  -- Update expired invitations
  UPDATE team_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Helper function to check permissions
-- ============================================
CREATE OR REPLACE FUNCTION has_permission(
  p_user_id UUID,
  p_resource_type VARCHAR(50),
  p_resource_id UUID,
  p_permission VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  v_role user_role;
  v_has_permission BOOLEAN;
BEGIN
  -- Get user's role
  SELECT user_role INTO v_role FROM team_members WHERE id = p_user_id;

  -- Owners and admins have all permissions
  IF v_role IN ('owner', 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Sales role has special permissions for pricing
  IF v_role = 'sales' THEN
    -- Sales can view, edit, and manage pricing
    IF p_resource_type IN ('pricing', 'quote', 'job_pricing') THEN
      RETURN TRUE;
    END IF;
    -- Sales can view jobs and briefs
    IF p_resource_type IN ('job', 'brief') AND p_permission = 'view' THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Guests only have view permission
  IF v_role = 'guest' AND p_permission != 'view' THEN
    RETURN FALSE;
  END IF;

  -- Check specific permissions
  SELECT EXISTS (
    SELECT 1 FROM permissions
    WHERE user_id = p_user_id
    AND resource_type = p_resource_type
    AND (resource_id = p_resource_id OR resource_id IS NULL)
    AND permission = p_permission
  ) INTO v_has_permission;

  -- Default: members and sales can view everything, edit assigned items
  IF NOT v_has_permission AND v_role IN ('member', 'sales') THEN
    IF p_permission = 'view' THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
