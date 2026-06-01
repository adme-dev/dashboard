-- 145_social_posts.sql — one row per post; fan-out via arrays.
-- platform_overrides (per-network customization) + tags added vs sibling schema.
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_by TEXT,
  content TEXT NOT NULL DEFAULT '',
  media_urls TEXT[],
  link_url TEXT,
  hashtags TEXT[],
  first_comment TEXT,
  platforms TEXT[] NOT NULL DEFAULT '{}'::text[],
  account_ids UUID[],
  platform_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {instagram:{content,mediaUrls},...}
  tags TEXT[],
  scheduled_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','approved','scheduled','publishing','published','partially_published','failed','cancelled'
  )),
  platform_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  publish_attempts INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  approval_requested_at TIMESTAMPTZ,
  approval_requested_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  queue_position INT,
  queued_from_optimal BOOLEAN DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_posts_client ON social_posts(client_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_due ON social_posts(scheduled_at)
  WHERE status IN ('approved','scheduled');
CREATE INDEX IF NOT EXISTS idx_social_posts_queue ON social_posts(client_id, queue_position)
  WHERE queue_position IS NOT NULL AND status IN ('draft','scheduled');
