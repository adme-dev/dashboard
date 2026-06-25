-- Unified AI invocation ledger.
-- Additive only: records model/provider/gateway/fallback usage without replacing ai_messages cost fields.

CREATE TABLE IF NOT EXISTS ai_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  gateway_used BOOLEAN NOT NULL DEFAULT false,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  agent_run_id UUID,
  user_id UUID,
  client_id UUID,
  request_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC(12, 8),
  status TEXT NOT NULL DEFAULT 'success',
  error_code TEXT,
  latency_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_created_at
  ON ai_invocations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_feature_key
  ON ai_invocations (feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_model_id
  ON ai_invocations (model_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_invocations_client_id
  ON ai_invocations (client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_invocations_agent_run_id
  ON ai_invocations (agent_run_id, created_at DESC)
  WHERE agent_run_id IS NOT NULL;
