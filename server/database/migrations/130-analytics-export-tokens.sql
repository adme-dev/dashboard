-- 130: token-auth for the analytics export destination (Task 3.7)
-- Tokens are stored hashed (sha256 hex); the plaintext is shown once at creation.
-- client_id NULL = agency-wide scope; otherwise the token only sees that client.
CREATE TABLE IF NOT EXISTS analytics_export_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  client_id    UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_analytics_export_tokens_hash ON analytics_export_tokens(token_hash) WHERE revoked_at IS NULL;
