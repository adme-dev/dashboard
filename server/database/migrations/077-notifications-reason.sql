-- 077-notifications-reason.sql
-- Adds reason + importance_score to notifications.
--
-- Phase A of the Watch improvements (see docs/superpowers/specs/2026-04-28-phase-a-watch-improvements-design.md).
-- - reason: enum-ish text. Tells the inbox WHY each notification was sent.
--   Values: 'mentioned' | 'assigned' | 'watching_board' | 'watching_item' | 'direct'
--   Existing rows stay NULL and render without a badge.
--
-- - importance_score: FLOAT (0..1) reserved for Phase E AI inbox triage.
--   Nullable; NULL means "not scored yet". Adding the column now avoids
--   touching this table again when the agent ships.
--
-- Filtered index supports the upcoming Phase B "filter by reason" inbox facet.

BEGIN;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS importance_score REAL;

CREATE INDEX IF NOT EXISTS idx_notifications_reason
  ON notifications(user_id, reason)
  WHERE reason IS NOT NULL;

COMMIT;
