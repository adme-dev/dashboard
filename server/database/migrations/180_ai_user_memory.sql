-- 180_ai_user_memory.sql
-- Phase-0 WS-A: per-user long-term memory (3 scopes: semantic | episodic | procedural).
-- Postgres is the source of truth; Vectorize holds the derived embedding for recall.
-- Strictly user_id-scoped (privacy separation); `scope='org'` is agency-shared, never private facts.
-- Additive + fail-soft: absent/binding-less envs degrade to no memory (see memory spec §2).

CREATE TABLE IF NOT EXISTS ai_user_memory (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'user',         -- user | org
  mem_type     TEXT NOT NULL,                         -- semantic | episodic | procedural
  content      TEXT NOT NULL,                         -- the natural-language memory
  source       TEXT NOT NULL DEFAULT 'inferred',      -- inferred | explicit | system
  salience     REAL NOT NULL DEFAULT 0.5,             -- 0..1 importance; reinforced on re-remember
  embedding_id TEXT,                                   -- Vectorize vector id (NULL until embedded)
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {clientId, entityType, ...}
  last_used_at TIMESTAMPTZ,                            -- updated on retrieval (recency signal)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- soft-dedup: one row per (user, type, normalized content)
  CONSTRAINT ai_user_memory_uniq UNIQUE (user_id, mem_type, content)
);

CREATE INDEX IF NOT EXISTS idx_ai_user_memory_user      ON ai_user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_user_memory_user_type ON ai_user_memory(user_id, mem_type);
CREATE INDEX IF NOT EXISTS idx_ai_user_memory_recency   ON ai_user_memory(user_id, last_used_at DESC NULLS LAST);
