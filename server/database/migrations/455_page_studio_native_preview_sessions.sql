-- Separate native review ledger: no editor or live-site capability is granted.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_customer_preview_sessions (
  nonce UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  site_id UUID NOT NULL,
  identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES page_studio_customer_accounts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES page_studio_customer_workspaces(id) ON DELETE CASCADE,
  login_session_hash TEXT NOT NULL REFERENCES page_studio_customer_sessions(token_hash) ON DELETE CASCADE,
  release_id UUID NOT NULL,
  claims JSONB NOT NULL CHECK (jsonb_typeof(claims)='object'),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes'),
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,client_id,site_id,release_id) REFERENCES page_studio_releases(tenant_id,client_id,site_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_page_studio_customer_preview_login ON page_studio_customer_preview_sessions(login_session_hash);
CREATE INDEX IF NOT EXISTS idx_page_studio_customer_preview_expiry ON page_studio_customer_preview_sessions(expires_at);
COMMIT;
