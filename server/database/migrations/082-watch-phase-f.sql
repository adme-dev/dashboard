-- 082-watch-phase-f.sql
-- Phase F hot-fixes following the post-Phase-E2 code review:
--
-- 1. Index notifications(user_id, importance_score) for the inbox
--    sort-by-importance query — sequential scan was the only path before.
--
-- 2. Index board_visits(visited_at) so the periodic prune (delete > 30
--    days old) is fast.
--
-- 3. ratelimit_buckets table: simple per-user/per-key throttle storage
--    used by /api/notifications/refine-scores and /api/notifications/[id]/why
--    to bound LLM cost. Deliberately NOT user-scoped FK so we can throttle
--    other resources later without schema changes.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_notifications_importance
  ON notifications(user_id, importance_score DESC, created_at DESC)
  WHERE importance_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_board_visits_visited_at
  ON board_visits(visited_at);

CREATE TABLE IF NOT EXISTS ratelimit_buckets (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ratelimit_window
  ON ratelimit_buckets(window_started_at);

COMMIT;
