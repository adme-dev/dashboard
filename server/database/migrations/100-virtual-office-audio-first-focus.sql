-- =============================================================================
-- Phase 1c.1 — Audio-first focus zones
-- =============================================================================
-- Focus zones default to audio_only_publish preset (CF RealtimeKit). Existing
-- focus zones flipped from staff_full → audio_only_publish; future inserts
-- enforced via BEFORE INSERT trigger so the admin floor-plan editor (1c.5)
-- and any future seeding code auto-get the right default.

BEGIN;

UPDATE office_zones
   SET cf_preset_default = 'audio_only_publish'
 WHERE zone_type = 'focus'
   AND cf_preset_default = 'staff_full';

CREATE OR REPLACE FUNCTION office_zones_default_preset_for_focus()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.zone_type = 'focus' AND (NEW.cf_preset_default IS NULL OR NEW.cf_preset_default = 'staff_full') THEN
    NEW.cf_preset_default := 'audio_only_publish';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_office_zones_default_preset ON office_zones;
CREATE TRIGGER trg_office_zones_default_preset
  BEFORE INSERT ON office_zones
  FOR EACH ROW
  EXECUTE FUNCTION office_zones_default_preset_for_focus();

COMMIT;
