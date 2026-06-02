-- 160_media_timelines.sql — Media Studio SP0 data foundation.
-- Project -> versioned Timeline -> Render jobs. Clips are NOT duplicated here;
-- they are audio_assets rows referenced by r2_key inside media_timelines.state.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS media_projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by           UUID NOT NULL,
  title                TEXT NULL,
  media_type           TEXT NOT NULL DEFAULT 'audio' CHECK (media_type IN ('audio', 'av')),
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'in_review', 'approved', 'archived')),
  current_timeline_id  UUID NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_timelines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  label           TEXT NULL,
  state           JSONB NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS media_render_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id   UUID NOT NULL REFERENCES media_timelines(id),
  project_id    UUID NOT NULL,
  channels      TEXT[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'rendering', 'done', 'failed')),
  variants      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- channel -> R2 key (mirrors audio_assets.variants)
  cost_cents    INTEGER NULL,                        -- render cost attribution; SP6 metering seam, written by SP1 worker
  error         TEXT NULL,
  requested_by  UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_projects_client_status
  ON media_projects (client_id, status);
CREATE INDEX IF NOT EXISTS idx_media_timelines_project_version
  ON media_timelines (project_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_media_render_jobs_project_status
  ON media_render_jobs (project_id, status);
CREATE INDEX IF NOT EXISTS idx_media_render_jobs_timeline
  ON media_render_jobs (timeline_id);
