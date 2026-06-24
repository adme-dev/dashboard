-- 200_social_campaigns.sql — Planner Slice 3: first-class campaigns + post ownership. Additive.
CREATE TABLE IF NOT EXISTS social_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','planning','archived')),
  start_date DATE,
  end_date DATE,
  brief TEXT,
  goal_post_count INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_campaigns_client ON social_campaigns(client_id, status);

ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES social_campaigns(id) ON DELETE SET NULL;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_social_posts_campaign
  ON social_posts(campaign_id) WHERE campaign_id IS NOT NULL;
