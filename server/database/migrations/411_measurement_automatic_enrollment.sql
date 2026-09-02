-- Automatically enrol every managed client in measurement policy. This makes
-- measurement desired-on without guessing provider accounts or bypassing the
-- independent live-delivery, consent, readiness and approval gates.

BEGIN;

CREATE OR REPLACE FUNCTION provision_default_client_measurement_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO client_measurement_profiles (
    client_id,
    vertical,
    desired_enabled,
    desired_state_source
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.industry), ''), 'general'),
    TRUE,
    'new_client_default'
  )
  ON CONFLICT (client_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_clients_default_measurement_profile
  ON agency_clients;
CREATE TRIGGER trg_agency_clients_default_measurement_profile
AFTER INSERT ON agency_clients
FOR EACH ROW EXECUTE FUNCTION provision_default_client_measurement_profile();

-- Close the gap for clients inserted after the original signal-hub migration
-- but before automatic enrolment was installed. Existing profiles, including
-- explicit opt-outs, are deliberately left untouched.
INSERT INTO client_measurement_profiles (
  client_id,
  vertical,
  desired_enabled,
  desired_state_source
)
SELECT
  client.id,
  COALESCE(NULLIF(TRIM(client.industry), ''), 'general'),
  TRUE,
  'new_client_default'
FROM agency_clients client
ON CONFLICT (client_id) DO NOTHING;

COMMIT;
