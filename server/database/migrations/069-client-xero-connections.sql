-- Phase 5 — Enterprise Advisor: scaffolding for per-client Xero
-- connections. Today the agency has ONE Xero org connected (the
-- xero_org_connection / KV token). When/if we wire up a "connect
-- client X's Xero on their behalf" OAuth flow, each connection lands
-- here keyed to agency_clients.id.
--
-- The table is intentionally narrow at this stage — it mirrors the
-- org-level token storage shape so the runtime helpers can evolve
-- without a schema churn.

CREATE TABLE IF NOT EXISTS client_xero_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,            -- the client's Xero tenant
  tenant_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  connected_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refresh_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  UNIQUE (agency_client_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_cxc_client ON client_xero_connections(agency_client_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cxc_tenant ON client_xero_connections(tenant_id);
