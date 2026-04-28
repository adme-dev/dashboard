-- 081-keyword-embeddings.sql
-- Phase E2: semantic keyword subscriptions via Vectorize.
--
-- We store the Vectorize ID alongside each keyword row so we can update
-- and delete vectors in lockstep with row CRUD. Vectorize itself holds
-- the 768-dim embedding (Workers AI bge-base-en-v1.5).
--
-- vector_id format: `kw_<keyword_subscription_id>`
-- last_embedded_at: when the embedding was last refreshed (re-embed if keyword text changes).

BEGIN;

ALTER TABLE keyword_subscriptions
  ADD COLUMN IF NOT EXISTS vector_id TEXT,
  ADD COLUMN IF NOT EXISTS last_embedded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_keyword_subs_vector_id
  ON keyword_subscriptions(vector_id) WHERE vector_id IS NOT NULL;

COMMIT;
