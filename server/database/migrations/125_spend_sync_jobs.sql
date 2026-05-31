-- Migration 125: spend_sync_jobs
--
-- Tracks background spend-sync runs so the UI can poll for completion and
-- refresh its content when a sync actually finishes (instead of guessing).
-- The sync endpoints are fire-and-forget via waitUntil and previously exposed
-- no completion signal. A row is written 'running' when a sync is kicked off
-- and updated to 'completed' / 'failed' from inside the background promise,
-- carrying the synced count, total spend, and any per-account failures so the
-- operator can see (e.g.) which Google accounts returned 403.
--
-- Additive only — safe to (re)run.

CREATE TABLE IF NOT EXISTS spend_sync_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      TEXT NOT NULL,
  period        TEXT NOT NULL,                       -- 'YYYY-MM'
  status        TEXT NOT NULL DEFAULT 'running',      -- running | completed | failed
  synced_count  INTEGER NOT NULL DEFAULT 0,
  total_spend   NUMERIC NOT NULL DEFAULT 0,
  failures      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ account, reason }]
  error         TEXT,                                 -- set when status = 'failed'
  started_by    TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_spend_sync_jobs_lookup
  ON spend_sync_jobs (platform, period, started_at DESC);
