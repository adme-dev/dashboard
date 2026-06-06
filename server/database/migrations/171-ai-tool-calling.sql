-- Slice 1: AI tool-calling — read-tool trace + write-action audit
-- Additive + idempotent (IF NOT EXISTS guards). Unused until AI_TOOLS_ENABLED=true.

-- Per-turn read-tool trace (tools consulted, arg summary, latency) for the "🔎 Consulted: …" chip + debugging.
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS tool_calls JSONB;

-- Append-only audit of AI-initiated mutations (create_task today): proposed → executed | cancelled.
-- Rows transition status; never hard-deleted. user_id / confirmed_by are UUID to match ai_conversations.user_id.
CREATE TABLE IF NOT EXISTS ai_pending_actions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  tool_name        TEXT NOT NULL,
  resolved_payload JSONB NOT NULL,
  status           TEXT NOT NULL DEFAULT 'proposed', -- proposed | cancelled | executed
  result_ref       TEXT,                              -- created entity id (e.g. task id)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  confirmed_by     UUID,
  executed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_conv ON ai_pending_actions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_status ON ai_pending_actions(status);
