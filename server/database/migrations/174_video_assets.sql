-- 174_video_assets.sql — reusable rendered-video library (mirror of audio_assets). Additive.
CREATE TABLE IF NOT EXISTS video_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by        UUID NOT NULL,
  title             TEXT NULL,
  source_project_id UUID NULL,
  source_job_id     UUID NULL,
  r2_key            TEXT NOT NULL,
  format            TEXT NOT NULL,
  width             INTEGER NULL,
  height            INTEGER NULL,
  duration_sec      NUMERIC NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_assets_client ON video_assets (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_assets_created_at ON video_assets (created_at DESC);
