-- 266_google_credential_profiles.sql
-- Multiple Google OAuth identities with replay-safe authorization attempts.

CREATE TABLE IF NOT EXISTS google_credential_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  access_token_encrypted BYTEA NOT NULL,
  access_token_iv BYTEA NOT NULL,
  refresh_token_encrypted BYTEA,
  refresh_token_iv BYTEA,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'disconnected', 'error')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_by UUID NOT NULL REFERENCES team_members(id),
  last_authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (refresh_token_encrypted IS NULL AND refresh_token_iv IS NULL)
    OR (refresh_token_encrypted IS NOT NULL AND refresh_token_iv IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_google_credential_profiles_status
  ON google_credential_profiles(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS google_oauth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_digest CHAR(64) NOT NULL UNIQUE,
  initiated_by UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state_digest ~ '^[0-9a-f]{64}$'),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_attempts_pending
  ON google_oauth_attempts(initiated_by, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS google_credential_profile_id UUID
    REFERENCES google_credential_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_connections_google_credential_profile
  ON social_connections(google_credential_profile_id)
  WHERE google_credential_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_credential_profile_accounts (
  profile_id UUID NOT NULL REFERENCES google_credential_profiles(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  manager_customer_id TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_google_credential_profile_accounts_connection
  ON google_credential_profile_accounts(connection_id, discovered_at DESC);

DO $$ BEGIN
  CREATE TRIGGER update_google_credential_profiles_updated_at
    BEFORE UPDATE ON google_credential_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Rollback guidance: leave these additive structures in place so credential
-- audit evidence and existing account mappings are preserved. Reverting the
-- application automatically restores the legacy social_connections token path.
