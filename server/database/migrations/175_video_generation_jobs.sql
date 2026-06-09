-- 175_video_generation_jobs.sql — AI Video Studio generation jobs/provenance.
-- Additive and dormant until VIDEO_GENERATION_ENABLED is set and a producer/worker
-- are activated.
CREATE TABLE IF NOT EXISTS video_generation_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             TEXT NOT NULL,
  project_id            UUID NOT NULL,
  timeline_id           UUID NULL,
  created_by            UUID NOT NULL,
  status                TEXT NOT NULL
                        CHECK (status IN ('queued','running','succeeded','failed','blocked')),
  mode                  TEXT NOT NULL
                        CHECK (mode IN ('text-to-video','image-to-video','video-extension','lip-sync')),
  model_id              TEXT NOT NULL,
  provider              TEXT NOT NULL,
  prompt                TEXT NOT NULL,
  source_asset_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_seconds      INTEGER NOT NULL,
  aspect_ratio          TEXT NOT NULL,
  resolution            TEXT NULL,
  subject_type          TEXT NOT NULL
                        CHECK (subject_type IN ('vehicle','non_vehicle','unknown')),
  compliance_status     TEXT NOT NULL,
  compliance_reasons    JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_cost_cents  INTEGER NOT NULL,
  actual_cost_cents     INTEGER NULL,
  idempotency_key       TEXT NOT NULL,
  provider_request_id   TEXT NULL,
  provider_status       TEXT NULL,
  provider_result_url   TEXT NULL,
  output_asset_id       UUID NULL REFERENCES video_assets(id) ON DELETE SET NULL,
  output_r2_key         TEXT NULL,
  error_message         TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at            TIMESTAMPTZ NULL,
  completed_at          TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_project_created
  ON video_generation_jobs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_tenant_status
  ON video_generation_jobs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_created_at
  ON video_generation_jobs (created_at DESC);
