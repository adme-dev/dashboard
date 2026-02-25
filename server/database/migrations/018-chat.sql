-- 018-chat.sql
-- Chat infrastructure: channels, members, messages, reactions, mentions

-- Chat channels
CREATE TABLE chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'channel',  -- channel, dm, group_dm
  is_private BOOLEAN DEFAULT false,
  created_by UUID REFERENCES team_members(id),
  department_id UUID REFERENCES departments(id),
  task_id UUID REFERENCES tasks(id),
  avatar_url TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug)
);

CREATE INDEX idx_chat_channels_type ON chat_channels(type);
CREATE INDEX idx_chat_channels_department ON chat_channels(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX idx_chat_channels_task ON chat_channels(task_id) WHERE task_id IS NOT NULL;

-- Channel membership
CREATE TABLE chat_channel_members (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id),
  role VARCHAR(20) DEFAULT 'member',  -- owner, admin, member
  muted_until TIMESTAMPTZ,
  last_read_message_id BIGINT DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_chat_channel_members_user ON chat_channel_members(user_id);

-- Messages (cold/archive storage — hot messages live in DO SQLite)
CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES chat_channels(id),
  user_id UUID NOT NULL REFERENCES team_members(id),
  content TEXT NOT NULL,
  thread_parent_id BIGINT REFERENCES chat_messages(id),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',  -- attachments, link previews, task refs, mentions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_parent_id) WHERE thread_parent_id IS NOT NULL;
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id, created_at DESC);

-- Reactions
CREATE TABLE chat_reactions (
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id),
  emoji VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Mentions (for fast lookup / notification routing)
CREATE TABLE chat_mentions (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES chat_channels(id),
  user_id UUID REFERENCES team_members(id),  -- NULL for @channel/@everyone
  mention_type VARCHAR(20) DEFAULT 'user',   -- user, channel, everyone
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_mentions_user ON chat_mentions(user_id, created_at DESC);

-- Full-text search on messages
ALTER TABLE chat_messages ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
CREATE INDEX idx_chat_messages_search ON chat_messages USING gin(search_vector);
