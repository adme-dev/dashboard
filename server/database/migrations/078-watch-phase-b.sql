-- 078-watch-phase-b.sql
-- Phase B of the Watch improvements (see docs/superpowers/specs/2026-04-28-phase-b-watch-improvements-design.md).
--
-- Also fixes a Phase A blocker: migration 003-subscriptions.sql used
-- `UNIQUE(... COALESCE(...))` at the table level, which Postgres rejects
-- (UNIQUE constraints don't accept expressions — only UNIQUE INDEX does).
-- The `board_subscriptions` table was never actually created. Endpoints
-- swallow the "does not exist" error and return empty, so Phase A's Watch
-- dropdown looked functional but never persisted anything.
--
-- This migration creates the table correctly (table + UNIQUE INDEX), then
-- adds the Phase B columns:
--
-- 1. board_subscriptions.snooze_until: per-board snooze. While `snooze_until > NOW()`,
--    the subscription is treated as muted by getSubscribers(). NULL = not snoozed.
--    Auto-uncovers on expiry — no cron job needed.
--
-- 2. team_members.auto_subscribe_on_participation: opt-out flag for the auto-watch
--    behaviour wired into task creation, comments, assignment, and @mentions.
--    Default TRUE — most users benefit; power users can disable in settings.

BEGIN;

-- Phase A baseline (was missing in this DB due to broken migration 003)
CREATE TABLE IF NOT EXISTS board_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  item_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  column_id UUID REFERENCES custom_columns(id) ON DELETE CASCADE,
  events TEXT[] DEFAULT '{}',
  notify_inapp BOOLEAN DEFAULT true,
  notify_email BOOLEAN DEFAULT false,
  is_muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE INDEX (not UNIQUE constraint) so we can use COALESCE expressions.
-- Matches the ON CONFLICT clause in subscribe.post.ts and autoSubscribe().
CREATE UNIQUE INDEX IF NOT EXISTS uniq_board_subs_scope
  ON board_subscriptions (
    user_id,
    board_id,
    COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(column_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_board_subs_user ON board_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_board_subs_board ON board_subscriptions(board_id);
CREATE INDEX IF NOT EXISTS idx_board_subs_item ON board_subscriptions(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_subs_column ON board_subscriptions(column_id) WHERE column_id IS NOT NULL;

-- Phase B additions
ALTER TABLE board_subscriptions ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS auto_subscribe_on_participation BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_board_subscriptions_snooze
  ON board_subscriptions(user_id, snooze_until)
  WHERE snooze_until IS NOT NULL;

COMMIT;
