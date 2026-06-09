-- 176_video_gen_source_assets.sql — approvable i2v source images. Additive.
CREATE TABLE IF NOT EXISTS video_gen_source_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NULL,
  created_by   UUID NOT NULL,
  r2_key       TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'approved',
  subject_type TEXT NOT NULL DEFAULT 'unknown',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vgsa_client ON video_gen_source_assets (client_id, created_at DESC);
