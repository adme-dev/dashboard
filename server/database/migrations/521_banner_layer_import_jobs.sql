-- 521_banner_layer_import_jobs.sql — let the Separate layers job take a Banner Studio upload.
-- Banner Studio queues the same asset-intelligence job as Video Studio, with a
-- banner asset as the source picture instead of a video asset. Additive only.
ALTER TABLE video_asset_intelligence_jobs
  ADD COLUMN IF NOT EXISTS source_banner_asset_id UUID NULL REFERENCES banner_assets(id) ON DELETE SET NULL;

-- A derivative of a banner upload has no video asset behind it.
ALTER TABLE video_asset_derivatives
  ALTER COLUMN source_asset_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_asset_intelligence_jobs_banner_asset
  ON video_asset_intelligence_jobs (source_banner_asset_id, created_at DESC)
  WHERE source_banner_asset_id IS NOT NULL;
