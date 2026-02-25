-- 019-chat-pins.sql
-- Add pinned message support to chat_messages

ALTER TABLE chat_messages ADD COLUMN pinned_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN pinned_by UUID REFERENCES team_members(id);

CREATE INDEX idx_chat_messages_pinned ON chat_messages(channel_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;
