-- 020-chat-enhancements.sql
-- User presence status, saved messages, and message quoting

-- User chat status (presence)
CREATE TABLE user_chat_status (
  user_id UUID PRIMARY KEY REFERENCES team_members(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'online',  -- online, away, dnd, offline
  custom_text VARCHAR(100),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved / bookmarked messages
CREATE TABLE chat_saved_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

CREATE INDEX idx_chat_saved_user ON chat_saved_messages(user_id, created_at DESC);

-- Message quoting (reply-to)
ALTER TABLE chat_messages ADD COLUMN reply_to_id BIGINT REFERENCES chat_messages(id);
CREATE INDEX idx_chat_messages_reply ON chat_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
