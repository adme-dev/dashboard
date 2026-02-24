-- 007-xero-tracking-categories.sql
-- Store Xero tracking categories and options in DB (synced from Xero API)
-- ADME uses two tracking dimensions: "Media" (TrackingName1) and "Client" (TrackingName2)
-- The options under "Media" carry ADME-specific business logic: COA code, GST type, etc.

-- ── Top-level tracking categories (e.g. "Media", "Client") ──
CREATE TABLE IF NOT EXISTS xero_tracking_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xero_category_id VARCHAR(255) UNIQUE,    -- Xero TrackingCategoryID
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Options within each tracking category ──
CREATE TABLE IF NOT EXISTS xero_tracking_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES xero_tracking_categories(id) ON DELETE CASCADE,
  xero_option_id VARCHAR(255),             -- Xero TrackingOptionID (null for manually added)
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',

  -- ADME business logic enrichment (for Media tracking options)
  coa_code VARCHAR(10),                    -- COA account code (205-330)
  gst_type VARCHAR(50),                    -- 'GST on Income' | 'GST Free Expenses' | 'GST on Expenses'
  description TEXT,                        -- what this category covers
  vendors TEXT[],                          -- specific vendor names (for media buys)

  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(category_id, name)
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_xero_tracking_categories_name ON xero_tracking_categories(name);
CREATE INDEX IF NOT EXISTS idx_xero_tracking_options_category ON xero_tracking_options(category_id);
CREATE INDEX IF NOT EXISTS idx_xero_tracking_options_coa ON xero_tracking_options(coa_code) WHERE coa_code IS NOT NULL;

-- ── Seed the "Media" category and its 64 options from ADME business rules ──
-- This pre-populates the table so the system works before a Xero sync

INSERT INTO xero_tracking_categories (name, status)
VALUES ('Media', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- Seed all media tracking options with ADME business logic
WITH media_cat AS (
  SELECT id FROM xero_tracking_categories WHERE name = 'Media' LIMIT 1
)
INSERT INTO xero_tracking_options (category_id, name, coa_code, gst_type, description, vendors)
SELECT media_cat.id, v.name, v.coa_code, v.gst_type, v.description, v.vendors
FROM media_cat, (VALUES
  -- COA 330 — PPC / Passthrough (0% margin)
  ('Facebook Ads',          '330', 'GST Free Expenses',  'Facebook/Meta/Instagram PPC spend — GST FREE', NULL::TEXT[]),
  ('Google Ads',            '330', 'GST on Expenses',    'Google Search/Display/PMax PPC spend — GST payable', NULL),
  ('Digital Media-YouTube', '330', 'GST on Expenses',    'YouTube PPV/pre-roll — Google GST payable', NULL),
  ('Microsoft Ads',         '330', 'GST on Expenses',    'Bing/Yahoo PPC — GST payable', NULL),
  ('LinkedIN',              '330', 'GST on Expenses',    'LinkedIn PPC — GST payable', NULL),
  ('Spotify',               '330', 'GST on Expenses',    'Spotify audio ads — GST payable', NULL),
  ('Emailing',              '330', 'GST on Expenses',    'Campaign Monitor eDM send fees — GST payable', NULL),
  ('Dispatch Fees TVC',     '330', 'GST on Expenses',    'TVC dispatch/distribution fees — GST payable', NULL),

  -- COA 220 — Media (10% margin)
  ('Billboards',                      '220', 'GST on Income', 'OOH/billboard advertising',       ARRAY['APN Outdoor']),
  ('Carsales.com.au',                 '220', 'GST on Income', 'Carsales media (not IT/Cloud)',    NULL),
  ('Cinema',                          '220', 'GST on Income', 'Cinema advertising',              ARRAY['Val Morgan', 'Star Media Platinum', 'Media Motive']),
  ('Digital Media-Banners',           '220', 'GST on Income', 'Digital display/banner ads',      ARRAY['Epoch Times digital']),
  ('Impact Screen',                   '220', 'GST on Income', 'Shopping centre impact screens',  ARRAY['Val Morgan Outdoor']),
  ('Magazine Publications',           '220', 'GST on Income', 'Magazine print media',            NULL),
  ('MMS',                             '220', 'GST on Income', 'MMS send charges',                NULL),
  ('SMS',                             '220', 'GST on Income', 'SMS send charges',                NULL),
  ('Shopping Ctr Display',            '220', 'GST on Income', 'Shopping centre displays',        ARRAY['QICP Epping']),

  -- Newspapers
  ('Paper - Epoch Times',             '220', 'GST on Income', 'Epoch Times print',               NULL),
  ('Paper - Fairfax',                 '220', 'GST on Income', 'Fairfax newspapers',              NULL),
  ('Paper - Herald Sun',              '220', 'GST on Income', 'Herald Sun',                      NULL),
  ('Paper - Indus Age',               '220', 'GST on Income', 'Indus Age newspaper',             NULL),
  ('Paper - Jewish News',             '220', 'GST on Income', 'Jewish News',                     NULL),
  ('Paper - Korean',                  '220', 'GST on Income', 'Korean Today newspaper',          NULL),
  ('Paper - Leader',                  '220', 'GST on Income', 'Leader/Valley Weekly/Eastern/Northern Star Weekly', NULL),
  ('Paper - Metro Media Services',    '220', 'GST on Income', 'SW Brimbank, SW Northern',        NULL),
  ('Paper - MMP Star',                '220', 'GST on Income', 'WesternPort/Southern Peninsula/Mornington/Frankston News', NULL),
  ('Paper - MPNG',                    '220', 'GST on Income', 'Mornington Peninsula News Group', NULL),
  ('Paper - Network Classifieds',     '220', 'GST on Income', 'Cranbourne/Dandenong/Berwick News', NULL),
  ('Paper - Philtimes',               '220', 'GST on Income', 'Philippine Times',                NULL),
  ('Paper - Star & Mail News Groups', '220', 'GST on Income', 'Mt Evelyn Mail/Ranges Trader',    NULL),
  ('Paper - Traralgon Express',       '220', 'GST on Income', 'Traralgon Express',               NULL),
  ('Paper - Viet Times',              '220', 'GST on Income', 'Vietnamese Times',                NULL),

  -- Radio
  ('Radio - 101.1 Mix FM',           '220', 'GST on Income', 'Mix FM radio',                    NULL),
  ('Radio - 3AW',                    '220', 'GST on Income', '3AW radio',                       NULL),
  ('Radio - 3CW (Chinese)',          '220', 'GST on Income', 'Chinese radio 3CW',               NULL),
  ('Radio - 3GG',                    '220', 'GST on Income', '3GG radio (Gippsland)',            NULL),
  ('Radio - 3MP (ARN)',              '220', 'GST on Income', '3MP radio',                       NULL),
  ('Radio - ATN',                    '220', 'GST on Income', 'ATN radio',                       NULL),
  ('Radio - Fox FM',                 '220', 'GST on Income', 'Fox FM radio',                    NULL),
  ('Radio - Gold 104.3 (ARN)',       '220', 'GST on Income', 'Gold 104.3 radio',                NULL),
  ('Radio - KIIS (ARN-Double T)',    '220', 'GST on Income', 'KIIS FM radio',                   NULL),
  ('Radio - Nova FM',                '220', 'GST on Income', 'Nova FM radio',                   NULL),
  ('Radio - NZ',                     '220', 'GST on Income', 'NZ radio (MediaWorks)',            NULL),
  ('Radio - SEN',                    '220', 'GST on Income', 'SEN sports radio',                NULL),
  ('Radio - Smoothfm 91.5',         '220', 'GST on Income', 'Smooth FM radio',                 NULL),
  ('Radio - Triple M',               '220', 'GST on Income', 'Triple M radio',                  NULL),
  ('Radio - TR fm & Gold',           '220', 'GST on Income', 'Gippsland TR FM 99.5/99.9, Gold 1242/FM 98.3', NULL),
  ('Radio - Stellantis',             '220', 'GST on Income', 'Stellantis radio',                NULL),
  ('Radio - Zagame',                 '220', 'GST on Income', 'Zagame radio',                    NULL),

  -- TV
  ('TV - ATN',                       '220', 'GST on Income', 'ATN television',                  NULL),
  ('TV - MG',                        '220', 'GST on Income', 'MG television',                   NULL),
  ('TV - Nine',                      '220', 'GST on Income', 'Channel Nine',                    NULL),
  ('TV - Seven',                     '220', 'GST on Income', 'Channel Seven',                   NULL),
  ('TV - Southern Cross Austereo',   '220', 'GST on Income', 'SCA television',                  NULL),
  ('TV - Ten',                       '220', 'GST on Income', 'Network Ten',                     NULL),
  ('TV - Win Victoria',              '220', 'GST on Income', 'WIN TV Victoria',                 NULL),

  -- COA 216 — Digital Advertising (100% margin)
  ('Digital Advertising',  '216', 'GST on Income', 'PPC management fees, SEO, SEM management, display management', NULL),

  -- COA 215 — Marketing (100% margin)
  ('Marketing & Media',   '215', 'GST on Income', 'Strategy, media booking fees, consultation', NULL),
  ('Social Media',        '217', 'GST on Income', 'Organic social management, community management, GBP', NULL),

  -- COA 205 — Printing (100% margin)
  ('Printing',            '205', 'GST on Income', 'Print production & distribution', NULL),
  ('Promotional Items',   '205', 'GST on Income', 'POS, promotional merchandise', NULL),

  -- COA 210 — Production (100% margin)
  ('Production',          '210', 'GST on Income', 'Design, EDM, creative, animation, retouching', NULL),

  -- COA 219 — Video Production (100% margin)
  ('Video Productions',   '219', 'GST on Income', 'Video, TVC, Reels, photography', NULL),

  -- COA 225 — Website (100% margin)
  ('Websites',            '225', 'GST on Income', 'Website hosting, management, landing pages, pop-ups', NULL)
) AS v(name, coa_code, gst_type, description, vendors)
ON CONFLICT (category_id, name) DO UPDATE SET
  coa_code = EXCLUDED.coa_code,
  gst_type = EXCLUDED.gst_type,
  description = EXCLUDED.description,
  vendors = EXCLUDED.vendors;
