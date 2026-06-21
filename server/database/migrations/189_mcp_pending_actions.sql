-- MCP Phase 2c — let ai_pending_actions hold MCP-originated write proposals.
-- In-chat proposals belong to a conversation; MCP proposals don't (the external host has no
-- conversation). Make conversation_id nullable and tag the origin so MCP rows are distinguishable
-- and never surface in the chat UI (which queries by conversation_id). Additive + relaxing only.

ALTER TABLE ai_pending_actions ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE ai_pending_actions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'chat';

-- Claim/lookup of MCP proposals is by (id, user_id); index source for observability/filtering.
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_source ON ai_pending_actions(source);
