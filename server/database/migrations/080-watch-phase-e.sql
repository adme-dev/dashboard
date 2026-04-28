-- 080-watch-phase-e.sql
-- Phase E: AI-driven watch features (see docs/superpowers/specs/2026-04-29-phase-e-watch-improvements-design.md).
--
-- Adds:
-- 1. board_visits — lightweight visit log for auto-watch suggestions.
--    Capped to recent visits per (user, board) via cleanup query in app.
--
-- 2. team_members.auto_ack_assignments — opt-in for auto-posting an
--    acknowledgement comment on assignment notifications.
--
-- 3. keyword_subscriptions — text-keyword watch list. Notifications matching
--    a keyword via ILIKE on title or message create an extra notification
--    with reason='direct'. Semantic embedding match is deferred to a
--    future phase.

BEGIN;

CREATE TABLE IF NOT EXISTS board_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_visits_lookup
  ON board_visits(user_id, board_id, visited_at DESC);

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS auto_ack_assignments BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS keyword_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_subs_user ON keyword_subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_keyword_subs ON keyword_subscriptions(user_id, LOWER(keyword));

COMMIT;
