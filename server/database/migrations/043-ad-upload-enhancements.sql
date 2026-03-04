-- 043: Ad Upload Enhancements
-- Extend banner_ad_publishes with Meta creative fields for full ad creation

ALTER TABLE banner_ad_publishes
  ADD COLUMN IF NOT EXISTS creative_id TEXT,
  ADD COLUMN IF NOT EXISTS image_hash TEXT,
  ADD COLUMN IF NOT EXISTS page_id TEXT,
  ADD COLUMN IF NOT EXISTS primary_texts TEXT[],
  ADD COLUMN IF NOT EXISTS headlines TEXT[],
  ADD COLUMN IF NOT EXISTS descriptions TEXT[],
  ADD COLUMN IF NOT EXISTS call_to_action TEXT,
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS ad_status TEXT DEFAULT 'PAUSED',
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_bap_ad_id ON banner_ad_publishes(ad_id) WHERE ad_id IS NOT NULL;
