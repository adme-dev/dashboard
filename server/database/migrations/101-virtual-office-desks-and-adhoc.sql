-- =============================================================================
-- Phase 1c.0 — Desks and ad-hoc zones
-- =============================================================================
-- Adds two new zone_types ('desk' and 'adhoc') plus the columns needed to
-- back-reference desks to users and to mark ad-hoc rooms as ephemeral.
-- Backfill of desks for existing members is done lazily in app code on the
-- next GET /api/office/[id] — this migration is purely additive and safe
-- to re-run.
-- =============================================================================

-- 1. Update CHECK constraint on zone_type to include 'desk' and 'adhoc'
ALTER TABLE office_zones
  DROP CONSTRAINT office_zones_zone_type_check;

ALTER TABLE office_zones
  ADD CONSTRAINT office_zones_zone_type_check
  CHECK (zone_type = ANY (ARRAY['lobby'::text, 'meeting'::text, 'focus'::text, 'theater'::text, 'client_lounge'::text, 'desk'::text, 'adhoc'::text]));

-- 2. Add columns to office_zones
ALTER TABLE office_zones
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID
    REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_ephemeral BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anchor_zone_id UUID
    REFERENCES office_zones(id) ON DELETE CASCADE;

-- 3. Uniqueness: one desk per user per office
CREATE UNIQUE INDEX IF NOT EXISTS office_zones_desk_assignment_unique
  ON office_zones (office_id, assigned_user_id)
  WHERE zone_type = 'desk' AND assigned_user_id IS NOT NULL;

-- 4. Index for ephemeral-zone cleanup sweep
CREATE INDEX IF NOT EXISTS office_zones_ephemeral_idx
  ON office_zones (office_id, is_ephemeral)
  WHERE is_ephemeral = TRUE;
