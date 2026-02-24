-- 008-social-connections.sql
-- Social platform connections (Meta, Google, etc.) and ad account → client mapping

-- ============================================
-- Social Connections (OAuth token storage)
-- ============================================
CREATE TABLE IF NOT EXISTS social_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL,            -- meta | google | linkedin | tiktok
  account_id TEXT NOT NULL,                 -- platform ad account ID
  account_name TEXT,
  access_token TEXT,                        -- long-lived token (60-day for Meta)
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  status VARCHAR(20) DEFAULT 'active',      -- active | expired | disconnected
  metadata JSONB,                           -- platform-specific config (business_id, currency, etc.)
  connected_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_connections_platform ON social_connections(platform);
CREATE INDEX IF NOT EXISTS idx_social_connections_status ON social_connections(status);

-- ============================================
-- Ad Account → Xero Client Mapping
-- ============================================
CREATE TABLE IF NOT EXISTS ad_account_client_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  campaign_id TEXT,                          -- optional: specific campaign mapping
  campaign_name_pattern TEXT,                -- optional: regex for campaign name matching
  xero_client_name TEXT NOT NULL,            -- exact Xero contact name
  xero_client_code TEXT,                     -- optional Xero contact code
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_account_map_connection ON ad_account_client_map(connection_id);
CREATE INDEX IF NOT EXISTS idx_ad_account_map_client ON ad_account_client_map(xero_client_name);

-- ============================================
-- Extend media_spend with campaign-level tracking
-- ============================================
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES social_connections(id);
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS impressions INTEGER;
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS clicks INTEGER;
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS conversions INTEGER;
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_media_spend_connection ON media_spend(connection_id);
CREATE INDEX IF NOT EXISTS idx_media_spend_synced ON media_spend(synced_at);

-- ============================================
-- Updated_at trigger for social_connections
-- ============================================
DO $$ BEGIN
  CREATE TRIGGER update_social_connections_updated_at
    BEFORE UPDATE ON social_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
