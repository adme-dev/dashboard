-- 119-campaign-meta-fields.sql
-- Meta Ads campaign-level metadata for analytics columns:
-- campaign end date, bid strategy, and budget pacing type (daily/lifetime).
-- Additive and idempotent.

ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS bid_strategy VARCHAR(40),
  ADD COLUMN IF NOT EXISTS budget_type VARCHAR(10); -- 'daily' | 'lifetime'
