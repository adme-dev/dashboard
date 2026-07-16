-- 250_social_news_client_profiles.sql — durable client brief for news relevance and AI social copy.
CREATE TABLE IF NOT EXISTS social_news_client_profiles (
  client_id UUID PRIMARY KEY REFERENCES agency_clients(id) ON DELETE CASCADE,
  source_brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL,
  industry TEXT,
  target_audience TEXT,
  content_pillars TEXT[] NOT NULL DEFAULT '{}'::text[],
  include_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  exclude_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  makes TEXT[] NOT NULL DEFAULT '{}'::text[],
  brand_voice TEXT,
  default_tone TEXT NOT NULL DEFAULT 'professional',
  ai_instructions TEXT,
  preferred_platforms TEXT[] NOT NULL DEFAULT '{}'::text[],
  timezone TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  default_workflow TEXT NOT NULL DEFAULT 'draft' CHECK (default_workflow IN ('draft', 'schedule')),
  knowledge_embedding_id TEXT,
  imported_from_brief_at TIMESTAMPTZ,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_news_profiles_pillars
  ON social_news_client_profiles USING GIN (content_pillars);
CREATE INDEX IF NOT EXISTS idx_social_news_profiles_makes
  ON social_news_client_profiles USING GIN (makes);
