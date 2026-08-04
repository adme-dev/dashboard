-- Durable metadata required to reconcile Task 5 executions without ever repeating a mutation.
BEGIN;

-- An ambiguous checkpoint is immutable evidence that dispatch may have committed, but it is not a
-- terminal: reconciliation may later append the one succeeded/failed terminal.
ALTER TABLE god_mode_audit_events
  DROP CONSTRAINT IF EXISTS god_mode_audit_events_phase_check;
ALTER TABLE god_mode_audit_events
  ADD CONSTRAINT god_mode_audit_events_phase_check
  CHECK (phase IN ('attempt', 'bypass', 'ambiguous', 'succeeded', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS god_mode_audit_events_one_ambiguous
  ON god_mode_audit_events (correlation_id)
  WHERE phase = 'ambiguous';

CREATE OR REPLACE FUNCTION guard_god_mode_audit_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.correlation_id::TEXT, 0));

  IF NEW.phase = 'bypass' AND NOT EXISTS (
    SELECT 1 FROM god_mode_audit_events
     WHERE correlation_id = NEW.correlation_id AND phase = 'attempt'
       AND actor_user_id = NEW.actor_user_id AND session_digest = NEW.session_digest
       AND channel = NEW.channel AND route_or_tool = NEW.route_or_tool
       AND emergency_disabled = NEW.emergency_disabled
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

CREATE TABLE IF NOT EXISTS ai_chat_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  transport_token_hash VARCHAR(64) NOT NULL,
  request_digest VARCHAR(64) NOT NULL,
  -- Reserved before the turn and inserted into ai_messages after history is loaded but before tools.
  user_message_id UUID NOT NULL,
  assistant_message_id UUID REFERENCES ai_messages(id) ON DELETE SET NULL,
  execution_mode VARCHAR(16) NOT NULL DEFAULT 'ordinary',
  state VARCHAR(16) NOT NULL DEFAULT 'processing',
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT ai_chat_submissions_token_digest_check
    CHECK (transport_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_chat_submissions_request_digest_check
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_chat_submissions_state_check
    CHECK (state IN ('processing', 'completed', 'failed')),
  CONSTRAINT ai_chat_submissions_execution_mode_check
    CHECK (execution_mode IN ('ordinary', 'god_mode')),
  CONSTRAINT ai_chat_submissions_response_size_check
    CHECK (response_payload IS NULL OR octet_length(response_payload::TEXT) <= 1048576),
  UNIQUE (actor_user_id, conversation_id, transport_token_hash)
);

CREATE TABLE IF NOT EXISTS god_mode_tool_call_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  tool_name VARCHAR(160) NOT NULL,
  args_digest VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT god_mode_tool_call_claims_ordinal_check CHECK (ordinal BETWEEN 0 AND 63),
  CONSTRAINT god_mode_tool_call_claims_tool_check CHECK (char_length(tool_name) BETWEEN 1 AND 160),
  CONSTRAINT god_mode_tool_call_claims_digest_check CHECK (args_digest ~ '^[0-9a-f]{64}$'),
  UNIQUE (message_id, ordinal)
);

ALTER TABLE ai_pending_actions
  ADD COLUMN IF NOT EXISTS god_mode_execution_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS god_mode_state VARCHAR(24);

ALTER TABLE ai_pending_actions
  DROP CONSTRAINT IF EXISTS ai_pending_actions_god_mode_state_check,
  ADD CONSTRAINT ai_pending_actions_god_mode_state_check CHECK (
    (source <> 'god_mode_preparation' AND god_mode_execution_key IS NULL AND god_mode_state IS NULL)
    OR (
      source = 'god_mode_preparation'
      AND char_length(god_mode_execution_key) BETWEEN 1 AND 128
      AND god_mode_state IN ('preparing', 'associated', 'consumed', 'completed', 'dismissed', 'ambiguous')
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS ai_pending_actions_one_god_mode_preparation
  ON ai_pending_actions (user_id, god_mode_execution_key)
  WHERE source = 'god_mode_preparation';

ALTER TABLE god_mode_execution_ledger
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS route_or_tool VARCHAR(160),
  ADD COLUMN IF NOT EXISTS executor_class VARCHAR(32),
  ADD COLUMN IF NOT EXISTS session_digest VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES ai_pending_actions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_phase VARCHAR(32) NOT NULL DEFAULT 'claimed',
  ADD COLUMN IF NOT EXISTS execution_metadata JSONB;

-- The table was introduced immediately before this migration. Defensive backfill keeps upgrades
-- safe if an environment admitted an early coordination row between the two deployments.
UPDATE god_mode_execution_ledger
   SET correlation_id = COALESCE(correlation_id, gen_random_uuid()),
       route_or_tool = COALESCE(route_or_tool, 'legacy_unknown'),
       executor_class = COALESCE(executor_class, 'internal-http'),
       session_digest = COALESCE(session_digest, repeat('0', 64));

ALTER TABLE god_mode_execution_ledger
  ALTER COLUMN correlation_id SET NOT NULL,
  ALTER COLUMN route_or_tool SET NOT NULL,
  ALTER COLUMN executor_class SET NOT NULL,
  ALTER COLUMN session_digest SET NOT NULL;

ALTER TABLE god_mode_execution_ledger
  DROP CONSTRAINT IF EXISTS god_mode_execution_ledger_route_check,
  ADD CONSTRAINT god_mode_execution_ledger_route_check
    CHECK (char_length(route_or_tool) BETWEEN 1 AND 160),
  DROP CONSTRAINT IF EXISTS god_mode_execution_ledger_executor_class_check,
  ADD CONSTRAINT god_mode_execution_ledger_executor_class_check
    CHECK (executor_class IN ('local-transactional', 'internal-http', 'external-provider')),
  DROP CONSTRAINT IF EXISTS god_mode_execution_ledger_session_digest_check,
  ADD CONSTRAINT god_mode_execution_ledger_session_digest_check
    CHECK (session_digest ~ '^[0-9a-f]{64}$'),
  DROP CONSTRAINT IF EXISTS god_mode_execution_ledger_phase_check,
  ADD CONSTRAINT god_mode_execution_ledger_phase_check
    CHECK (execution_phase IN ('claimed', 'proposal_prepared', 'task_created', 'dispatched', 'result_captured')),
  DROP CONSTRAINT IF EXISTS god_mode_execution_ledger_metadata_check,
  ADD CONSTRAINT god_mode_execution_ledger_metadata_check
    CHECK (execution_metadata IS NULL OR (
      jsonb_typeof(execution_metadata) = 'object'
      AND octet_length(execution_metadata::TEXT) <= 4096
    ));

CREATE UNIQUE INDEX IF NOT EXISTS god_mode_execution_ledger_correlation_idx
  ON god_mode_execution_ledger (correlation_id);

COMMIT;
