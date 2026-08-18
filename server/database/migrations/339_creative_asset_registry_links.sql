BEGIN;

ALTER TABLE campaign_creatives
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_name TEXT,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_campaign_creatives_ad_id
  ON campaign_creatives(ad_id) WHERE ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_creatives_creative_id
  ON campaign_creatives(creative_id) WHERE creative_id IS NOT NULL;

-- Older environments created banner_ad_publishes before the ad-upload
-- enhancement migration. Make the registry migration independently additive.
ALTER TABLE banner_ad_publishes
  ADD COLUMN IF NOT EXISTS creative_id TEXT;
CREATE INDEX IF NOT EXISTS idx_banner_ad_publishes_creative_id
  ON banner_ad_publishes(creative_id) WHERE creative_id IS NOT NULL;

COMMIT;
