-- 042-extended-breakdowns.sql
-- Add extended breakdown dimensions (city, region, device_model, story_type)
-- and additional Google Search metrics (absolute top IS, click share).

-- Additional Google Search scalar metrics
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS search_absolute_top_is NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS search_click_share NUMERIC(5,2);

-- Objective-aware cost per result
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS cost_per_result NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS result_type VARCHAR(40);

-- Widen dimension_type from VARCHAR(10) to VARCHAR(20) — 'device_model' is 12 chars
ALTER TABLE spend_breakdowns ALTER COLUMN dimension_type TYPE VARCHAR(20);

-- Expand dimension types for spend_breakdowns
ALTER TABLE spend_breakdowns
  DROP CONSTRAINT IF EXISTS spend_breakdowns_dimension_type_check;

ALTER TABLE spend_breakdowns
  ADD CONSTRAINT spend_breakdowns_dimension_type_check
  CHECK (dimension_type IN ('age','gender','device','geo','placement','hourly','city','region','device_model','story_type'));
