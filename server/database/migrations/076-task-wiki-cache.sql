-- 076-task-wiki-cache.sql
-- Caches per-task AI-generated context ("Wiki" tab) for boards with a connected
-- repo. The wiki summary is derived from the task title/description plus
-- graphify codebase nodes; we cache to avoid re-running the LLM call on every
-- task panel open.
--
-- Cache invalidation: source_hash combines task title+description with the
-- repo's graphify_last_synced_at, so any of those changing forces a regenerate.
-- The /wiki/regenerate endpoint clears the row to force a fresh build.

BEGIN;

CREATE TABLE IF NOT EXISTS task_wiki_cache (
  task_id        UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  summary        TEXT NOT NULL DEFAULT '',
  files          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ path, label, source_location? }]
  source_hash    TEXT NOT NULL,                       -- sha256 of title+desc+graphify_path+graphify_synced_at
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by_model TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_wiki_cache_generated_at
  ON task_wiki_cache(generated_at DESC);

COMMIT;
