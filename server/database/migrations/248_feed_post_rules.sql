-- 248: Auto Feed → auto-draft rules (dealer feeds plugin, slice 3)
-- Per-client rules that turn matching vehicle-feed items into DRAFT
-- social posts (never published automatically) + a notification.

CREATE TABLE IF NOT EXISTS feed_post_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT '{new}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  caption_template TEXT,
  notify_user_id UUID,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_post_rules_client ON feed_post_rules (client_id) WHERE enabled;

-- Dedupe ledger: one draft per (rule, feed item), ever.
CREATE TABLE IF NOT EXISTS feed_rule_executions (
  rule_id UUID NOT NULL REFERENCES feed_post_rules(id) ON DELETE CASCADE,
  feed_item_id TEXT NOT NULL,
  social_post_id UUID,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rule_id, feed_item_id)
);
