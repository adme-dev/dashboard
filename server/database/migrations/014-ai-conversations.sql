-- 014-ai-conversations.sql
-- AI Chat: conversations and messages tables

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  title VARCHAR(500),
  model VARCHAR(100) DEFAULT 'llama-3.3-70b-versatile',
  system_context JSONB DEFAULT '{}',
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, is_archived, last_message_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  context_sources JSONB DEFAULT '[]',
  token_count INT,
  model VARCHAR(100),
  latency_ms INT,
  is_error BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);
