-- 264_monday_cutover_execution_runs.sql
-- Approval-gated, idempotent Monday -> Zero cutover execution and rollback evidence.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_monday_provenance
  ON tasks (monday_board_id, monday_item_id)
  WHERE monday_board_id IS NOT NULL AND monday_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS monday_cutover_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES monday_cutover_approval_artifacts(id) ON DELETE RESTRICT,
  source_board_id TEXT NOT NULL CHECK (
    char_length(source_board_id) BETWEEN 1 AND 30
    AND source_board_id ~ '^[0-9]+$'
  ),
  target_board_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  artifact_revision INTEGER NOT NULL CHECK (artifact_revision > 0),
  plan_fingerprint TEXT NOT NULL CHECK (
    char_length(plan_fingerprint) = 64
    AND plan_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  idempotency_key UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (
    status IN ('prepared', 'executing', 'completed', 'failed', 'rollback_pending', 'rolled_back')
  ),
  execute_reason TEXT NOT NULL CHECK (char_length(execute_reason) BETWEEN 10 AND 1000),
  executed_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_tasks INTEGER NOT NULL DEFAULT 0 CHECK (created_tasks >= 0),
  reused_tasks INTEGER NOT NULL DEFAULT 0 CHECK (reused_tasks >= 0),
  excluded_records INTEGER NOT NULL DEFAULT 0 CHECK (excluded_records >= 0),
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 100),
  rollback_reason TEXT CHECK (
    rollback_reason IS NULL OR char_length(rollback_reason) BETWEEN 10 AND 1000
  ),
  rollback_by UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  rollback_started_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  UNIQUE (source_board_id, target_board_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_monday_cutover_execution_active_artifact
  ON monday_cutover_execution_runs (artifact_id)
  WHERE status IN ('prepared', 'executing', 'completed', 'rollback_pending');

CREATE INDEX IF NOT EXISTS idx_monday_cutover_execution_runs_target
  ON monday_cutover_execution_runs (target_board_id, prepared_at DESC);

CREATE TABLE IF NOT EXISTS monday_cutover_execution_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES monday_cutover_execution_runs(id) ON DELETE RESTRICT,
  source_item_id TEXT NOT NULL CHECK (
    char_length(source_item_id) BETWEEN 1 AND 30
    AND source_item_id ~ '^[0-9]+$'
  ),
  source_parent_item_id TEXT CHECK (
    source_parent_item_id IS NULL
    OR (
      char_length(source_parent_item_id) BETWEEN 1 AND 30
      AND source_parent_item_id ~ '^[0-9]+$'
    )
  ),
  action TEXT NOT NULL CHECK (action IN ('created', 'reused', 'excluded')),
  task_id UUID,
  mapping_id UUID,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  created_task_version INTEGER CHECK (created_task_version IS NULL OR created_task_version > 0),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_monday_cutover_execution_items_task
  ON monday_cutover_execution_items (task_id)
  WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS monday_cutover_execution_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES monday_cutover_execution_runs(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (
    action IN ('prepared', 'executed', 'failed', 'rollback_started', 'rolled_back')
  ),
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason_hash TEXT NOT NULL CHECK (
    char_length(reason_hash) = 64
    AND reason_hash ~ '^[a-f0-9]{64}$'
  ),
  plan_fingerprint TEXT NOT NULL CHECK (
    char_length(plan_fingerprint) = 64
    AND plan_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  counts JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monday_cutover_execution_audit_run
  ON monday_cutover_execution_audit (run_id, created_at);

CREATE OR REPLACE FUNCTION prevent_monday_cutover_execution_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Monday cutover execution audit is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monday_cutover_execution_audit_append_only
  ON monday_cutover_execution_audit;
CREATE TRIGGER trg_monday_cutover_execution_audit_append_only
  BEFORE UPDATE OR DELETE ON monday_cutover_execution_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_monday_cutover_execution_audit_mutation();

COMMENT ON TABLE monday_cutover_execution_runs IS
  'Approval-bound, idempotent execution and rollback lifecycle for an exact Monday source and Zero target board.';
COMMENT ON TABLE monday_cutover_execution_items IS
  'Per-source execution evidence containing only provenance, outcome IDs and approved client linkage; no raw Monday column payloads.';
COMMENT ON TABLE monday_cutover_execution_audit IS
  'Append-only hashes and counts for cutover execution and rollback actions.';

COMMIT;
