-- Reconcile previously deployed news automation schema onto current main.
-- Existing rules, imported-story receipts and post history are preserved.

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

-- Preserve import history when a publishing credential is disconnected.
ALTER TABLE social_news_autopost_rules ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE social_news_autopost_rules DROP CONSTRAINT IF EXISTS social_news_autopost_rules_account_id_fkey;
ALTER TABLE social_news_autopost_rules ADD CONSTRAINT social_news_autopost_rules_account_id_fkey
  FOREIGN KEY(account_id) REFERENCES social_accounts(id) ON DELETE SET NULL;
-- Client deletion already cascades its posts; receipts follow the same lifecycle.
ALTER TABLE social_news_autopost_imports DROP CONSTRAINT IF EXISTS social_news_autopost_imports_rule_id_fkey;
ALTER TABLE social_news_autopost_imports ADD CONSTRAINT social_news_autopost_imports_rule_id_fkey
  FOREIGN KEY(rule_id) REFERENCES social_news_autopost_rules(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION pause_disconnected_news_autopost() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.mode := 'paused';
  NEW.last_error := 'Facebook Page disconnected. Select a connected Page and save settings to resume.';
  NEW.updated_at := NOW();
  UPDATE social_posts SET status='cancelled',updated_at=NOW()
    WHERE client_id=NEW.client_id AND status='scheduled'
      AND metadata->>'newsAutopostRuleId'=NEW.id::text
      AND metadata->>'newsAutopostAutomatic'='true';
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS social_news_autopost_account_disconnected ON social_news_autopost_rules;
CREATE TRIGGER social_news_autopost_account_disconnected BEFORE UPDATE OF account_id ON social_news_autopost_rules
  FOR EACH ROW WHEN (OLD.account_id IS DISTINCT FROM NEW.account_id AND NEW.account_id IS NULL)
  EXECUTE FUNCTION pause_disconnected_news_autopost();
