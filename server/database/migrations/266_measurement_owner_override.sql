-- 266_measurement_owner_override.sql
-- Owner-only, audited break-glass support for single-owner Measurement activation.

BEGIN;

ALTER TABLE measurement_activation_approvals
  ADD COLUMN IF NOT EXISTS separation_override BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  approved_by_unique_constraint TEXT;
BEGIN
  SELECT constraint_row.conname
    INTO approved_by_unique_constraint
    FROM pg_constraint constraint_row
   WHERE constraint_row.conrelid = 'measurement_activation_approvals'::regclass
     AND constraint_row.contype = 'u'
     AND pg_get_constraintdef(constraint_row.oid) LIKE '%approved_by%'
   LIMIT 1;

  IF approved_by_unique_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE measurement_activation_approvals DROP CONSTRAINT %I',
      approved_by_unique_constraint
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_measurement_approval_separation()
RETURNS TRIGGER AS $$
DECLARE
  conflicting_approval_kind TEXT;
  active_owner BOOLEAN;
BEGIN
  SELECT approval.approval_kind
    INTO conflicting_approval_kind
    FROM measurement_activation_approvals approval
   WHERE approval.client_id = NEW.client_id
     AND approval.profile_id = NEW.profile_id
     AND approval.config_version = NEW.config_version
     AND approval.approved_by = NEW.approved_by
   LIMIT 1;

  IF conflicting_approval_kind IS NULL THEN
    IF NEW.separation_override IS TRUE THEN
      RAISE EXCEPTION 'Measurement owner override requires an existing approval by the same owner'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.approval_kind <> 'live' OR NEW.separation_override IS NOT TRUE THEN
    RAISE EXCEPTION 'Privacy and live approval require two different team members'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM team_members member
     WHERE member.id = NEW.approved_by
       AND member.user_role = 'owner'
       AND member.is_active = TRUE
  ) INTO active_owner;

  IF active_owner IS NOT TRUE THEN
    RAISE EXCEPTION 'Measurement separation override requires an active application owner'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_measurement_approval_separation
  ON measurement_activation_approvals;
CREATE TRIGGER trg_measurement_approval_separation
  BEFORE INSERT ON measurement_activation_approvals
  FOR EACH ROW EXECUTE FUNCTION enforce_measurement_approval_separation();

COMMENT ON COLUMN measurement_activation_approvals.separation_override IS
  'True only for an active application owner explicitly overriding the two-person live-approval gate.';

COMMENT ON TABLE measurement_activation_approvals IS
  'Append-only privacy/live approvals bound to one canonical profile version; distinct approvers are standard and active owners may record an audited live-gate override.';

COMMIT;
