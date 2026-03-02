-- 036: Expand media_spend platform CHECK constraint for multi-platform support
-- Adds: pinterest, snapchat, twitter, microsoft_ads, google
-- Keeps all existing: google_ads, meta, linkedin, tiktok, programmatic, traditional, other

-- Drop existing constraint
ALTER TABLE media_spend DROP CONSTRAINT IF EXISTS media_spend_platform_check;

-- Recreate with expanded platform list
ALTER TABLE media_spend ADD CONSTRAINT media_spend_platform_check
  CHECK (platform IN (
    'meta', 'google', 'google_ads', 'linkedin', 'tiktok',
    'pinterest', 'snapchat', 'twitter', 'microsoft_ads',
    'programmatic', 'traditional', 'other'
  ));
