-- Existing jobs keep their original tenant-budget attribution. The project/client
-- remains in tenant_id regardless of which budget funds a new generation.
ALTER TABLE video_generation_jobs
  ADD COLUMN IF NOT EXISTS payer text NOT NULL DEFAULT 'tenant'
    CHECK (payer IN ('agency', 'tenant'));
