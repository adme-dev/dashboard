-- Trusted finalizers bind the canonical asset pointer to actual downloaded bytes.
-- Historical outputs remain unverified (NULL); never invent a hash for them.
ALTER TABLE video_generation_jobs
  ADD COLUMN IF NOT EXISTS output_sha256 TEXT NULL
  CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$');

-- Deduplicate a retried finalization of identical bytes without rewriting historical assets.
ALTER TABLE video_assets
  ADD COLUMN IF NOT EXISTS generated_output_sha256 TEXT NULL
  CHECK (generated_output_sha256 IS NULL OR generated_output_sha256 ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS video_assets_generated_output_identity
  ON video_assets (source_job_id, generated_output_sha256)
  WHERE source_job_id IS NOT NULL AND generated_output_sha256 IS NOT NULL;
