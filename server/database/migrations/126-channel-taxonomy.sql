-- 126: canonical channel taxonomy
-- Single source of truth mapping native source values (ad platform, lead source,
-- GA4 default channel grouping) onto a canonical channel name. Supersedes the
-- hard-coded switch in server/utils/channelMap.ts (kept as seed + fallback).
CREATE TABLE IF NOT EXISTS channel_taxonomy (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system     TEXT NOT NULL,        -- 'ad_platform' | 'lead_source' | 'ga4'
  native_value      TEXT NOT NULL,        -- e.g. 'google_ads', 'meta', 'Paid Search'
  canonical_channel TEXT NOT NULL,        -- e.g. 'Paid Search', 'Paid Social'
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_system, native_value)
);

-- Seed from the current channelMap.ts rules + GA4 default channel grouping values.
-- Idempotent: re-running the migration leaves existing rows untouched.
INSERT INTO channel_taxonomy (source_system, native_value, canonical_channel) VALUES
  ('ad_platform', 'google_ads',      'Paid Search'),
  ('ad_platform', 'google',          'Paid Search'),
  ('ad_platform', 'meta',            'Paid Social'),
  ('ad_platform', 'meta_ads',        'Paid Social'),
  ('lead_source',  'google',         'Paid Search'),
  ('lead_source',  'meta',           'Paid Social'),
  ('ga4',          'Paid Search',    'Paid Search'),
  ('ga4',          'Paid Social',    'Paid Social'),
  ('ga4',          'Paid Other',     'Paid Other'),
  ('ga4',          'Organic Search', 'Organic Search'),
  ('ga4',          'Organic Social', 'Organic Social'),
  ('ga4',          'Organic Video',  'Organic Video'),
  ('ga4',          'Direct',         'Direct'),
  ('ga4',          'Referral',       'Referral'),
  ('ga4',          'Email',          'Email'),
  ('ga4',          'Display',        'Display'),
  ('ga4',          'Affiliates',     'Affiliates'),
  ('ga4',          'Unassigned',     'Unassigned')
ON CONFLICT (source_system, native_value) DO NOTHING;
