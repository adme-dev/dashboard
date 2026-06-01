-- 144_social_accounts.sql — client-scoped organic publishing connections
-- Separate from social_connections (ad-account / spend tokens) per design spec §6.
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                 -- facebook|instagram|linkedin|tiktok|youtube|google-business
  platform_account_id TEXT NOT NULL,      -- page/profile id on the platform
  account_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, platform_account_id)
);
CREATE INDEX IF NOT EXISTS idx_social_accounts_client ON social_accounts(client_id, is_active);
