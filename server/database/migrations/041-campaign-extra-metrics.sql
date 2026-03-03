-- 041-campaign-extra-metrics.sql
-- Add extra per-campaign metrics columns to media_spend,
-- engagement metrics, video funnel, and hourly + placement breakdown dimensions.

-- Meta-specific scalar metrics
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS frequency NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS reach INTEGER,
  ADD COLUMN IF NOT EXISTS landing_page_views INTEGER,
  ADD COLUMN IF NOT EXISTS video_views INTEGER,
  ADD COLUMN IF NOT EXISTS video_thruplay INTEGER;

-- Google-specific scalar metrics
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS impression_share NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS lost_impression_share_budget NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS lost_impression_share_rank NUMERIC(5,2);

-- Quality ranking indicators (Meta ad-level)
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS quality_ranking VARCHAR(30),
  ADD COLUMN IF NOT EXISTS engagement_rate_ranking VARCHAR(30),
  ADD COLUMN IF NOT EXISTS conversion_rate_ranking VARCHAR(30);

-- Engagement metrics (cross-platform)
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS engagements INTEGER,
  ADD COLUMN IF NOT EXISTS interactions INTEGER,
  ADD COLUMN IF NOT EXISTS interaction_rate NUMERIC(8,4);

-- Meta-specific engagement breakdown
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS post_reactions INTEGER,
  ADD COLUMN IF NOT EXISTS post_comments INTEGER,
  ADD COLUMN IF NOT EXISTS post_shares INTEGER,
  ADD COLUMN IF NOT EXISTS link_clicks INTEGER,
  ADD COLUMN IF NOT EXISTS post_saves INTEGER;

-- Video view funnel (stored as percentages 0-100)
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS video_p25_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS video_p50_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS video_p75_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS video_p100_rate NUMERIC(5,2);

-- Allow 'placement' and 'hourly' as breakdown dimension types
ALTER TABLE spend_breakdowns
  DROP CONSTRAINT IF EXISTS spend_breakdowns_dimension_type_check;

ALTER TABLE spend_breakdowns
  ADD CONSTRAINT spend_breakdowns_dimension_type_check
  CHECK (dimension_type IN ('age','gender','device','geo','placement','hourly'));
