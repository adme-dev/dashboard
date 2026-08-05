-- Durable post-commit Vectorize indexing for explicitly remembered user memory.
-- Additive only. The memory row and this outbox row are written in one transaction.
CREATE TABLE IF NOT EXISTS ai_memory_index_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL UNIQUE REFERENCES ai_user_memory(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_index_outbox_claim
  ON ai_memory_index_outbox (status, next_attempt_at, created_at);
