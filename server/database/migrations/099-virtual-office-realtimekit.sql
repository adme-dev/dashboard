-- =============================================================================
-- Virtual Office Phase 1b v2 — RealtimeKit meeting persistence
-- =============================================================================
--
-- Adds Cloudflare RealtimeKit meeting + preset metadata to office_zones.
--   - cf_meeting_id is created lazily by the OfficeRoom DO on first zone:enter
--     and persisted via POST /api/office/_internal/meeting. Once set it never
--     changes; meetings are persistent in RealtimeKit and reused across sessions.
--   - cf_preset_default names the RealtimeKit preset assigned to staff entering
--     this zone by default (e.g. 'staff_full'). Per-user preset overrides (like
--     'viewer_lurking') are decided server-side at mint time, not stored here.

BEGIN;

ALTER TABLE office_zones
  ADD COLUMN IF NOT EXISTS cf_meeting_id text NULL,
  ADD COLUMN IF NOT EXISTS cf_preset_default text NOT NULL DEFAULT 'staff_full';

CREATE INDEX IF NOT EXISTS idx_office_zones_cf_meeting_id
  ON office_zones (cf_meeting_id)
  WHERE cf_meeting_id IS NOT NULL;

COMMENT ON COLUMN office_zones.cf_meeting_id IS
  'Cloudflare RealtimeKit meeting UUID. Created lazily by the OfficeRoom DO on first zone:enter.';
COMMENT ON COLUMN office_zones.cf_preset_default IS
  'Default RealtimeKit preset name for participants entering this zone (e.g. staff_full).';

COMMIT;
