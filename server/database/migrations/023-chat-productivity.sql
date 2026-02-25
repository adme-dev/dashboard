-- 023-chat-productivity.sql
-- Phase 8: Chat Productivity & Quality-of-Life
-- Read receipts, message forwarding metadata, link preview caching

-- ── Read Receipts ──
-- Track per-user read position in each channel (supplements chat_channel_members.last_read_message_id)
CREATE TABLE IF NOT EXISTS chat_read_receipts (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id),
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_read_receipts_channel
  ON chat_read_receipts(channel_id, last_read_message_id DESC);

-- ── Message Forwarding ──
-- Track forwarded message origin
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS forwarded_from_channel_id UUID REFERENCES chat_channels(id),
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id BIGINT;

-- ── Link Previews ──
-- Cache OG metadata on messages to avoid re-fetching
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS link_previews JSONB DEFAULT NULL;
-- link_previews schema: [{ url, title, description, image, favicon, siteName }]
