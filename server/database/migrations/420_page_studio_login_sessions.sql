-- Link editor grants to the login that created them, retaining logout tombstones.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_login_sessions (
  role TEXT NOT NULL CHECK (role IN ('agency', 'client')),
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (role, token_hash),
  CHECK (expires_at > issued_at)
);
ALTER TABLE page_studio_sessions ADD COLUMN IF NOT EXISTS login_session_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_page_studio_sessions_login
  ON page_studio_sessions (role, login_session_hash) WHERE revoked_at IS NULL;
-- Existing editor grants have no provable login origin; new authority checks
-- reject them. Users relaunch Studio. No parent credential or JWT is retained.
COMMIT;
