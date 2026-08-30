-- 403: Short-lived Page Studio editor session ledger.
-- Bearer tokens and signing keys are deliberately never persisted.

BEGIN;

CREATE TABLE IF NOT EXISTS page_studio_sessions (
  nonce TEXT PRIMARY KEY
    CHECK (nonce ~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$'),
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  user_id TEXT NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 128),
  role TEXT NOT NULL CHECK (role IN ('agency', 'client')),
  capabilities JSONB NOT NULL
    CHECK (jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) BETWEEN 1 AND 16),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, client_id, site_id)
    REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE CASCADE,
  CHECK (expires_at > issued_at),
  CHECK (expires_at <= issued_at + INTERVAL '15 minutes'),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE INDEX IF NOT EXISTS idx_page_studio_sessions_scope_user
  ON page_studio_sessions (tenant_id, client_id, site_id, user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_studio_sessions_expiry
  ON page_studio_sessions (expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
