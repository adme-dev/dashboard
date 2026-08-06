-- 349_god_mode_audit_identity_guard_reconciliation.sql
-- DEPLOY ORDER (required): deploy the application before this migration. The
-- application identity fix and banner upload/project terminal tests must pass first.
-- Applying this guard while older application code still rewrites terminal
-- entity_type/entity_id would fail closed on those God mode mutations.
--
-- This migration is intentionally a forward reconciliation of a function that
-- drifted in production. It does not alter data or constraints and is safe to
-- re-run after the application gate has passed.

BEGIN;

CREATE OR REPLACE FUNCTION guard_god_mode_audit_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.correlation_id::TEXT, 0));

  IF NEW.phase = 'bypass' AND NOT EXISTS (
    SELECT 1
      FROM god_mode_audit_events attempt
     WHERE attempt.correlation_id = NEW.correlation_id
       AND attempt.phase = 'attempt'
       AND attempt.actor_user_id = NEW.actor_user_id
       AND attempt.session_digest = NEW.session_digest
       AND attempt.channel = NEW.channel
       AND attempt.route_or_tool = NEW.route_or_tool
       AND attempt.emergency_disabled = NEW.emergency_disabled
  ) THEN
    RAISE EXCEPTION 'bypass event requires matching attempt';
  END IF;

  IF NEW.phase IN ('ambiguous', 'succeeded', 'failed') AND NOT EXISTS (
    SELECT 1
      FROM god_mode_audit_events attempt
     WHERE attempt.correlation_id = NEW.correlation_id
       AND attempt.phase = 'attempt'
       AND attempt.actor_user_id = NEW.actor_user_id
       AND attempt.session_digest = NEW.session_digest
       AND attempt.channel = NEW.channel
       AND attempt.route_or_tool = NEW.route_or_tool
       AND attempt.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
       AND attempt.client_id IS NOT DISTINCT FROM NEW.client_id
       AND attempt.entity_type IS NOT DISTINCT FROM NEW.entity_type
       AND attempt.entity_id IS NOT DISTINCT FROM NEW.entity_id
       AND attempt.emergency_disabled = NEW.emergency_disabled
       AND god_mode_normalize_bypassed_controls(NEW.bypassed_controls) =
           god_mode_normalize_bypassed_controls(
             attempt.bypassed_controls || COALESCE((
               SELECT array_agg(bypassed_control.value)
                 FROM god_mode_audit_events bypass
                 CROSS JOIN LATERAL unnest(bypass.bypassed_controls) AS bypassed_control(value)
                WHERE bypass.correlation_id = attempt.correlation_id
                  AND bypass.phase = 'bypass'
             ), ARRAY[]::VARCHAR[])
           )
  ) THEN
    RAISE EXCEPTION 'outcome event requires matching attempt';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
