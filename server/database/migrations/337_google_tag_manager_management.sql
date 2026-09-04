-- 337_google_tag_manager_management.sql
-- Google Tag Manager API connections, per-site container bindings, guarded
-- change sets, and a shared quota window for the unusually low GTM API limit.

CREATE TABLE IF NOT EXISTS gtm_oauth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_digest CHAR(64) NOT NULL UNIQUE,
  initiated_by UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_gtm_oauth_attempts_pending
  ON gtm_oauth_attempts(initiated_by, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS gtm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_credential_profile_id UUID NOT NULL
    REFERENCES google_credential_profiles(id) ON DELETE RESTRICT,
  google_subject TEXT NOT NULL UNIQUE,
  google_email TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'disconnected', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_by UUID NOT NULL REFERENCES team_members(id),
  last_discovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gtm_connections_status
  ON gtm_connections(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS gtm_container_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_site_id UUID NOT NULL UNIQUE
    REFERENCES tracking_sites(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES gtm_connections(id) ON DELETE RESTRICT,
  account_path TEXT NOT NULL CHECK (account_path ~ '^accounts/[0-9]+$'),
  account_name TEXT NOT NULL,
  container_path TEXT NOT NULL
    CHECK (container_path ~ '^accounts/[0-9]+/containers/[0-9]+$'),
  container_public_id TEXT NOT NULL CHECK (container_public_id ~ '^GTM-[A-Z0-9]+$'),
  container_name TEXT NOT NULL,
  domain_names TEXT[] NOT NULL DEFAULT '{}',
  last_live_version_path TEXT,
  last_verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  bound_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, container_path)
);

CREATE INDEX IF NOT EXISTS idx_gtm_container_bindings_connection
  ON gtm_container_bindings(connection_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS gtm_change_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id UUID NOT NULL REFERENCES gtm_container_bindings(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL
    CHECK (action_type IN ('install_xeroflow', 'rollback')),
  status VARCHAR(24) NOT NULL DEFAULT 'planned'
    CHECK (status IN (
      'planned', 'executing', 'drafted', 'versioned', 'published', 'verified',
      'failed', 'cancelled', 'conflict', 'rolled_back'
    )),
  requested_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  executed_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  desired_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_before JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_after JSONB NOT NULL DEFAULT '{}'::jsonb,
  workspace_path TEXT,
  created_version_path TEXT,
  created_version_fingerprint TEXT,
  previous_live_version_path TEXT,
  previous_live_version_fingerprint TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gtm_change_sets_binding_history
  ON gtm_change_sets(binding_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gtm_change_sets_active_install
  ON gtm_change_sets(binding_id, action_type)
  WHERE status IN ('planned', 'executing', 'drafted', 'versioned');

CREATE TABLE IF NOT EXISTS gtm_api_quota_windows (
  quota_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER update_gtm_connections_updated_at
    BEFORE UPDATE ON gtm_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_gtm_container_bindings_updated_at
    BEFORE UPDATE ON gtm_container_bindings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_gtm_change_sets_updated_at
    BEFORE UPDATE ON gtm_change_sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
