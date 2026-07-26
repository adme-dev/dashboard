BEGIN;

-- Fixes a deadlock introduced in 298_persona_consent_suppression_control_plane.sql.
--
-- The original trigger gated the marketing-eligibility check on the EXPORT's
-- operation (export_operation <> 'sync'), not the MEMBER ROW's own operation.
-- Incremental syncs record both 'add' and 'remove' member rows under the same
-- 'sync'-type export (crm_persona_audience_exports.operation stays 'sync' even
-- when some of its members are being removed), so a 'remove' row — written
-- because a person withdrew consent or was suppressed — was still checked for
-- eligibility, failed by definition (that's *why* they're being removed), and
-- the INSERT raised. The export retried and failed identically every time:
-- consent withdrawal could never actually propagate to a live platform
-- audience. Only a dedicated full-teardown export (operation='remove' on the
-- export itself) happened to skip the check and work.
--
-- Fix: gate on the member row's own operation (NEW.operation), not the
-- export's. Removals must always be allowed through — a 'remove' row exists
-- because the member is no longer eligible, so blocking removal on
-- eligibility is a permanent deadlock, not a safety check.
CREATE OR REPLACE FUNCTION enforce_persona_export_member_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  export_provider TEXT;
  export_client_id UUID;
BEGIN
  SELECT export.provider, export.client_id
    INTO export_provider, export_client_id
    FROM crm_persona_audience_exports export
   WHERE export.id = NEW.export_id;

  IF export_provider IS NULL OR export_client_id IS DISTINCT FROM NEW.client_id THEN
    RAISE EXCEPTION 'Audience export is missing or belongs to another client';
  END IF;

  IF NEW.operation <> 'add' THEN
    RETURN NEW;
  END IF;

  IF NOT crm_persona_marketing_eligible(
    NEW.client_id,
    NEW.profile_id,
    NULL,
    export_provider
  ) THEN
    RAISE EXCEPTION 'Audience sync member is not currently marketing eligible';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
