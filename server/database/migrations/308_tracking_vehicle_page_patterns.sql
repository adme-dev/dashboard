BEGIN;

-- Per-site vehicle-detail-page URL patterns, delivered to the tracking tag via
-- the install snippet's data-vehicle-patterns attribute. Vehicle-page
-- detection was previously a fixed list of URL regexes hardcoded in
-- public/track.js — any dealer site whose platform uses a different URL
-- convention (e.g. /cars/used-black-2021-mercedes-benz-v-class-s20544
-- instead of /vehicle-for-sale/...) got zero vehicle_view events with no way
-- to fix it short of a script redeploy. This makes it per-site configurable
-- data instead, mirroring lead_selectors.
ALTER TABLE tracking_sites
  ADD COLUMN IF NOT EXISTS vehicle_page_patterns TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
