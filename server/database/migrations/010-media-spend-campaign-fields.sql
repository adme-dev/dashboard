-- Migration 010: Add campaign_type and campaign_status to media_spend
-- Also make client_id nullable so spend can be stored before client mapping exists

ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS campaign_type TEXT;
ALTER TABLE media_spend ADD COLUMN IF NOT EXISTS campaign_status TEXT;

-- Allow spend records without a client mapping
ALTER TABLE media_spend ALTER COLUMN client_id DROP NOT NULL;

-- Google Ads conversions are fractional (data-driven attribution)
ALTER TABLE media_spend ALTER COLUMN conversions TYPE NUMERIC(12,2) USING conversions::NUMERIC(12,2);
