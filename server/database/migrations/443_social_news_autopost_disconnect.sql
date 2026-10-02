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
