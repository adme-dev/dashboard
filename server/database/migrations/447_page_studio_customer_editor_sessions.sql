-- Native customer child sessions; no changes to agency/client session tables.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_customer_editor_sessions (
  nonce UUID PRIMARY KEY,
  handoff_id UUID NOT NULL UNIQUE REFERENCES page_studio_customer_editor_handoffs(id) ON DELETE RESTRICT,
  claims JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + INTERVAL '4 hours'),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
  CHECK ((jsonb_typeof(claims) = 'object' AND claims->>'nonce' = nonce::text
    AND claims->>'role' = 'customer' AND claims->>'environment' = 'staging'
    AND (claims->>'issuedAt')::numeric = extract(epoch FROM issued_at)
    AND (claims->>'expiresAt')::numeric = extract(epoch FROM expires_at)) IS TRUE)
);
CREATE INDEX IF NOT EXISTS idx_page_studio_customer_editor_sessions_expiry
  ON page_studio_customer_editor_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE OR REPLACE FUNCTION protect_page_studio_customer_editor_session() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at')
    OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'Customer editor session claims and revocation are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS page_studio_customer_editor_session_immutable ON page_studio_customer_editor_sessions;
CREATE TRIGGER page_studio_customer_editor_session_immutable BEFORE UPDATE ON page_studio_customer_editor_sessions
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_customer_editor_session();
COMMIT;
