-- 033: Banner Publish Scheduling
-- Phase 6b: Publishing & Distribution

-- Add scheduling support to banner_published
ALTER TABLE banner_published
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_status TEXT NOT NULL DEFAULT 'live'; -- 'live', 'scheduled', 'cancelled'

-- Pending scheduled publishes index
CREATE INDEX IF NOT EXISTS idx_banner_published_scheduled
  ON banner_published(scheduled_at)
  WHERE schedule_status = 'scheduled' AND scheduled_at IS NOT NULL;

-- Ad platform publish tracking
CREATE TABLE IF NOT EXISTS banner_ad_publishes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  published_id  UUID NOT NULL REFERENCES banner_published(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL, -- 'google_ads', 'meta_ads'
  account_id    TEXT NOT NULL,
  campaign_id   TEXT,
  ad_group_id   TEXT,  -- Google: ad_group_id, Meta: ad_set_id
  ad_id         TEXT,  -- Platform ad ID after creation
  status        TEXT NOT NULL DEFAULT 'pending', -- pending, published, paused, error
  error_message TEXT,
  published_by  UUID REFERENCES team_members(id) ON DELETE SET NULL,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_banner_ad_publishes_project ON banner_ad_publishes(project_id);
CREATE INDEX idx_banner_ad_publishes_published ON banner_ad_publishes(published_id);
