-- Banner Dissector: AI-powered banner analysis and layer segmentation
-- Stores dissection jobs with their manifests (layers, tokens, assets)

CREATE TABLE banner_dissections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id),
  project_id UUID REFERENCES banner_projects(id),
  source_r2_key TEXT NOT NULL,
  source_url TEXT,
  brand TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'analyzing',
  manifest JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dissections_user ON banner_dissections(user_id);
CREATE INDEX idx_dissections_job ON banner_dissections(job_id);
