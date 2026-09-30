-- Additive ownership foundation. No legacy backfill or route cutover.
-- Identities are references issued by trusted authentication, never credentials.
BEGIN;

CREATE TABLE IF NOT EXISTS page_studio_customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer TEXT NOT NULL CHECK (issuer IN ('portal', 'studio')),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  portal_user_id UUID UNIQUE REFERENCES client_users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issuer, subject),
  CHECK ((issuer = 'portal' AND portal_user_id IS NOT NULL AND subject = portal_user_id::text)
    OR (issuer = 'studio' AND portal_user_id IS NULL))
);

CREATE TABLE IF NOT EXISTS page_studio_customer_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_by UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  creation_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by, creation_request_id)
);

CREATE TABLE IF NOT EXISTS page_studio_workspace_memberships (
  workspace_id UUID NOT NULL REFERENCES page_studio_customer_workspaces(id) ON DELETE RESTRICT,
  identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'editor', 'viewer')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, identity_id)
);
CREATE INDEX IF NOT EXISTS idx_page_studio_workspace_memberships_identity
  ON page_studio_workspace_memberships (identity_id, workspace_id);

CREATE TABLE IF NOT EXISTS page_studio_workspace_client_bindings (
  workspace_id UUID PRIMARY KEY REFERENCES page_studio_customer_workspaces(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL CHECK (char_length(btrim(tenant_id)) BETWEEN 1 AND 200),
  client_id UUID NOT NULL UNIQUE REFERENCES agency_clients(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A grant is assistance, not ownership, subscription status or authority to pay.
-- Existing agency authentication/RBAC must validate the actor and tenant first.
CREATE TABLE IF NOT EXISTS page_studio_workspace_agency_grants (
  workspace_id UUID NOT NULL REFERENCES page_studio_customer_workspaces(id) ON DELETE RESTRICT,
  agency_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL CHECK (char_length(btrim(tenant_id)) BETWEEN 1 AND 200),
  capabilities TEXT[] NOT NULL CHECK (
    cardinality(capabilities) BETWEEN 1 AND 2
    AND array_position(capabilities, NULL) IS NULL
    AND capabilities <@ ARRAY['workspace.read', 'site.design']::text[]
  ),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, tenant_id, agency_user_id)
);

CREATE TABLE IF NOT EXISTS page_studio_workspace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES page_studio_customer_workspaces(id) ON DELETE RESTRICT,
  actor_identity_id UUID NOT NULL REFERENCES page_studio_customer_identities(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('workspace_created', 'legacy_client_bound')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_studio_workspace_events_history
  ON page_studio_workspace_events (workspace_id, occurred_at DESC);

COMMIT;
