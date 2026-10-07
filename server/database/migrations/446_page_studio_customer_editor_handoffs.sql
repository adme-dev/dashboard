-- Internal one-use handoff receipts. These are not editor sessions or readiness grants.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_customer_editor_handoffs (
  id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  login_session_hash TEXT NOT NULL REFERENCES page_studio_customer_sessions(token_hash) ON DELETE RESTRICT,
  identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL,
  site_id UUID NOT NULL REFERENCES page_studio_customer_site_requests(site_id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  dashboard_origin TEXT NOT NULL CHECK (char_length(dashboard_origin) BETWEEN 9 AND 2048),
  editor_origin TEXT NOT NULL CHECK (char_length(editor_origin) BETWEEN 9 AND 2048),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  FOREIGN KEY (workspace_id, business_id) REFERENCES page_studio_business_owners(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, business_id, site_id) REFERENCES page_studio_sites(tenant_id, client_id, id) ON DELETE RESTRICT,
  CHECK (dashboard_origin <> editor_origin),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + INTERVAL '2 minutes'),
  CHECK (consumed_at IS NULL OR (consumed_at >= issued_at AND consumed_at < expires_at))
);
CREATE INDEX IF NOT EXISTS idx_page_studio_customer_handoffs_login
  ON page_studio_customer_editor_handoffs (login_session_hash, expires_at) WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION protect_page_studio_customer_handoff() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'consumed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'consumed_at')
    OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL THEN
    RAISE EXCEPTION 'Customer handoff scope and consumption are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS page_studio_customer_handoff_immutable ON page_studio_customer_editor_handoffs;
CREATE TRIGGER page_studio_customer_handoff_immutable BEFORE UPDATE ON page_studio_customer_editor_handoffs
  FOR EACH ROW EXECUTE FUNCTION protect_page_studio_customer_handoff();
COMMIT;
