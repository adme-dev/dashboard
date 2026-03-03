-- Migration 040: Spend breakdowns (age, gender, device, geo) and campaign creatives
-- Supports Meta, Google, Microsoft, Pinterest breakdowns
-- Creative assets for Meta and Google only

-- Demographic/Geographic/Device breakdowns
CREATE TABLE IF NOT EXISTS spend_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  dimension_type VARCHAR(10) NOT NULL CHECK (dimension_type IN ('age','gender','device','geo')),
  dimension_value TEXT NOT NULL,
  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions NUMERIC(12,2) DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(media_spend_id, dimension_type, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_sb_ms_dim ON spend_breakdowns(media_spend_id, dimension_type);
CREATE INDEX IF NOT EXISTS idx_sb_dim_type ON spend_breakdowns(dimension_type, dimension_value);

-- Campaign creative assets (thumbnails, titles, body text)
CREATE TABLE IF NOT EXISTS campaign_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_spend_id UUID NOT NULL REFERENCES media_spend(id) ON DELETE CASCADE,
  creative_id TEXT,
  creative_type VARCHAR(20),
  thumbnail_url TEXT,
  title TEXT,
  body TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(media_spend_id, creative_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_ms ON campaign_creatives(media_spend_id);
