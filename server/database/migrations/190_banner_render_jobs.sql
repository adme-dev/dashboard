-- server/database/migrations/190_banner_render_jobs.sql
-- Async banner MP4 render jobs (#2a). Additive; safe to re-run.
CREATE TABLE IF NOT EXISTS banner_render_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  format_key    VARCHAR(50) NOT NULL,
  width         INT NOT NULL,
  height        INT NOT NULL,
  fps           INT NOT NULL,
  crf           INT NOT NULL,
  quality       INT NOT NULL,
  source_r2_key TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  r2_key        TEXT,
  url           TEXT,
  file_size     BIGINT,
  export_id     UUID REFERENCES banner_exports(id) ON DELETE SET NULL,
  error         TEXT,
  created_by    UUID NOT NULL REFERENCES team_members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_banner_render_jobs_project ON banner_render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_banner_render_jobs_status ON banner_render_jobs(status);
