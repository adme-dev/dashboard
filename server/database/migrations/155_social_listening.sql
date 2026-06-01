-- 155_social_listening.sql — Social Suite Slice 4: brand listening.
-- Additive + idempotent. External source adapters, enrichment, and alerting are later
-- phases (4b–4d) and ship dormant; this migration only adds storage.

CREATE TABLE IF NOT EXISTS social_listening_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  include_terms TEXT[] NOT NULL DEFAULT '{}'::text[],
  exclude_terms TEXT[] NOT NULL DEFAULT '{}'::text[],
  sources TEXT[] NOT NULL DEFAULT '{}'::text[],   -- subset of reddit|news|youtube|bluesky|mastodon
  category TEXT,                                   -- brand|competitor|product|campaign
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listening_queries_client ON social_listening_queries(client_id, enabled);

CREATE TABLE IF NOT EXISTS social_listening_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  query_id UUID REFERENCES social_listening_queries(id) ON DELETE SET NULL,
  source TEXT NOT NULL,                            -- reddit|news|youtube|bluesky|mastodon|owned
  external_id TEXT NOT NULL,
  url TEXT,
  author TEXT,
  title TEXT,
  content TEXT,
  lang TEXT,
  published_at TIMESTAMPTZ,
  sentiment TEXT,                                  -- positive|neutral|negative|unknown
  sentiment_score REAL,
  topics TEXT[] NOT NULL DEFAULT '{}'::text[],
  enriched_at TIMESTAMPTZ,                         -- null = needs enrichment (4c)
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_listening_mentions_client ON social_listening_mentions(client_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_listening_mentions_query ON social_listening_mentions(query_id);
CREATE INDEX IF NOT EXISTS idx_listening_mentions_unenriched ON social_listening_mentions(client_id) WHERE enriched_at IS NULL;
