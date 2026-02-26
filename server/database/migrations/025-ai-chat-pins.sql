-- Add pinning/bookmarks to AI conversations
-- Max 25 pinned conversations enforced in application code

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Index for efficient pinned-first ordering
CREATE INDEX IF NOT EXISTS idx_ai_conversations_pinned
  ON ai_conversations (user_id, is_pinned DESC, pinned_at DESC NULLS LAST)
  WHERE is_archived = false;
