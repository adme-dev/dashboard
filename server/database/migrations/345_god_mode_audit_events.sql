-- 345_god_mode_audit_events.sql
-- Immutable God mode evidence and mutable coordination state. Audit rows never
-- contain request content or identity assertions: only bounded identifiers and digests.

BEGIN;

CREATE OR REPLACE FUNCTION god_mode_bypassed_controls_are_allowed(controls VARCHAR[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM unnest(controls) AS bypassed_control(value)
     WHERE bypassed_control.value IS NULL
        OR bypassed_control.value NOT IN (
          'permission', 'feature_flag', 'release_policy', 'evaluation_policy',
          'personal_policy', 'budget', 'rate_limit', 'confirmation', 'mcp_scope',
          'mcp_suite_flag'
        )
  )
$$;

CREATE TABLE IF NOT EXISTS god_mode_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  correlation_id UUID NOT NULL,
  session_digest VARCHAR(64) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  route_or_tool VARCHAR(160) NOT NULL,
  phase VARCHAR(16) NOT NULL,
  tenant_id UUID,
  client_id UUID,
  entity_type VARCHAR(64),
  entity_id UUID,
  bypassed_controls VARCHAR(32)[] NOT NULL,
  outcome_code VARCHAR(64) NOT NULL,
  emergency_disabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT god_mode_audit_events_channel_check
    CHECK (channel IN ('application', 'mcp')),
  CONSTRAINT god_mode_audit_events_phase_check
    CHECK (phase IN ('attempt', 'succeeded', 'failed')),
  CONSTRAINT god_mode_audit_events_digest_check
    CHECK (session_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT god_mode_audit_events_route_or_tool_check
    CHECK (char_length(route_or_tool) BETWEEN 1 AND 160),
  CONSTRAINT god_mode_audit_events_entity_type_check
    CHECK (entity_type IS NULL OR char_length(entity_type) BETWEEN 1 AND 64),
  CONSTRAINT god_mode_audit_events_outcome_code_check
    CHECK (char_length(outcome_code) BETWEEN 1 AND 64),
  CONSTRAINT god_mode_audit_events_control_count_check
    CHECK (cardinality(bypassed_controls) BETWEEN 0 AND 24),
  CONSTRAINT god_mode_audit_events_controls_allowlist_check
    CHECK (god_mode_bypassed_controls_are_allowed(bypassed_controls))
);

CREATE UNIQUE INDEX IF NOT EXISTS god_mode_audit_events_one_attempt_per_correlation
  ON god_mode_audit_events (correlation_id)
  WHERE phase = 'attempt';

CREATE UNIQUE INDEX IF NOT EXISTS god_mode_audit_events_one_terminal_per_correlation
  ON god_mode_audit_events (correlation_id)
  WHERE phase IN ('succeeded', 'failed');

CREATE OR REPLACE FUNCTION prevent_god_mode_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'god mode audit events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_god_mode_audit_event_mutation ON god_mode_audit_events;
CREATE TRIGGER trg_prevent_god_mode_audit_event_mutation
  BEFORE UPDATE OR DELETE ON god_mode_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_god_mode_audit_event_mutation();

CREATE OR REPLACE FUNCTION guard_god_mode_audit_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- All phases acquire the same lock. Therefore, a terminal insert that races
  -- an attempt waits for that attempt to commit before checking its existence.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.correlation_id::TEXT, 0));

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

DROP TRIGGER IF EXISTS trg_guard_god_mode_audit_event_insert ON god_mode_audit_events;
CREATE TRIGGER trg_guard_god_mode_audit_event_insert
  BEFORE INSERT ON god_mode_audit_events
  FOR EACH ROW EXECUTE FUNCTION guard_god_mode_audit_event_insert();

CREATE TABLE IF NOT EXISTS god_mode_mcp_request_nonces (
  jti UUID PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT god_mode_mcp_request_nonces_expiry_check CHECK (expires_at > consumed_at)
);

CREATE INDEX IF NOT EXISTS god_mode_mcp_request_nonces_expiry_idx
  ON god_mode_mcp_request_nonces (expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_god_mode_mcp_request_nonces(limit_count INTEGER DEFAULT 256)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF limit_count IS NULL OR limit_count < 1 OR limit_count > 1000 THEN
    RAISE EXCEPTION 'nonce cleanup limit must be between 1 and 1000';
  END IF;

  WITH expired AS (
    SELECT jti
      FROM god_mode_mcp_request_nonces
     WHERE expires_at <= NOW()
     ORDER BY expires_at
     LIMIT limit_count
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM god_mode_mcp_request_nonces nonce
   USING expired
   WHERE nonce.jti = expired.jti;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION opportunistically_cleanup_god_mode_mcp_request_nonces()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM cleanup_expired_god_mode_mcp_request_nonces();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_god_mode_mcp_request_nonces ON god_mode_mcp_request_nonces;
CREATE TRIGGER trg_cleanup_god_mode_mcp_request_nonces
  AFTER INSERT ON god_mode_mcp_request_nonces
  FOR EACH STATEMENT EXECUTE FUNCTION opportunistically_cleanup_god_mode_mcp_request_nonces();

CREATE TABLE IF NOT EXISTS god_mode_execution_ledger (
  actor_user_id UUID NOT NULL,
  channel VARCHAR(16) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  state VARCHAR(16) NOT NULL,
  result_reference VARCHAR(128),
  result_digest VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_user_id, channel, idempotency_key),
  CONSTRAINT god_mode_execution_ledger_channel_check
    CHECK (channel IN ('application', 'mcp')),
  CONSTRAINT god_mode_execution_ledger_state_check
    CHECK (state IN ('in_progress', 'succeeded', 'failed', 'ambiguous')),
  CONSTRAINT god_mode_execution_ledger_key_check
    CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  CONSTRAINT god_mode_execution_ledger_reference_check
    CHECK (result_reference IS NULL OR char_length(result_reference) BETWEEN 1 AND 128),
  CONSTRAINT god_mode_execution_ledger_digest_check
    CHECK (result_digest IS NULL OR result_digest ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS god_mode_execution_ledger_state_idx
  ON god_mode_execution_ledger (state, updated_at)
  WHERE state IN ('in_progress', 'ambiguous');

COMMIT;
