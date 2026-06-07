-- 172-ai-message-cost.sql
-- Persist the AI tool-loop's per-turn cost + token usage so Groq/LLM spend is queryable.
-- Additive + idempotent. cost_usd is the estimate from real token usage × model price
-- (toolLoop.estimateCostUsd); NULL on non-tool-loop turns.

ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(12, 6);
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS prompt_tokens INT;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS completion_tokens INT;

-- Daily-spend rollups: WHERE created_at >= CURRENT_DATE AND cost_usd IS NOT NULL.
CREATE INDEX IF NOT EXISTS idx_ai_messages_cost ON ai_messages(created_at) WHERE cost_usd IS NOT NULL;
