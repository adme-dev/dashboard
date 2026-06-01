-- 143: fix GA4 dimension-sync cursor starvation
-- The dimension cron processed the stalest N properties ordered by
-- MAX(ga4_daily_dimension.synced_at) ASC NULLS FIRST. Properties with no
-- in-window dimension data (no traffic, or otherwise empty) never produced a
-- row, so they never got a synced_at stamp, stayed at the NULLS-FIRST front of
-- the queue, and were re-fetched every run. With more never-stamped properties
-- than the per-run batch size, trafficked-but-unsynced properties were starved
-- and never received dimension data at all.
--
-- Fix: track a per-property "last dimension sync attempt" on the map itself,
-- stamped on every processed property regardless of how many rows came back.
-- The cursor now orders by this column, so empties drop to the back after one
-- attempt and every property converges.
ALTER TABLE ga4_property_map
  ADD COLUMN IF NOT EXISTS dimension_synced_at TIMESTAMPTZ;

-- Backfill the stamp for properties that already have dimension data so the
-- first post-deploy run prioritises the never-attempted (genuinely stale) tail
-- instead of re-walking everything.
UPDATE ga4_property_map m
SET dimension_synced_at = s.last_sync
FROM (
  SELECT property_id, MAX(synced_at) AS last_sync
  FROM ga4_daily_dimension
  GROUP BY property_id
) s
WHERE s.property_id = m.property_id
  AND m.dimension_synced_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ga4_property_map_dim_synced
  ON ga4_property_map (dimension_synced_at ASC NULLS FIRST);
