-- 177_video_asset_harness.sql — project buckets, derivatives, and AI asset jobs.
CREATE TABLE IF NOT EXISTS video_project_buckets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL,
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind)
);

CREATE TABLE IF NOT EXISTS video_project_bucket_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id   UUID NOT NULL REFERENCES video_project_buckets(id) ON DELETE CASCADE,
  asset_id    UUID NULL REFERENCES video_assets(id) ON DELETE SET NULL,
  r2_key      TEXT NULL,
  title       TEXT NULL,
  role        TEXT NULL,
  directive   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','draft','processing','blocked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_asset_derivatives (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id  UUID NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  project_id       UUID NULL,
  kind             TEXT NOT NULL,
  r2_key           TEXT NOT NULL,
  width            INTEGER NULL,
  height           INTEGER NULL,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_asset_intelligence_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL,
  source_asset_id        UUID NULL REFERENCES video_assets(id) ON DELETE SET NULL,
  bucket_item_id         UUID NULL REFERENCES video_project_bucket_items(id) ON DELETE SET NULL,
  action                TEXT NOT NULL,
  model_id              TEXT NOT NULL,
  provider              TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','blocked')),
  prompt                TEXT NULL,
  brush_mask_key        TEXT NULL,
  output_derivative_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message         TEXT NULL,
  created_by            UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at            TIMESTAMPTZ NULL,
  completed_at          TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_video_project_buckets_project
  ON video_project_buckets (project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_video_project_bucket_items_bucket
  ON video_project_bucket_items (bucket_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_project_bucket_items_bucket_asset
  ON video_project_bucket_items (bucket_id, asset_id)
  WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_asset_derivatives_source
  ON video_asset_derivatives (source_asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_asset_intelligence_jobs_project
  ON video_asset_intelligence_jobs (project_id, created_at DESC);
