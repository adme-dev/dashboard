-- 079-quiet-hours.sql
-- Phase C: per-user quiet hours / DND (see docs/superpowers/specs/2026-04-29-phase-c-watch-improvements-design.md).
--
-- Suppresses web push during the configured window. In-app notification rows
-- are still written, so the inbox / digest / Watching page reflect everything
-- as the user comes back. @mentions and assignments bypass quiet hours
-- (high-signal events should always reach the user).
--
-- Shape:
-- {
--   enabled: boolean,
--   startMinute: number       (0..1439, minutes-of-day in user TZ)
--   endMinute: number         (0..1439; if < startMinute the range wraps midnight)
--   timezone: string          (IANA, e.g. "Australia/Sydney")
--   daysOfWeek: number[]      (0=Sunday … 6=Saturday)
-- }
--
-- NULL means not configured = treated as disabled.

BEGIN;

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS quiet_hours JSONB;

COMMIT;
