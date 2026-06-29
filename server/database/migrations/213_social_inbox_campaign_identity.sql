-- 213_social_inbox_campaign_identity.sql
-- Link inbox feedback to planner campaigns and paid-media campaign identities.

ALTER TABLE social_conversations
  ADD COLUMN IF NOT EXISTS linked_social_campaign_id UUID REFERENCES social_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_media_platform TEXT,
  ADD COLUMN IF NOT EXISTS paid_media_connection_id UUID REFERENCES social_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_media_account_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_media_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_media_campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS paid_media_linked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_social_conv_linked_social_campaign
  ON social_conversations(linked_social_campaign_id)
  WHERE linked_social_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conv_paid_media_identity
  ON social_conversations(client_id, paid_media_platform, paid_media_campaign_id)
  WHERE paid_media_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conv_campaign_feedback
  ON social_conversations(client_id, paid_media_platform, paid_media_campaign_id, last_message_at DESC)
  WHERE paid_media_campaign_id IS NOT NULL
    AND (sentiment < 0 OR rating <= 2);
