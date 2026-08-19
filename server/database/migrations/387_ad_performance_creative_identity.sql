BEGIN;

ALTER TABLE ad_performance_snapshots
  ADD COLUMN IF NOT EXISTS creative_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ad_performance_snapshot_creative
  ON ad_performance_snapshots(creative_id)
  WHERE creative_id IS NOT NULL;

COMMIT;
