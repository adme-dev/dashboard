-- 212_social_inbox_case_events.sql
-- Staff-visible case events for Social Inbox workflow changes.

CREATE TABLE IF NOT EXISTS social_conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_conv_events_conversation_created
  ON social_conversation_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_conv_events_client_created
  ON social_conversation_events(client_id, created_at DESC);
