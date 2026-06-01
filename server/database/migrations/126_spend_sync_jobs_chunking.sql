-- Migration 126: per-account chunking counters on spend_sync_jobs
--
-- The Meta sync over 100+ ad accounts can't finish inside a single Cloudflare
-- Queue consumer invocation (the consumer has no request context, so db.ts
-- falls back to the ~9x-slower neon() HTTP driver). We now fan the sync out to
-- one queue message per connection; each message syncs a single account and
-- atomically increments these counters. The job is marked 'completed' by the
-- fan-in UPDATE once processed_accounts reaches total_accounts.
--
-- Additive only — safe to (re)run.

ALTER TABLE spend_sync_jobs ADD COLUMN IF NOT EXISTS total_accounts     INTEGER;
ALTER TABLE spend_sync_jobs ADD COLUMN IF NOT EXISTS processed_accounts INTEGER NOT NULL DEFAULT 0;
