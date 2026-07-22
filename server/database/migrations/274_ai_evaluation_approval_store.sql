-- Trusted, append-only pricing and cost approval artifacts for governed AI evaluations.
-- These records never execute a model; they only provide evidence to the admission guard.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_eval_model_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_provider TEXT NOT NULL CHECK (model_provider ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  model_id TEXT NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 240),
  input_usd_micros_per_million_tokens BIGINT NOT NULL
    CHECK (input_usd_micros_per_million_tokens BETWEEN 0 AND 1000000000000),
  output_usd_micros_per_million_tokens BIGINT NOT NULL
    CHECK (output_usd_micros_per_million_tokens BETWEEN 0 AND 1000000000000),
  source_digest TEXT NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (valid_until > valid_from),
  UNIQUE (model_provider, model_id, source_digest)
);

CREATE TABLE IF NOT EXISTS ai_eval_model_rate_card_revocations (
  rate_card_id UUID PRIMARY KEY REFERENCES ai_eval_model_rate_cards(id) ON DELETE RESTRICT,
  revoked_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_eval_execution_plans (
  evaluation_run_id UUID PRIMARY KEY,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  plan_digest TEXT NOT NULL UNIQUE CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  rate_card_id UUID NOT NULL REFERENCES ai_eval_model_rate_cards(id) ON DELETE RESTRICT,
  estimated_upper_bound_usd_micros BIGINT NOT NULL
    CHECK (estimated_upper_bound_usd_micros BETWEEN 0 AND 10000000000),
  max_model_calls INTEGER NOT NULL CHECK (max_model_calls BETWEEN 1 AND 500),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evaluation_run_id, plan_digest, rate_card_id),
  FOREIGN KEY (evaluation_run_id, department_id)
    REFERENCES ai_eval_runs(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_eval_cost_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id UUID NOT NULL UNIQUE,
  rate_card_id UUID NOT NULL,
  plan_digest TEXT NOT NULL UNIQUE CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  approved_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  max_spend_usd_micros BIGINT NOT NULL CHECK (max_spend_usd_micros BETWEEN 0 AND 10000000000),
  approved_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > approved_at),
  FOREIGN KEY (evaluation_run_id, plan_digest, rate_card_id)
    REFERENCES ai_eval_execution_plans(evaluation_run_id, plan_digest, rate_card_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_eval_cost_approval_revocations (
  approval_id UUID PRIMARY KEY REFERENCES ai_eval_cost_approvals(id) ON DELETE RESTRICT,
  revoked_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_eval_rate_cards_lookup
  ON ai_eval_model_rate_cards (model_provider, model_id, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_ai_eval_plans_department
  ON ai_eval_execution_plans (department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_eval_approvals_expiry
  ON ai_eval_cost_approvals (expires_at, approved_at DESC);

CREATE OR REPLACE FUNCTION prevent_ai_eval_approval_artifact_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AI evaluation pricing and approval artifacts are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_eval_rate_cards_append_only ON ai_eval_model_rate_cards;
CREATE TRIGGER trg_ai_eval_rate_cards_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON ai_eval_model_rate_cards
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_ai_eval_approval_artifact_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_rate_card_revocations_append_only ON ai_eval_model_rate_card_revocations;
CREATE TRIGGER trg_ai_eval_rate_card_revocations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON ai_eval_model_rate_card_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_ai_eval_approval_artifact_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_execution_plans_append_only ON ai_eval_execution_plans;
CREATE TRIGGER trg_ai_eval_execution_plans_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON ai_eval_execution_plans
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_ai_eval_approval_artifact_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_cost_approvals_append_only ON ai_eval_cost_approvals;
CREATE TRIGGER trg_ai_eval_cost_approvals_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON ai_eval_cost_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_ai_eval_approval_artifact_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_cost_approval_revocations_append_only ON ai_eval_cost_approval_revocations;
CREATE TRIGGER trg_ai_eval_cost_approval_revocations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON ai_eval_cost_approval_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_ai_eval_approval_artifact_mutation();

COMMENT ON TABLE ai_eval_model_rate_cards IS
  'Immutable model pricing evidence. Trust requires an exact row with no revocation artifact.';
COMMENT ON TABLE ai_eval_execution_plans IS
  'Immutable zero-call execution plans bound to one run, department, rate card and plan digest.';
COMMENT ON TABLE ai_eval_cost_approvals IS
  'Immutable human cost approvals. Presence does not execute or enqueue an evaluation.';

COMMIT;
