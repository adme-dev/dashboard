-- 153_social_reporting.sql — Slice 3 (Organic Reporting) collection tier.
-- Additive + idempotent. Extends per-post metrics with richer fields and adds a daily
-- per-account snapshot table. Nothing populates these until the social-metrics-cron runs
-- (operator-gated like the rest of the suite).

-- Richer per-post metrics. The table (mig 146) had impressions/engagements/clicks only.
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS reach INT DEFAULT 0;
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0;
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS shares INT DEFAULT 0;
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS saves INT DEFAULT 0;
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS video_views INT DEFAULT 0;
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS reactions INT DEFAULT 0;
ALTER TABLE social_post_metrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- One metrics row per (post, platform) — re-poll overwrites via ON CONFLICT (latest-snapshot model).
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_metrics_post_platform
  ON social_post_metrics(post_id, platform);

-- Daily per-account snapshot — powers follower/reach growth-over-time.
CREATE TABLE IF NOT EXISTS social_account_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  followers INT DEFAULT 0,
  reach INT DEFAULT 0,
  impressions INT DEFAULT 0,
  profile_views INT DEFAULT 0,
  posts_count INT DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One snapshot per account per day (idempotent upsert; re-poll within a day overwrites).
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_account_metrics_day
  ON social_account_metrics(social_account_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_social_account_metrics_client
  ON social_account_metrics(client_id, platform, snapshot_date DESC);
