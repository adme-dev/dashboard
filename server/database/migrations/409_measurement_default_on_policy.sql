-- Measurement is desired-on for every newly created client profile, while the
-- independent enabled/environment delivery gates remain fail-closed. Existing
-- profiles enter a review queue; this migration never live-activates them.

BEGIN;

ALTER TABLE client_measurement_profiles
  ADD COLUMN IF NOT EXISTS desired_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS desired_state_source TEXT;

UPDATE client_measurement_profiles
   SET desired_enabled = TRUE,
       desired_state_source = 'existing_review'
 WHERE desired_enabled IS NULL
    OR desired_state_source IS NULL;

ALTER TABLE client_measurement_profiles
  ALTER COLUMN desired_enabled SET DEFAULT TRUE,
  ALTER COLUMN desired_enabled SET NOT NULL,
  ALTER COLUMN desired_state_source SET DEFAULT 'new_client_default',
  ALTER COLUMN desired_state_source SET NOT NULL;

ALTER TABLE client_measurement_profiles
  DROP CONSTRAINT IF EXISTS client_measurement_profiles_desired_state_source_check;
ALTER TABLE client_measurement_profiles
  ADD CONSTRAINT client_measurement_profiles_desired_state_source_check
  CHECK (desired_state_source IN (
    'new_client_default', 'existing_review', 'operator', 'explicit_opt_out'
  ));

COMMENT ON COLUMN client_measurement_profiles.desired_enabled IS
  'Client policy intent only. Runtime collection/delivery remains governed by enabled, environment, consent, readiness, and approvals.';
COMMENT ON COLUMN client_measurement_profiles.desired_state_source IS
  'Why desired state was set. existing_review never implies bulk live activation.';

COMMIT;
