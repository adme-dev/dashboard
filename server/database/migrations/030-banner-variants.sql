-- Phase 3b: DCO (Dynamic Creative Optimization) — Pre-generated banner variants
CREATE TABLE banner_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  feed_id UUID NOT NULL REFERENCES banner_feeds(id) ON DELETE CASCADE,
  format_key VARCHAR(50) NOT NULL,
  row_index INTEGER NOT NULL,
  row_data JSONB NOT NULL DEFAULT '{}',
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_size INTEGER,
  click_url TEXT,
  is_live BOOLEAN DEFAULT TRUE,
  generated_by UUID NOT NULL REFERENCES team_members(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, feed_id, format_key, row_index)
);

CREATE INDEX idx_banner_variants_project ON banner_variants(project_id);
CREATE INDEX idx_banner_variants_feed ON banner_variants(feed_id);
