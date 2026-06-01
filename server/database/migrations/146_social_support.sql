-- 146_social_support.sql — recurring posting slots, templates, and per-post metrics.
CREATE TABLE IF NOT EXISTS social_slot_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Posting slot',
  platforms TEXT[] NOT NULL DEFAULT '{}'::text[],
  day_of_week INT NOT NULL,               -- 0=Sun..6=Sat
  time_of_day TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  capacity INT NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_slots_client ON social_slot_schedules(client_id, enabled);

CREATE TABLE IF NOT EXISTS social_post_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT,
  platforms TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  impressions INT DEFAULT 0,
  engagements INT DEFAULT 0,
  clicks INT DEFAULT 0,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON social_post_metrics(post_id);
