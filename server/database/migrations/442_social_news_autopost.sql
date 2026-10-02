-- Opt-in, client-scoped published-news replenishment. Existing calendars are unchanged.
CREATE TABLE IF NOT EXISTS social_news_autopost_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES agency_clients(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE RESTRICT,
  source_key TEXT NOT NULL DEFAULT 'driveagent-publication' CHECK (source_key = 'driveagent-publication'),
  mode TEXT NOT NULL DEFAULT 'paused' CHECK (mode IN ('paused','review','automatic')),
  configured_by TEXT NOT NULL,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  last_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_news_autopost_due ON social_news_autopost_rules(next_check_at) WHERE mode <> 'paused';
CREATE TABLE IF NOT EXISTS social_news_autopost_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES social_news_autopost_rules(id) ON DELETE RESTRICT,
  article_id TEXT NOT NULL,
  article_url TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('scheduled','review','existing')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rule_id, article_id),
  UNIQUE(rule_id, article_url)
);
