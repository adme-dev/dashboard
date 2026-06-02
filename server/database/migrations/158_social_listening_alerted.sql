-- 158_social_listening_alerted.sql — Slice 4d. Lets each mention alert at most once.
-- Additive + idempotent.
ALTER TABLE social_listening_mentions ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_listening_mentions_to_alert
  ON social_listening_mentions(client_id) WHERE alerted_at IS NULL AND sentiment = 'negative';
