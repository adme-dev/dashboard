-- 176_video_assets_metadata.sql — AI Video Studio asset metadata foundation.
ALTER TABLE video_assets
  ADD COLUMN IF NOT EXISTS thumbnail_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS caption_vtt_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS transcript TEXT NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
