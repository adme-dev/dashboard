-- 021-chat-channel-prefs.sql
-- Per-channel notification preferences and channel discoverability

-- Notification preferences per channel per user
CREATE TABLE IF NOT EXISTS chat_channel_notification_prefs (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  notify_level VARCHAR(20) NOT NULL DEFAULT 'all',  -- all, mentions, nothing
  muted_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

-- Add member_count to channels for browse performance
-- (computed on read, but we add an index to speed up the join)
CREATE INDEX IF NOT EXISTS idx_chat_channel_members_channel
  ON chat_channel_members(channel_id);

-- Index for browsing public channels
CREATE INDEX IF NOT EXISTS idx_chat_channels_public
  ON chat_channels(type, is_private, archived_at)
  WHERE type = 'channel' AND is_private = false AND archived_at IS NULL;
