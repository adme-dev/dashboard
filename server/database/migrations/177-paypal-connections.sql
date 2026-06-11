-- Migration 177: PayPal REST API connection metadata
-- Stores short-lived REST access token metadata for the internal finance route.

CREATE TABLE IF NOT EXISTS paypal_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  app_id TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'not_tested' CHECK (status IN ('not_tested', 'connected', 'expired', 'error')),
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  connected_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_paypal_connections_tenant_environment
  ON paypal_connections (tenant_id, environment);

CREATE INDEX IF NOT EXISTS idx_paypal_connections_status
  ON paypal_connections (status);
