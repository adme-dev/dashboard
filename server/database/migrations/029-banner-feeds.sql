-- Phase 3a: Banner Data Feeds
CREATE TABLE banner_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'csv',
  columns JSONB NOT NULL DEFAULT '[]',
  row_count INTEGER DEFAULT 0,
  r2_key TEXT,
  data_url TEXT,
  sample_data JSONB DEFAULT '[]',
  uploaded_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_banner_feeds_project ON banner_feeds(project_id);
