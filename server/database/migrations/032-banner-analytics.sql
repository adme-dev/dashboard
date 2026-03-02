-- 032: Banner Analytics + A/B Testing
-- Phase 6a: Analytics & Optimization

-- Daily aggregated analytics per published banner
CREATE TABLE IF NOT EXISTS banner_analytics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_id  UUID NOT NULL REFERENCES banner_published(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  impressions   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(published_id, date)
);

CREATE INDEX idx_banner_analytics_published ON banner_analytics(published_id);
CREATE INDEX idx_banner_analytics_date ON banner_analytics(date);

-- A/B tests for comparing variants
CREATE TABLE IF NOT EXISTS banner_ab_tests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  format_key    TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft', -- draft, running, paused, completed
  variants      JSONB NOT NULL DEFAULT '[]',   -- [{ variantId, label, weight }]
  winner_id     TEXT,                           -- variantId of winner
  created_by    UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_banner_ab_tests_project ON banner_ab_tests(project_id);
