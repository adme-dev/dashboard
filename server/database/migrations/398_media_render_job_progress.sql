-- Per-job render progress for the Video Studio render strip.
-- { "stage": "rendering"|"uploading"|"done", "formatKey": "reels_9x16", "done": 1, "total": 3, "updatedAt": iso }
-- Additive; NULL for jobs created before this migration or by older workers.
ALTER TABLE media_render_jobs ADD COLUMN IF NOT EXISTS progress JSONB NULL;
