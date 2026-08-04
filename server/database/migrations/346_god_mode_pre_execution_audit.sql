-- 346_god_mode_pre_execution_audit.sql
-- Durable, immutable evidence for the exact controls a trusted God mode route
-- bypasses. These rows are committed before provider/model/tool execution.

BEGIN;

CREATE OR REPLACE FUNCTION god_mode_normalize_bypassed_controls(controls VARCHAR[])
RETURNS VARCHAR[]
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT bypassed_control.value ORDER BY bypassed_control.value),
    ARRAY[]::VARCHAR[]
  )
    FROM unnest(controls) AS bypassed_control(value)
$$;

ALTER TABLE god_mode_audit_events
  DROP CONSTRAINT IF EXISTS god_mode_audit_events_phase_check;

ALTER TABLE god_mode_audit_events
  ADD CONSTRAINT god_mode_audit_events_phase_check
  CHECK (phase IN ('attempt', 'bypass', 'succeeded', 'failed'));

ALTER TABLE god_mode_audit_events
  DROP CONSTRAINT IF EXISTS god_mode_audit_events_bypass_shape_check;

ALTER TABLE god_mode_audit_events
  ADD CONSTRAINT god_mode_audit_events_bypass_shape_check
  CHECK (
    phase <> 'bypass'
    OR (
      cardinality(bypassed_controls) BETWEEN 1 AND 24
      AND outcome_code = 'pre_execution'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS god_mode_audit_events_one_bypass_control_set
  ON god_mode_audit_events (
    correlation_id,
    god_mode_normalize_bypassed_controls(bypassed_controls)
  )
  WHERE phase = 'bypass';

CREATE OR REPLACE FUNCTION guard_god_mode_audit_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Every phase shares the correlation lock, so evidence waits for a racing
  -- attempt to commit and terminal uniqueness remains serialized.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.correlation_id::TEXT, 0));

  IF NEW.phase = 'bypass' AND NOT EXISTS (
    SELECT 1
      FROM god_mode_audit_events
     WHERE correlation_id = NEW.correlation_id
       AND phase = 'attempt'
       AND actor_user_id = NEW.actor_user_id
       AND session_digest = NEW.session_digest
       AND channel = NEW.channel
       AND route_or_tool = NEW.route_or_tool
       AND emergency_disabled = NEW.emergency_disabled
  ) THEN
    RAISE EXCEPTION 'bypass event requires matching attempt';
  END IF;

  IF NEW.phase IN ('succeeded', 'failed') AND NOT EXISTS (
    SELECT 1
      FROM god_mode_audit_events
     WHERE correlation_id = NEW.correlation_id
       AND phase = 'attempt'
  ) THEN
    RAISE EXCEPTION 'terminal event requires matching attempt';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
