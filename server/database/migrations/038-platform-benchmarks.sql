-- 038-platform-benchmarks.sql
-- Platform benchmarks table with industry-average seed data

CREATE TABLE IF NOT EXISTS platform_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL,
  industry VARCHAR(50) DEFAULT 'all',
  metric VARCHAR(20) NOT NULL,
  value NUMERIC(12,4) NOT NULL,
  source TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, industry, metric)
);

-- Seed with industry-average benchmarks (AUD values)
-- Uses ON CONFLICT to make migration idempotent

INSERT INTO platform_benchmarks (platform, industry, metric, value, source) VALUES
  -- Meta Ads
  ('meta',      'all', 'cpc',  1.7200, 'Industry average (2025 benchmarks)'),
  ('meta',      'all', 'cpm',  14.4000, 'Industry average (2025 benchmarks)'),
  ('meta',      'all', 'ctr',  0.9000, 'Industry average (2025 benchmarks)'),
  ('meta',      'all', 'roas', 2.8700, 'Industry average (2025 benchmarks)'),

  -- Google Ads
  ('google',    'all', 'cpc',  4.2200, 'Industry average (2025 benchmarks)'),
  ('google',    'all', 'cpm',  3.1200, 'Industry average (2025 benchmarks)'),
  ('google',    'all', 'ctr',  3.1700, 'Industry average (2025 benchmarks)'),
  ('google',    'all', 'roas', 2.0000, 'Industry average (2025 benchmarks)'),

  -- LinkedIn Ads
  ('linkedin',  'all', 'cpc',  5.2600, 'Industry average (2025 benchmarks)'),
  ('linkedin',  'all', 'cpm',  33.8000, 'Industry average (2025 benchmarks)'),
  ('linkedin',  'all', 'ctr',  0.6500, 'Industry average (2025 benchmarks)'),

  -- TikTok Ads
  ('tiktok',    'all', 'cpc',  1.0000, 'Industry average (2025 benchmarks)'),
  ('tiktok',    'all', 'cpm',  10.0000, 'Industry average (2025 benchmarks)'),
  ('tiktok',    'all', 'ctr',  0.8400, 'Industry average (2025 benchmarks)'),
  ('tiktok',    'all', 'roas', 2.5000, 'Industry average (2025 benchmarks)'),

  -- Pinterest Ads
  ('pinterest', 'all', 'cpc',  1.5000, 'Industry average (2025 benchmarks)'),
  ('pinterest', 'all', 'cpm',  7.0000, 'Industry average (2025 benchmarks)'),
  ('pinterest', 'all', 'ctr',  0.2800, 'Industry average (2025 benchmarks)'),

  -- Snapchat Ads
  ('snapchat',  'all', 'cpc',  1.3000, 'Industry average (2025 benchmarks)'),
  ('snapchat',  'all', 'cpm',  9.5000, 'Industry average (2025 benchmarks)'),
  ('snapchat',  'all', 'ctr',  0.6000, 'Industry average (2025 benchmarks)'),

  -- X (Twitter) Ads
  ('twitter',   'all', 'cpc',  0.5800, 'Industry average (2025 benchmarks)'),
  ('twitter',   'all', 'cpm',  6.4600, 'Industry average (2025 benchmarks)'),
  ('twitter',   'all', 'ctr',  0.8600, 'Industry average (2025 benchmarks)'),

  -- Microsoft Ads
  ('microsoft', 'all', 'cpc',  1.5400, 'Industry average (2025 benchmarks)'),
  ('microsoft', 'all', 'cpm',  2.9500, 'Industry average (2025 benchmarks)'),
  ('microsoft', 'all', 'ctr',  2.8300, 'Industry average (2025 benchmarks)')

ON CONFLICT (platform, industry, metric)
DO UPDATE SET
  value = EXCLUDED.value,
  source = EXCLUDED.source,
  updated_at = NOW();
