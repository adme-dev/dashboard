-- 173_video_reviews.sql — client-portal review of a rendered video. Dedicated table (the
-- shipped client_approvals is project_id-centric and lacks client_id; media projects aren't
-- `projects` rows). Additive, dormant until the Video Studio portal surface is reached.
CREATE TABLE IF NOT EXISTS video_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  media_project_id UUID NOT NULL,
  job_id          UUID NOT NULL,
  format          TEXT NOT NULL,
  r2_key          TEXT NOT NULL,
  title           TEXT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','revision_requested')),
  response_notes  TEXT NULL,
  responded_by    UUID NULL,
  responded_at    TIMESTAMPTZ NULL,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_reviews_client_status ON video_reviews (client_id, status);
CREATE INDEX IF NOT EXISTS idx_video_reviews_created_at ON video_reviews (created_at DESC);
