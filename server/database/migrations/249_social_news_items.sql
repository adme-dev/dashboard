-- 249_social_news_items.sql — MCP/news source inbox for selective social publishing.
-- Source records are immutable; rewrite and publishing state live on the linked social post.
CREATE TABLE IF NOT EXISTS social_news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'mcp_news',
  external_id TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'selected', 'dismissed', 'used')),
  linked_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_social_news_items_status ON social_news_items(status, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_social_news_items_published ON social_news_items(published_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS social_news_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO social_news_sources (source_key, display_name, endpoint_url)
VALUES ('mcp_news', 'MCP News Feed', 'https://adme-advertising.netlify.app/api/mcp')
ON CONFLICT (source_key) DO NOTHING;
