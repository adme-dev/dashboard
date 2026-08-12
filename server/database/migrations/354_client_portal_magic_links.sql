-- Passwordless client portal authentication.
-- Raw credentials are delivered by email and never persisted.

CREATE TABLE IF NOT EXISTS client_magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  requested_ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_magic_link_tokens_user_created
  ON client_magic_link_tokens (client_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_magic_link_tokens_active_expiry
  ON client_magic_link_tokens (expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE client_magic_link_tokens IS
  'Single-use, hashed credentials for client portal passwordless authentication.';
