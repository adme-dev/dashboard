-- 263_monday_cutover_approval_artifacts.sql
-- Zero-owned, revisioned governance for an exact Monday board cutover.
-- Provider data remains read-only; approval never executes an import.

BEGIN;

CREATE TABLE IF NOT EXISTS monday_cutover_approval_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_board_id TEXT NOT NULL CHECK (
    char_length(source_board_id) BETWEEN 1 AND 30
    AND source_board_id ~ '^[0-9]+$'
  ),
  target_board_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'approved')),
  resolutions JSONB NOT NULL DEFAULT '{"clients":[],"columns":[]}'::jsonb CHECK (
    jsonb_typeof(resolutions) = 'object'
  ),
  plan_fingerprint TEXT NOT NULL CHECK (
    char_length(plan_fingerprint) = 64
    AND plan_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  approval_reason TEXT CHECK (
    approval_reason IS NULL OR char_length(approval_reason) BETWEEN 10 AND 1000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  UNIQUE (source_board_id, target_board_id),
  CHECK (
    (
      state = 'draft'
      AND approved_by IS NULL
      AND approval_reason IS NULL
      AND approved_at IS NULL
    )
    OR (
      state = 'approved'
      AND approved_by IS NOT NULL
      AND approval_reason IS NOT NULL
      AND approved_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_monday_cutover_approval_artifacts_state
  ON monday_cutover_approval_artifacts (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS monday_cutover_approval_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES monday_cutover_approval_artifacts(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  action TEXT NOT NULL CHECK (action IN ('saved', 'approved')),
  actor_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  resolution_hash TEXT NOT NULL CHECK (
    char_length(resolution_hash) = 64
    AND resolution_hash ~ '^[a-f0-9]{64}$'
  ),
  plan_fingerprint TEXT NOT NULL CHECK (
    char_length(plan_fingerprint) = 64
    AND plan_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artifact_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_monday_cutover_approval_audit_artifact
  ON monday_cutover_approval_audit (artifact_id, revision DESC);

CREATE OR REPLACE FUNCTION prevent_monday_cutover_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Monday cutover approval audit is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monday_cutover_approval_audit_append_only
  ON monday_cutover_approval_audit;
CREATE TRIGGER trg_monday_cutover_approval_audit_append_only
  BEFORE UPDATE OR DELETE ON monday_cutover_approval_audit
  FOR EACH ROW EXECUTE FUNCTION prevent_monday_cutover_audit_mutation();

COMMENT ON TABLE monday_cutover_approval_artifacts IS
  'Canonical Zero-owned draft or approved mapping decisions for one exact Monday source and Zero target board; approval does not execute cutover.';
COMMENT ON TABLE monday_cutover_approval_audit IS
  'Append-only hashes binding each saved or approved revision to its exact plan evidence without duplicating raw decision reasons.';

COMMIT;
