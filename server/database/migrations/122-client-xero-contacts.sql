-- 122-client-xero-contacts.sql
-- Maps Xero billing contacts (per-brand) to group-level agency_clients.
-- The durable artifact for Xero↔client reconciliation; reused by Phase 2.
CREATE TABLE IF NOT EXISTS client_xero_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL,
  xero_contact_id TEXT NOT NULL,
  xero_name       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, xero_contact_id)
);
CREATE INDEX IF NOT EXISTS idx_cxcontacts_client ON client_xero_contacts(client_id);
