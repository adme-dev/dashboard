-- 389_god_mode_mcp_action_arguments.sql
-- Phase Two E-1: keep a bounded, redacted argument snapshot beside immutable MCP
-- Godmode action evidence. Reads retain the empty-object default.

BEGIN;

ALTER TABLE god_mode_audit_events
  ADD COLUMN IF NOT EXISTS action_arguments JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE god_mode_audit_events
  DROP CONSTRAINT IF EXISTS god_mode_audit_events_action_arguments_check;

ALTER TABLE god_mode_audit_events
  ADD CONSTRAINT god_mode_audit_events_action_arguments_check
  CHECK (
    jsonb_typeof(action_arguments) = 'object'
    AND octet_length(action_arguments::TEXT) <= 16384
  );

CREATE INDEX IF NOT EXISTS god_mode_audit_events_mcp_action_history_idx
  ON god_mode_audit_events (created_at DESC)
  WHERE channel = 'mcp'
    AND phase IN ('ambiguous', 'succeeded', 'failed')
    AND cardinality(bypassed_controls) > 0;

CREATE OR REPLACE FUNCTION guard_god_mode_audit_action_arguments_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.phase IN ('bypass', 'ambiguous', 'succeeded', 'failed') AND NOT EXISTS (
    SELECT 1
      FROM god_mode_audit_events attempt
     WHERE attempt.correlation_id = NEW.correlation_id
       AND attempt.phase = 'attempt'
       AND attempt.action_arguments = NEW.action_arguments
  ) THEN
    RAISE EXCEPTION 'outcome action arguments must match attempt';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_god_mode_audit_action_arguments_insert ON god_mode_audit_events;
CREATE TRIGGER trg_guard_god_mode_audit_action_arguments_insert
  BEFORE INSERT ON god_mode_audit_events
  FOR EACH ROW EXECUTE FUNCTION guard_god_mode_audit_action_arguments_insert();

COMMIT;
