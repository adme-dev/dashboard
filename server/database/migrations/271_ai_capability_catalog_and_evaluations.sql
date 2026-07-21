-- Governed AI Assistant capability catalog and evaluation evidence foundation.
-- Additive and dormant: this migration creates no active packs, grants no permission, and changes no runtime routing.

CREATE OR REPLACE FUNCTION ai_governance_jsonb_node_count(p_value JSONB)
RETURNS BIGINT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
WITH RECURSIVE nodes(value) AS (
  VALUES (p_value)
  UNION ALL
  SELECT child.value
  FROM nodes AS parent
  CROSS JOIN LATERAL (
    SELECT value
    FROM jsonb_each(
      CASE WHEN jsonb_typeof(parent.value) = 'object' THEN parent.value ELSE '{}'::jsonb END
    )
    UNION ALL
    SELECT value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(parent.value) = 'array' THEN parent.value ELSE '[]'::jsonb END
    )
  ) AS child
)
SELECT count(*)
FROM (SELECT 1 FROM nodes LIMIT 5001) AS bounded_nodes;
$$;

CREATE OR REPLACE FUNCTION ai_governance_jsonb_has_forbidden_key(
  p_value JSONB,
  p_depth INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key TEXT;
  v_child JSONB;
BEGIN
  IF p_depth > 12 THEN
    RETURN TRUE;
  END IF;

  IF jsonb_typeof(p_value) = 'object' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(p_value)) > 500 THEN
      RETURN TRUE;
    END IF;

    FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
    LOOP
      IF regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g') = ANY (ARRAY[
        regexp_replace('access_token', '[^a-z0-9]', '', 'g'),
        regexp_replace('refresh_token', '[^a-z0-9]', '', 'g'),
        regexp_replace('api_key', '[^a-z0-9]', '', 'g'),
        regexp_replace('secret', '[^a-z0-9]', '', 'g'),
        regexp_replace('password', '[^a-z0-9]', '', 'g'),
        regexp_replace('email', '[^a-z0-9]', '', 'g'),
        regexp_replace('phone', '[^a-z0-9]', '', 'g'),
        regexp_replace('full_name', '[^a-z0-9]', '', 'g'),
        regexp_replace('first_name', '[^a-z0-9]', '', 'g'),
        regexp_replace('last_name', '[^a-z0-9]', '', 'g'),
        regexp_replace('prototype', '[^a-z0-9]', '', 'g'),
        regexp_replace('constructor', '[^a-z0-9]', '', 'g'),
        regexp_replace('proto', '[^a-z0-9]', '', 'g')
      ]) OR ai_governance_jsonb_has_forbidden_key(v_child, p_depth + 1) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    IF jsonb_array_length(p_value) > 500 THEN
      RETURN TRUE;
    END IF;

    FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
    LOOP
      IF ai_governance_jsonb_has_forbidden_key(v_child, p_depth + 1) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'string' AND octet_length(p_value #>> '{}') > 20000 THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE TABLE IF NOT EXISTS ai_eval_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  suite_key TEXT NOT NULL CHECK (suite_key ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, suite_key),
  UNIQUE (id, department_id),
  FOREIGN KEY (department_id, owner_user_id)
    REFERENCES department_members(department_id, team_member_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_capability_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  pack_key TEXT NOT NULL CHECK (pack_key ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, pack_key),
  UNIQUE (id, department_id),
  FOREIGN KEY (department_id, owner_user_id)
    REFERENCES department_members(department_id, team_member_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  capability_key TEXT NOT NULL CHECK (capability_key ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, capability_key),
  UNIQUE (id, department_id),
  FOREIGN KEY (department_id, owner_user_id)
    REFERENCES department_members(department_id, team_member_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_capability_pack_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL,
  department_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  instructions_preamble TEXT NOT NULL DEFAULT '',
  model_feature_key TEXT NOT NULL CHECK (model_feature_key ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  evaluation_suite_id UUID NOT NULL,
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens > 0 AND max_input_tokens <= 1000000),
  max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens > 0 AND max_output_tokens <= 1000000),
  max_cost_usd_micros BIGINT NOT NULL CHECK (max_cost_usd_micros >= 0 AND max_cost_usd_micros <= 1000000000),
  max_latency_ms INTEGER NOT NULL CHECK (max_latency_ms > 0 AND max_latency_ms <= 900000),
  material_version_digest TEXT NOT NULL CHECK (material_version_digest ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, version),
  UNIQUE (id, department_id),
  UNIQUE (id, pack_id, department_id),
  FOREIGN KEY (pack_id, department_id)
    REFERENCES ai_capability_packs(id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (evaluation_suite_id, department_id)
    REFERENCES ai_eval_suites(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_capability_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id UUID NOT NULL,
  department_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
  required_permission_group TEXT NOT NULL CHECK (required_permission_group IN (
    'ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE', 'SALES', 'CLIENTS',
    'CREATIVE', 'MEDIA_BUYING', 'TIME_APPROVALS', 'AUTOMATION', 'INVOICE_OWN_CLIENTS'
  )),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('low', 'medium', 'high', 'critical')),
  data_class TEXT NOT NULL CHECK (data_class IN ('public', 'internal', 'confidential', 'restricted')),
  approval_mode TEXT NOT NULL CHECK (approval_mode IN ('none', 'confirm', 'rich_confirm', 'company_governed')),
  model_feature_key TEXT NOT NULL CHECK (model_feature_key ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  evaluation_suite_id UUID NOT NULL,
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens > 0 AND max_input_tokens <= 1000000),
  max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens > 0 AND max_output_tokens <= 1000000),
  max_cost_usd_micros BIGINT NOT NULL CHECK (max_cost_usd_micros >= 0 AND max_cost_usd_micros <= 1000000000),
  max_latency_ms INTEGER NOT NULL CHECK (max_latency_ms > 0 AND max_latency_ms <= 900000),
  material_version_digest TEXT NOT NULL CHECK (material_version_digest ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capability_id, version),
  UNIQUE (id, department_id),
  UNIQUE (id, capability_id, department_id),
  FOREIGN KEY (capability_id, department_id)
    REFERENCES ai_capabilities(id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (evaluation_suite_id, department_id)
    REFERENCES ai_eval_suites(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_capability_tool_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_version_id UUID NOT NULL REFERENCES ai_capability_versions(id) ON DELETE RESTRICT,
  tool_name TEXT NOT NULL CHECK (tool_name ~ '^[a-z][a-z0-9_]{1,119}$'),
  access_mode TEXT NOT NULL CHECK (access_mode IN ('read', 'draft', 'propose')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capability_version_id, tool_name)
);

CREATE TABLE IF NOT EXISTS ai_pack_version_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_version_id UUID NOT NULL,
  capability_version_id UUID NOT NULL,
  department_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_version_id, capability_version_id),
  FOREIGN KEY (pack_version_id, department_id)
    REFERENCES ai_capability_pack_versions(id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (capability_version_id, department_id)
    REFERENCES ai_capability_versions(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_eval_suite_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_suite_id UUID NOT NULL,
  department_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  case_manifest_digest TEXT NOT NULL CHECK (case_manifest_digest ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (eval_suite_id, version),
  UNIQUE (id, department_id),
  FOREIGN KEY (eval_suite_id, department_id)
    REFERENCES ai_eval_suites(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_eval_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_suite_version_id UUID NOT NULL,
  department_id UUID NOT NULL,
  case_key TEXT NOT NULL CHECK (case_key ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  scope_fixture JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope_fixture) = 'object'),
  expected_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expected_no_tool BOOLEAN NOT NULL DEFAULT FALSE,
  required_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  prohibited_effects TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  zero_tolerance TEXT[] NOT NULL CHECK (
    cardinality(zero_tolerance) > 0
    AND zero_tolerance <@ ARRAY['scope', 'prohibited_effect', 'approval_bypass']::TEXT[]
  ),
  scoring_rubric JSONB NOT NULL CHECK (jsonb_typeof(scoring_rubric) = 'array'),
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (eval_suite_version_id, case_key, case_version),
  UNIQUE (id, department_id),
  CHECK (NOT (expected_no_tool AND cardinality(expected_tools) > 0)),
  CHECK (input ? 'prompt' AND jsonb_typeof(input -> 'prompt') = 'string'),
  CHECK (char_length(btrim(input ->> 'prompt')) BETWEEN 1 AND 20000),
  CHECK (cardinality(expected_tools) <= 64),
  CHECK (cardinality(required_sources) <= 64),
  CHECK (cardinality(prohibited_effects) <= 64),
  CHECK (cardinality(zero_tolerance) <= 3),
  CHECK (jsonb_array_length(scoring_rubric) BETWEEN 1 AND 32),
  CHECK (octet_length(input::text) <= 1000000),
  CHECK (octet_length(scope_fixture::text) <= 1000000),
  CHECK (octet_length(scoring_rubric::text) <= 1000000),
  CHECK (ai_governance_jsonb_node_count(input) <= 5000),
  CHECK (ai_governance_jsonb_node_count(scope_fixture) <= 5000),
  CHECK (ai_governance_jsonb_node_count(scoring_rubric) <= 5000),
  CHECK (NOT ai_governance_jsonb_has_forbidden_key(input)),
  CHECK (NOT ai_governance_jsonb_has_forbidden_key(scope_fixture)),
  CHECK (NOT ai_governance_jsonb_has_forbidden_key(scoring_rubric)),
  FOREIGN KEY (eval_suite_version_id, department_id)
    REFERENCES ai_eval_suite_versions(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  eval_suite_version_id UUID NOT NULL,
  pack_version_id UUID,
  capability_version_id UUID,
  model_provider TEXT NOT NULL CHECK (model_provider ~ '^[a-z][a-z0-9_:-]{1,119}$'),
  model_id TEXT NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 240),
  prompt_version_digest TEXT NOT NULL CHECK (prompt_version_digest ~ '^[a-f0-9]{64}$'),
  toolset_version_digest TEXT NOT NULL CHECK (toolset_version_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  gate_passed BOOLEAN,
  case_count INTEGER NOT NULL DEFAULT 0 CHECK (case_count >= 0),
  passed_count INTEGER NOT NULL DEFAULT 0 CHECK (passed_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  human_review_count INTEGER NOT NULL DEFAULT 0 CHECK (human_review_count >= 0),
  total_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (total_input_tokens >= 0),
  total_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (total_output_tokens >= 0),
  total_cost_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (total_cost_usd_micros >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, department_id),
  UNIQUE (id, pack_version_id, department_id),
  UNIQUE (id, capability_version_id, department_id),
  UNIQUE (id, pack_version_id, department_id, gate_passed, status),
  UNIQUE (id, capability_version_id, department_id, gate_passed, status),
  CHECK (pack_version_id IS NOT NULL OR capability_version_id IS NOT NULL),
  CHECK (
    (status = 'completed' AND gate_passed IS NOT NULL AND completed_at IS NOT NULL)
    OR (status IN ('failed', 'cancelled') AND gate_passed IS NULL AND completed_at IS NOT NULL)
    OR (status IN ('queued', 'running') AND gate_passed IS NULL AND completed_at IS NULL)
  ),
  FOREIGN KEY (eval_suite_version_id, department_id)
    REFERENCES ai_eval_suite_versions(id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (pack_version_id, department_id)
    REFERENCES ai_capability_pack_versions(id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (capability_version_id, department_id)
    REFERENCES ai_capability_versions(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_eval_case_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_run_id UUID NOT NULL,
  eval_case_id UUID NOT NULL,
  department_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'error', 'human_review')),
  score NUMERIC(7, 6) CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  deterministic_checks JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(deterministic_checks) = 'object'),
  observed_tools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  prohibited_effects_observed TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  trace_ref TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (cost_usd_micros >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (eval_run_id, eval_case_id),
  CHECK (cardinality(observed_tools) <= 64),
  CHECK (cardinality(source_refs) <= 128),
  CHECK (cardinality(prohibited_effects_observed) <= 64),
  CHECK (trace_ref IS NULL OR char_length(trace_ref) <= 500),
  CHECK (octet_length(deterministic_checks::text) <= 1000000),
  CHECK (ai_governance_jsonb_node_count(deterministic_checks) <= 5000),
  CHECK (NOT ai_governance_jsonb_has_forbidden_key(deterministic_checks)),
  FOREIGN KEY (eval_run_id, department_id)
    REFERENCES ai_eval_runs(id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (eval_case_id, department_id)
    REFERENCES ai_eval_cases(id, department_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_capability_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id UUID NOT NULL,
  capability_version_id UUID NOT NULL,
  department_id UUID NOT NULL,
  release_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (release_state IN ('draft', 'pilot', 'active', 'suspended', 'retired')),
  evaluation_run_id UUID,
  evaluation_gate_passed BOOLEAN,
  evaluation_run_status TEXT CHECK (evaluation_run_status IS NULL OR evaluation_run_status = 'completed'),
  change_reason TEXT NOT NULL CHECK (char_length(change_reason) BETWEEN 1 AND 2000),
  changed_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capability_version_id),
  CHECK (
    (evaluation_run_id IS NULL AND evaluation_gate_passed IS NULL AND evaluation_run_status IS NULL)
    OR (evaluation_run_id IS NOT NULL AND evaluation_gate_passed IS NOT NULL AND evaluation_run_status = 'completed')
  ),
  CHECK (
    release_state NOT IN ('pilot', 'active')
    OR (evaluation_run_id IS NOT NULL AND evaluation_gate_passed = TRUE AND evaluation_run_status = 'completed')
  ),
  FOREIGN KEY (capability_version_id, capability_id, department_id)
    REFERENCES ai_capability_versions(id, capability_id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (evaluation_run_id, capability_version_id, department_id, evaluation_gate_passed, evaluation_run_status)
  REFERENCES ai_eval_runs(
    id, capability_version_id, department_id, gate_passed, status
  ) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_pack_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL,
  pack_version_id UUID NOT NULL,
  department_id UUID NOT NULL,
  release_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (release_state IN ('draft', 'pilot', 'active', 'suspended', 'retired')),
  evaluation_run_id UUID,
  evaluation_gate_passed BOOLEAN,
  evaluation_run_status TEXT CHECK (evaluation_run_status IS NULL OR evaluation_run_status = 'completed'),
  change_reason TEXT NOT NULL CHECK (char_length(change_reason) BETWEEN 1 AND 2000),
  changed_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_version_id),
  CHECK (
    (evaluation_run_id IS NULL AND evaluation_gate_passed IS NULL AND evaluation_run_status IS NULL)
    OR (evaluation_run_id IS NOT NULL AND evaluation_gate_passed IS NOT NULL AND evaluation_run_status = 'completed')
  ),
  CHECK (
    release_state NOT IN ('pilot', 'active')
    OR (evaluation_run_id IS NOT NULL AND evaluation_gate_passed = TRUE AND evaluation_run_status = 'completed')
  ),
  FOREIGN KEY (pack_version_id, pack_id, department_id)
    REFERENCES ai_capability_pack_versions(id, pack_id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (evaluation_run_id, pack_version_id, department_id, evaluation_gate_passed, evaluation_run_status)
  REFERENCES ai_eval_runs(
    id, pack_version_id, department_id, gate_passed, status
  ) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ai_catalog_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('pack', 'capability', 'eval_suite')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'created', 'owner_changed', 'versioned', 'pilot', 'activated', 'suspended', 'retired'
  )),
  previous_version_id UUID,
  next_version_id UUID,
  evaluation_run_id UUID,
  actor_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (octet_length(details::text) <= 1000000),
  CHECK (ai_governance_jsonb_node_count(details) <= 5000),
  CHECK (NOT ai_governance_jsonb_has_forbidden_key(details)),
  FOREIGN KEY (evaluation_run_id, department_id)
    REFERENCES ai_eval_runs(id, department_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_capability_releases_one_active
  ON ai_capability_releases(capability_id)
  WHERE release_state = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_pack_releases_one_active
  ON ai_pack_releases(pack_id)
  WHERE release_state = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_capability_packs_department ON ai_capability_packs(department_id, pack_key);
CREATE INDEX IF NOT EXISTS idx_ai_capabilities_department ON ai_capabilities(department_id, capability_key);
CREATE INDEX IF NOT EXISTS idx_ai_eval_suites_department ON ai_eval_suites(department_id, suite_key);
CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_material ON ai_eval_runs(department_id, eval_suite_version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_gate ON ai_eval_runs(department_id, gate_passed, completed_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_ai_eval_case_results_run ON ai_eval_case_results(eval_run_id, outcome);
CREATE INDEX IF NOT EXISTS idx_ai_capability_releases_state ON ai_capability_releases(department_id, release_state);
CREATE INDEX IF NOT EXISTS idx_ai_pack_releases_state ON ai_pack_releases(department_id, release_state);
CREATE INDEX IF NOT EXISTS idx_ai_catalog_audit_entity ON ai_catalog_audit_events(entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_ai_governance_immutable_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable; create a new version or evidence record', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION protect_ai_eval_run_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_case_count INTEGER;
  v_result_count INTEGER;
  v_passed_count INTEGER;
  v_failed_count INTEGER;
  v_human_review_count INTEGER;
  v_total_input_tokens BIGINT;
  v_total_output_tokens BIGINT;
  v_total_cost_usd_micros BIGINT;
  v_actual_eval_suite_id UUID;
  v_capability_eval_suite_id UUID;
  v_pack_eval_suite_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AI evaluation runs are append-only evidence'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('queued', 'running') THEN
      RAISE EXCEPTION 'AI evaluation runs must start queued or running'
        USING ERRCODE = '55000';
    END IF;

    SELECT eval_suite_id
      INTO v_actual_eval_suite_id
      FROM ai_eval_suite_versions
      WHERE id = NEW.eval_suite_version_id AND department_id = NEW.department_id;

    IF NEW.capability_version_id IS NOT NULL THEN
      SELECT evaluation_suite_id
        INTO v_capability_eval_suite_id
        FROM ai_capability_versions
        WHERE id = NEW.capability_version_id AND department_id = NEW.department_id;
    END IF;

    IF NEW.pack_version_id IS NOT NULL THEN
      SELECT evaluation_suite_id
        INTO v_pack_eval_suite_id
        FROM ai_capability_pack_versions
        WHERE id = NEW.pack_version_id AND department_id = NEW.department_id;
    END IF;

    IF (v_capability_eval_suite_id IS NOT NULL AND v_capability_eval_suite_id IS DISTINCT FROM v_actual_eval_suite_id)
      OR (v_pack_eval_suite_id IS NOT NULL AND v_pack_eval_suite_id IS DISTINCT FROM v_actual_eval_suite_id) THEN
      RAISE EXCEPTION 'AI evaluation run suite must match every bound material version'
        USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'terminal AI evaluation runs are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.department_id IS DISTINCT FROM OLD.department_id
    OR NEW.eval_suite_version_id IS DISTINCT FROM OLD.eval_suite_version_id
    OR NEW.pack_version_id IS DISTINCT FROM OLD.pack_version_id
    OR NEW.capability_version_id IS DISTINCT FROM OLD.capability_version_id
    OR NEW.model_provider IS DISTINCT FROM OLD.model_provider
    OR NEW.model_id IS DISTINCT FROM OLD.model_id
    OR NEW.prompt_version_digest IS DISTINCT FROM OLD.prompt_version_digest
    OR NEW.toolset_version_digest IS DISTINCT FROM OLD.toolset_version_digest
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'AI evaluation run material identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF (OLD.status = 'queued' AND NEW.status NOT IN ('queued', 'running', 'cancelled'))
    OR (OLD.status = 'running' AND NEW.status NOT IN ('running', 'completed', 'failed', 'cancelled')) THEN
    RAISE EXCEPTION 'invalid AI evaluation run status transition from % to %', OLD.status, NEW.status
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'completed' THEN
    SELECT count(*)
      INTO v_expected_case_count
      FROM ai_eval_cases
      WHERE eval_suite_version_id = NEW.eval_suite_version_id;

    SELECT
      count(*),
      count(*) FILTER (WHERE outcome = 'pass'),
      count(*) FILTER (WHERE outcome IN ('fail', 'error')),
      count(*) FILTER (WHERE outcome = 'human_review'),
      coalesce(sum(input_tokens), 0),
      coalesce(sum(output_tokens), 0),
      coalesce(sum(cost_usd_micros), 0)
      INTO v_result_count, v_passed_count, v_failed_count, v_human_review_count,
        v_total_input_tokens, v_total_output_tokens, v_total_cost_usd_micros
      FROM ai_eval_case_results
      WHERE eval_run_id = NEW.id;

    IF v_expected_case_count = 0
      OR v_result_count <> v_expected_case_count
      OR NEW.case_count <> v_result_count
      OR NEW.passed_count <> v_passed_count
      OR NEW.failed_count <> v_failed_count
      OR NEW.human_review_count <> v_human_review_count
      OR NEW.total_input_tokens <> v_total_input_tokens
      OR NEW.total_output_tokens <> v_total_output_tokens
      OR NEW.total_cost_usd_micros <> v_total_cost_usd_micros THEN
      RAISE EXCEPTION 'completed AI evaluation counts must match the sealed suite and case results'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_ai_eval_result_outside_running()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_status TEXT;
  v_run_suite_version_id UUID;
  v_case_suite_version_id UUID;
BEGIN
  SELECT status, eval_suite_version_id
    INTO v_run_status, v_run_suite_version_id
    FROM ai_eval_runs
    WHERE id = NEW.eval_run_id AND department_id = NEW.department_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_run_status <> 'running' THEN
    RAISE EXCEPTION 'AI evaluation results may only be added while the run is running'
      USING ERRCODE = '55000';
  END IF;

  SELECT eval_suite_version_id
    INTO v_case_suite_version_id
    FROM ai_eval_cases
    WHERE id = NEW.eval_case_id AND department_id = NEW.department_id;

  IF FOUND AND v_case_suite_version_id IS DISTINCT FROM v_run_suite_version_id THEN
    RAISE EXCEPTION 'AI evaluation result case must belong to the run suite version'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_ai_capability_binding_after_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ai_eval_runs WHERE capability_version_id = NEW.capability_version_id
    UNION ALL
    SELECT 1 FROM ai_capability_releases WHERE capability_version_id = NEW.capability_version_id
  ) THEN
    RAISE EXCEPTION 'capability bindings are sealed after evaluation or release evidence exists'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_ai_pack_binding_after_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ai_eval_runs WHERE pack_version_id = NEW.pack_version_id
    UNION ALL
    SELECT 1 FROM ai_pack_releases WHERE pack_version_id = NEW.pack_version_id
  ) THEN
    RAISE EXCEPTION 'pack composition is sealed after evaluation or release evidence exists'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_ai_eval_case_after_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ai_eval_runs WHERE eval_suite_version_id = NEW.eval_suite_version_id
  ) THEN
    RAISE EXCEPTION 'evaluation cases are sealed after a run exists'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_capability_pack_versions_immutable ON ai_capability_pack_versions;
CREATE TRIGGER trg_ai_capability_pack_versions_immutable
  BEFORE UPDATE OR DELETE ON ai_capability_pack_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_capability_versions_immutable ON ai_capability_versions;
CREATE TRIGGER trg_ai_capability_versions_immutable
  BEFORE UPDATE OR DELETE ON ai_capability_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_capability_tool_bindings_immutable ON ai_capability_tool_bindings;
CREATE TRIGGER trg_ai_capability_tool_bindings_immutable
  BEFORE UPDATE OR DELETE ON ai_capability_tool_bindings
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_pack_version_capabilities_immutable ON ai_pack_version_capabilities;
CREATE TRIGGER trg_ai_pack_version_capabilities_immutable
  BEFORE UPDATE OR DELETE ON ai_pack_version_capabilities
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_suite_versions_immutable ON ai_eval_suite_versions;
CREATE TRIGGER trg_ai_eval_suite_versions_immutable
  BEFORE UPDATE OR DELETE ON ai_eval_suite_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_cases_immutable ON ai_eval_cases;
CREATE TRIGGER trg_ai_eval_cases_immutable
  BEFORE UPDATE OR DELETE ON ai_eval_cases
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_case_results_immutable ON ai_eval_case_results;
CREATE TRIGGER trg_ai_eval_case_results_immutable
  BEFORE UPDATE OR DELETE ON ai_eval_case_results
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_catalog_audit_events_immutable ON ai_catalog_audit_events;
CREATE TRIGGER trg_ai_catalog_audit_events_immutable
  BEFORE UPDATE OR DELETE ON ai_catalog_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_governance_immutable_mutation();

DROP TRIGGER IF EXISTS trg_ai_eval_runs_evidence_guard ON ai_eval_runs;
CREATE TRIGGER trg_ai_eval_runs_evidence_guard
  BEFORE INSERT OR UPDATE OR DELETE ON ai_eval_runs
  FOR EACH ROW EXECUTE FUNCTION protect_ai_eval_run_evidence();

DROP TRIGGER IF EXISTS trg_ai_eval_case_results_running_only ON ai_eval_case_results;
CREATE TRIGGER trg_ai_eval_case_results_running_only
  BEFORE INSERT ON ai_eval_case_results
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_eval_result_outside_running();

DROP TRIGGER IF EXISTS trg_ai_capability_tool_bindings_seal ON ai_capability_tool_bindings;
CREATE TRIGGER trg_ai_capability_tool_bindings_seal
  BEFORE INSERT ON ai_capability_tool_bindings
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_capability_binding_after_evidence();

DROP TRIGGER IF EXISTS trg_ai_pack_version_capabilities_seal ON ai_pack_version_capabilities;
CREATE TRIGGER trg_ai_pack_version_capabilities_seal
  BEFORE INSERT ON ai_pack_version_capabilities
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_pack_binding_after_evidence();

DROP TRIGGER IF EXISTS trg_ai_eval_cases_seal ON ai_eval_cases;
CREATE TRIGGER trg_ai_eval_cases_seal
  BEFORE INSERT ON ai_eval_cases
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_eval_case_after_run();
