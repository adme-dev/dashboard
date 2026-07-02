-- 217_social_post_publish_targets.sql
-- Adds explicit per-account publish targets while preserving legacy platforms/account_ids arrays.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS publish_targets JSONB;
