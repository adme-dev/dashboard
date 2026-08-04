-- Durable metadata required to reconcile Task 5 executions without ever repeating a mutation.
BEGIN;

ALTER TABLE god_mode_execution_ledger
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS route_or_tool VARCHAR(160),
  ADD COLUMN IF NOT EXISTS executor_class VARCHAR(32),
  ADD COLUMN IF NOT EXISTS session_digest VARCHAR(64),
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS client_id UUID;

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
    CHECK (session_digest ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS god_mode_execution_ledger_correlation_idx
  ON god_mode_execution_ledger (correlation_id);

COMMIT;
