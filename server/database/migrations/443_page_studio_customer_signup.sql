-- Standalone signup owns no agency identity, client or paid entitlement.
BEGIN;
CREATE TABLE IF NOT EXISTS page_studio_customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  identity_id UUID UNIQUE REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  terms_version TEXT NOT NULL CHECK (char_length(terms_version) BETWEEN 1 AND 100),
  terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'active' OR identity_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS page_studio_customer_login_tokens (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  account_id UUID NOT NULL REFERENCES page_studio_customer_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_studio_customer_login_account ON page_studio_customer_login_tokens(account_id);
CREATE TABLE IF NOT EXISTS page_studio_customer_sessions (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  account_id UUID NOT NULL REFERENCES page_studio_customer_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_studio_customer_sessions_account ON page_studio_customer_sessions(account_id);
CREATE TABLE IF NOT EXISTS page_studio_customer_setup_drafts (
  identity_id UUID PRIMARY KEY REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  draft JSONB NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  creation_request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID UNIQUE REFERENCES page_studio_customer_workspaces(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
