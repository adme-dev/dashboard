-- 254_social_news_feedback_events.sql
-- Append-only feedback tying client decisions and publishing outcomes back to
-- immutable MCP news stories. This is intentionally separate from source rows.
CREATE TABLE IF NOT EXISTS social_news_feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  news_item_id UUID NOT NULL REFERENCES social_news_items(id) ON DELETE CASCADE,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  platform TEXT,
  actor_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'selected', 'dismissed', 'rewritten', 'drafted', 'scheduled',
    'approval_requested', 'approved', 'rejected', 'published', 'failed', 'performance'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_news_feedback_client_story
  ON social_news_feedback_events(client_id, news_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_news_feedback_client_type
  ON social_news_feedback_events(client_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_news_feedback_post
  ON social_news_feedback_events(post_id, created_at DESC)
  WHERE post_id IS NOT NULL;

COMMENT ON TABLE social_news_feedback_events IS
  'Append-only client-scoped feedback and publishing outcomes for immutable news stories.';
