-- Migration 063: Org-level Xero token storage
-- Replaces session-based xero_sessions with a single org-wide connection.
-- One person connects Xero, and the connection persists for all team members.

CREATE TABLE IF NOT EXISTS xero_org_connection (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  tenant_name TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  id_token TEXT,
  expires_at BIGINT NOT NULL,
  scope TEXT,
  token_type TEXT DEFAULT 'Bearer',
  connected_by UUID REFERENCES team_members(id),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xero_org_connection_tenant ON xero_org_connection(tenant_id);
