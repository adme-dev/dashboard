BEGIN;

-- 350_crm_search_expand.sql
-- Enterprise CRM hybrid-search expand phase.
--
-- This migration is deliberately provider-dormant. It creates the durable
-- search domain and pure projection functions, but installs no CRM source
-- capture triggers. Migration 351 seeds/validates the fixed installation
-- contract; migration 352 installs capture last.

ALTER TABLE crm_people
  ADD COLUMN IF NOT EXISTS search_revision BIGINT NOT NULL DEFAULT 0
    CHECK (search_revision >= 0);

ALTER TABLE crm_companies
  ADD COLUMN IF NOT EXISTS search_revision BIGINT NOT NULL DEFAULT 0
    CHECK (search_revision >= 0);

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS search_revision BIGINT NOT NULL DEFAULT 0
    CHECK (search_revision >= 0);

-- Cluster roles are deliberately NOLOGIN. Deploy automation temporarily assumes
-- the governor role so application logins can receive only the runtime surface.
DO $$
DECLARE
  v_schema TEXT := pg_catalog.current_schema();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'crm_search_governor') THEN
    CREATE ROLE crm_search_governor
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'crm_search_governor'
      AND (
        rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'existing crm_search_governor role is unsafe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'crm_search_runtime') THEN
    CREATE ROLE crm_search_runtime
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'crm_search_runtime'
      AND (
        rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION 'existing crm_search_runtime role is unsafe';
  END IF;

  EXECUTE pg_catalog.format('GRANT crm_search_governor TO %I', SESSION_USER);
  EXECUTE pg_catalog.format('GRANT USAGE, CREATE ON SCHEMA %I TO crm_search_governor', v_schema);
  EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA %I TO crm_search_runtime', v_schema);
END;
$$;

GRANT SELECT ON TABLE crm_people, crm_companies, crm_opportunities
TO crm_search_governor;

SET LOCAL ROLE crm_search_governor;

CREATE OR REPLACE FUNCTION crm_search_normalize_text(
  p_value TEXT,
  p_max_code_points INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF p_max_code_points IS NULL OR p_max_code_points < 1 OR p_max_code_points > 1000 THEN
    RAISE EXCEPTION 'CRM search normalization bound must be between 1 and 1000';
  END IF;

  normalized := pg_catalog.normalize(COALESCE(p_value, ''), 'NFKC');
  -- Preserve word boundaries for ordinary whitespace before stripping all
  -- remaining C0/C1 and bidi-override/isolate controls.
  normalized := pg_catalog.regexp_replace(normalized, '[[:space:]]+', ' ', 'g');
  normalized := pg_catalog.regexp_replace(
    normalized,
    U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F\202A-\202E\2066-\2069]',
    '',
    'g'
  );
  normalized := pg_catalog.btrim(
    pg_catalog.regexp_replace(normalized, '[[:space:]]+', ' ', 'g')
  );
  RETURN pg_catalog.left(normalized, p_max_code_points);
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_projection_hash(p_canonical_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p_canonical_text, ''), 'UTF8')),
    'hex'
  )
$$;

CREATE OR REPLACE FUNCTION crm_search_person_projection_v1(
  p_first_name TEXT,
  p_last_name TEXT,
  p_job_title TEXT,
  p_department TEXT,
  p_lifecycle_stage TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.left(
    pg_catalog.concat_ws(
      E'\n',
      CASE WHEN first_name <> '' THEN 'First name: ' || first_name END,
      CASE WHEN last_name <> '' THEN 'Last name: ' || last_name END,
      CASE WHEN job_title <> '' THEN 'Job title: ' || job_title END,
      CASE WHEN department <> '' THEN 'Department: ' || department END,
      CASE WHEN lifecycle_stage <> '' THEN 'Lifecycle stage: ' || lifecycle_stage END
    ),
    1000
  )
  FROM (
    SELECT
      public.crm_search_normalize_text(p_first_name, 200) AS first_name,
      public.crm_search_normalize_text(p_last_name, 200) AS last_name,
      public.crm_search_normalize_text(p_job_title, 160) AS job_title,
      public.crm_search_normalize_text(p_department, 160) AS department,
      public.crm_search_normalize_text(p_lifecycle_stage, 160) AS lifecycle_stage
  ) normalized
$$;

CREATE OR REPLACE FUNCTION crm_search_company_projection_v1(
  p_name TEXT,
  p_domain TEXT,
  p_lifecycle_stage TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.left(
    pg_catalog.concat_ws(
      E'\n',
      CASE WHEN company_name <> '' THEN 'Name: ' || company_name END,
      CASE WHEN domain <> '' THEN 'Domain: ' || domain END,
      CASE WHEN lifecycle_stage <> '' THEN 'Lifecycle stage: ' || lifecycle_stage END
    ),
    1000
  )
  FROM (
    SELECT
      public.crm_search_normalize_text(p_name, 240) AS company_name,
      pg_catalog.left(
        pg_catalog.lower(public.crm_search_normalize_text(p_domain, 253)),
        253
      ) AS domain,
      public.crm_search_normalize_text(p_lifecycle_stage, 160) AS lifecycle_stage
  ) normalized
$$;

CREATE OR REPLACE FUNCTION crm_search_opportunity_projection_v1(
  p_name TEXT,
  p_status TEXT,
  p_source TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.left(
    pg_catalog.concat_ws(
      E'\n',
      CASE WHEN opportunity_name <> '' THEN 'Name: ' || opportunity_name END,
      CASE WHEN status <> '' THEN 'Status: ' || status END,
      CASE WHEN source <> '' THEN 'Source: ' || source END
    ),
    1000
  )
  FROM (
    SELECT
      public.crm_search_normalize_text(p_name, 300) AS opportunity_name,
      public.crm_search_normalize_text(p_status, 160) AS status,
      public.crm_search_normalize_text(p_source, 160) AS source
  ) normalized
$$;

CREATE OR REPLACE FUNCTION crm_search_person_projection_hash_v1(
  p_first_name TEXT,
  p_last_name TEXT,
  p_job_title TEXT,
  p_department TEXT,
  p_lifecycle_stage TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.crm_search_projection_hash(
    public.crm_search_person_projection_v1(
      p_first_name, p_last_name, p_job_title, p_department, p_lifecycle_stage
    )
  )
$$;

CREATE OR REPLACE FUNCTION crm_search_company_projection_hash_v1(
  p_name TEXT,
  p_domain TEXT,
  p_lifecycle_stage TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.crm_search_projection_hash(
    public.crm_search_company_projection_v1(p_name, p_domain, p_lifecycle_stage)
  )
$$;

CREATE OR REPLACE FUNCTION crm_search_opportunity_projection_hash_v1(
  p_name TEXT,
  p_status TEXT,
  p_source TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.crm_search_projection_hash(
    public.crm_search_opportunity_projection_v1(p_name, p_status, p_source)
  )
$$;

CREATE TABLE IF NOT EXISTS crm_search_organisation_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL UNIQUE
    CHECK (scope_key ~ '^[a-z0-9][a-z0-9._:-]{2,119}$'),
  scope_kind TEXT NOT NULL DEFAULT 'installation'
    CHECK (scope_kind IN ('installation', 'organisation')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  identity_locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_organisation_scopes_one_primary
  ON crm_search_organisation_scopes ((is_primary))
  WHERE is_primary = TRUE AND is_active = TRUE;

CREATE TABLE IF NOT EXISTS crm_search_global_control (
  organisation_scope_id UUID PRIMARY KEY
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'halted'
    CHECK (state IN ('halted', 'delete_only', 'enabled')),
  maximum_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (maximum_mode IN ('off', 'shadow', 'assist')),
  indexing_ready BOOLEAN NOT NULL DEFAULT FALSE,
  daily_query_budget_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (daily_query_budget_usd_micros >= 0),
  daily_indexing_budget_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (daily_indexing_budget_usd_micros >= 0),
  max_query_provider_calls BIGINT NOT NULL DEFAULT 0
    CHECK (max_query_provider_calls >= 0),
  max_indexing_provider_calls BIGINT NOT NULL DEFAULT 0
    CHECK (max_indexing_provider_calls >= 0),
  max_query_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (max_query_dimensions >= 0),
  max_inserted_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (max_inserted_dimensions >= 0),
  max_stored_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (max_stored_dimensions >= 0),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  environment TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK (environment IN ('unconfigured', 'test', 'preview', 'production')),
  deployed_git_sha TEXT CHECK (deployed_git_sha IS NULL OR deployed_git_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  artifact_manifest_digest TEXT CHECK (
    artifact_manifest_digest IS NULL OR artifact_manifest_digest ~ '^[a-f0-9]{64}$'
  ),
  pages_bundle_digest TEXT CHECK (
    pages_bundle_digest IS NULL OR pages_bundle_digest ~ '^[a-f0-9]{64}$'
  ),
  worker_bundle_digest TEXT CHECK (
    worker_bundle_digest IS NULL OR worker_bundle_digest ~ '^[a-f0-9]{64}$'
  ),
  binding_manifest_digest TEXT CHECK (
    binding_manifest_digest IS NULL OR binding_manifest_digest ~ '^[a-f0-9]{64}$'
  ),
  evidence_bundle_hash TEXT CHECK (evidence_bundle_hash IS NULL OR evidence_bundle_hash ~ '^[a-f0-9]{64}$'),
  active_deployment_approval_id UUID,
  maximum_cost_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (maximum_cost_usd_micros >= 0),
  rate_card_id UUID,
  transition_reason TEXT CHECK (
    transition_reason IS NULL OR char_length(btrim(transition_reason)) BETWEEN 10 AND 2000
  ),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (state = 'enabled' OR maximum_mode = 'off'),
  CHECK (state = 'enabled' OR indexing_ready = FALSE)
);

CREATE TABLE IF NOT EXISTS crm_search_legal_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID,
  hold_key TEXT NOT NULL CHECK (hold_key ~ '^[a-z0-9][a-z0-9._:-]{2,159}$'),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  approved_by UUID NOT NULL,
  second_approved_by UUID NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_scope_id, hold_key),
  CHECK (approved_by <> second_approved_by)
);

CREATE TABLE IF NOT EXISTS crm_search_legal_hold_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_hold_id UUID NOT NULL UNIQUE
    REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  released_by UUID NOT NULL,
  second_approved_by UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (released_by <> second_approved_by)
);

CREATE TABLE IF NOT EXISTS crm_search_legal_hold_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_hold_id UUID NOT NULL
    REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  target_table TEXT NOT NULL CHECK (target_table ~ '^crm_search_[a-z0-9_]{1,96}$'),
  target_row_id UUID NOT NULL,
  attached_by UUID NOT NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_hold_id, target_table, target_row_id)
);

CREATE TABLE IF NOT EXISTS crm_search_namespaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  namespace TEXT NOT NULL UNIQUE
    CHECK (namespace ~ '^[A-Za-z0-9_-]{16,64}$' AND octet_length(namespace) <= 64),
  source_tuple_digest TEXT NOT NULL CHECK (source_tuple_digest ~ '^[a-f0-9]{64}$'),
  derivation_revision TEXT NOT NULL DEFAULT 'namespace-sha256-base64url-v1'
    CHECK (char_length(derivation_revision) BETWEEN 1 AND 120),
  state TEXT NOT NULL DEFAULT 'allocated'
    CHECK (state IN ('allocated', 'active', 'teardown_pending', 'provider_confirmed_empty', 'retired')),
  provider_confirmed_empty_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_scope_id, client_id),
  UNIQUE (organisation_scope_id, client_id, source_tuple_digest),
  CHECK (
    state <> 'provider_confirmed_empty' OR provider_confirmed_empty_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS crm_search_schema_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  schema_version TEXT NOT NULL CHECK (schema_version ~ '^crm-search-v[1-9][0-9]*$'),
  model_id TEXT NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 240),
  dimensions INTEGER NOT NULL CHECK (dimensions = 768),
  distance_metric TEXT NOT NULL CHECK (distance_metric = 'cosine'),
  pooling TEXT NOT NULL CHECK (pooling = 'cls'),
  tokenizer_revision TEXT NOT NULL CHECK (char_length(tokenizer_revision) BETWEEN 1 AND 200),
  document_builder_revision TEXT NOT NULL CHECK (char_length(document_builder_revision) BETWEEN 1 AND 200),
  ranking_revision TEXT NOT NULL DEFAULT 'rrf-v1'
    CHECK (char_length(ranking_revision) BETWEEN 1 AND 200),
  threshold_revision TEXT NOT NULL DEFAULT 'cosine-0.75-v1'
    CHECK (char_length(threshold_revision) BETWEEN 1 AND 200),
  normalization_revision TEXT NOT NULL CHECK (char_length(normalization_revision) BETWEEN 1 AND 200),
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens = 512),
  canonical_max_code_points INTEGER NOT NULL CHECK (canonical_max_code_points = 1000),
  abstention_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.7500
    CHECK (abstention_threshold BETWEEN 0 AND 1),
  metadata_index_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (metadata_index_state IN ('pending', 'ready', 'failed')),
  sentinel_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (sentinel_state IN ('pending', 'upsert_pending', 'query_verified', 'delete_pending', 'confirmed_absent', 'failed')),
  captured_source_high_watermark BIGINT NOT NULL DEFAULT 0
    CHECK (captured_source_high_watermark >= 0),
  confirmed_source_high_watermark BIGINT NOT NULL DEFAULT 0
    CHECK (confirmed_source_high_watermark >= 0),
  provider_contract_digest TEXT NOT NULL CHECK (provider_contract_digest ~ '^[a-f0-9]{64}$'),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (organisation_scope_id, schema_version)
);

CREATE TABLE IF NOT EXISTS crm_search_rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('cloudflare_workers_ai_vectorize')),
  revision TEXT NOT NULL CHECK (revision ~ '^[a-z0-9][a-z0-9._:-]{2,119}$'),
  model_id TEXT NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 240),
  model_input_usd_micros_per_million_tokens BIGINT NOT NULL CHECK (
    model_input_usd_micros_per_million_tokens >= 0
  ),
  queried_dimension_usd_micros_per_million NUMERIC(20,6) NOT NULL CHECK (
    queried_dimension_usd_micros_per_million >= 0
  ),
  inserted_dimension_usd_micros_per_million NUMERIC(20,6) NOT NULL CHECK (
    inserted_dimension_usd_micros_per_million >= 0
  ),
  stored_dimension_usd_micros_per_million_month NUMERIC(20,6) NOT NULL CHECK (
    stored_dimension_usd_micros_per_million_month >= 0
  ),
  included_model_tokens BIGINT NOT NULL DEFAULT 0 CHECK (included_model_tokens >= 0),
  included_queried_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (included_queried_dimensions >= 0),
  included_inserted_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (included_inserted_dimensions >= 0),
  included_stored_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (included_stored_dimensions >= 0),
  source_revision_digest TEXT NOT NULL CHECK (source_revision_digest ~ '^[a-f0-9]{64}$'),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '400 days'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (organisation_scope_id, revision),
  CHECK (valid_until > valid_from)
);

CREATE TABLE IF NOT EXISTS crm_search_rate_card_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id UUID NOT NULL UNIQUE
    REFERENCES crm_search_rate_cards(id) ON DELETE RESTRICT,
  revoked_by UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '400 days'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS crm_search_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'off'
    CHECK (lifecycle_state IN ('off', 'indexing', 'shadow', 'assist', 'teardown_pending')),
  effective_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (effective_mode IN ('off', 'shadow', 'assist')),
  indexing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  shadow_sample_rate NUMERIC(5,4) NOT NULL DEFAULT 0
    CHECK (shadow_sample_rate BETWEEN 0 AND 0.1000),
  active_schema_version TEXT,
  candidate_schema_version TEXT,
  retiring_schema_versions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  daily_query_budget_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (daily_query_budget_usd_micros >= 0),
  daily_indexing_budget_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (daily_indexing_budget_usd_micros >= 0),
  max_query_provider_calls BIGINT NOT NULL DEFAULT 0
    CHECK (max_query_provider_calls >= 0),
  max_indexing_provider_calls BIGINT NOT NULL DEFAULT 0
    CHECK (max_indexing_provider_calls >= 0),
  max_query_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (max_query_dimensions >= 0),
  max_inserted_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (max_inserted_dimensions >= 0),
  max_stored_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (max_stored_dimensions >= 0),
  semantic_deadline_ms INTEGER NOT NULL DEFAULT 500
    CHECK (semantic_deadline_ms BETWEEN 1 AND 750),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  approved_evaluation_run_id UUID,
  active_teardown_id UUID,
  deployed_environment TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK (deployed_environment IN ('unconfigured', 'test', 'preview', 'production')),
  deployed_git_sha TEXT CHECK (deployed_git_sha IS NULL OR deployed_git_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  artifact_manifest_digest TEXT CHECK (
    artifact_manifest_digest IS NULL OR artifact_manifest_digest ~ '^[a-f0-9]{64}$'
  ),
  pages_bundle_digest TEXT CHECK (
    pages_bundle_digest IS NULL OR pages_bundle_digest ~ '^[a-f0-9]{64}$'
  ),
  worker_bundle_digest TEXT CHECK (
    worker_bundle_digest IS NULL OR worker_bundle_digest ~ '^[a-f0-9]{64}$'
  ),
  binding_manifest_digest TEXT CHECK (
    binding_manifest_digest IS NULL OR binding_manifest_digest ~ '^[a-f0-9]{64}$'
  ),
  evidence_bundle_hash TEXT CHECK (
    evidence_bundle_hash IS NULL OR evidence_bundle_hash ~ '^[a-f0-9]{64}$'
  ),
  approved_control_revision BIGINT CHECK (
    approved_control_revision IS NULL OR approved_control_revision >= 0
  ),
  active_deployment_approval_id UUID,
  maximum_cost_usd_micros BIGINT NOT NULL DEFAULT 0
    CHECK (maximum_cost_usd_micros >= 0),
  rate_card_id UUID,
  transition_reason TEXT CHECK (
    transition_reason IS NULL OR char_length(btrim(transition_reason)) BETWEEN 10 AND 2000
  ),
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_scope_id, client_id),
  CHECK (
    (lifecycle_state = 'off' AND effective_mode = 'off' AND indexing_enabled = FALSE)
    OR (lifecycle_state = 'indexing' AND effective_mode = 'off' AND indexing_enabled = TRUE)
    OR (lifecycle_state = 'shadow' AND effective_mode = 'shadow' AND indexing_enabled = TRUE)
    OR (lifecycle_state = 'assist' AND effective_mode = 'assist' AND indexing_enabled = TRUE)
    OR (lifecycle_state = 'teardown_pending' AND effective_mode = 'off' AND indexing_enabled = FALSE)
  ),
  CHECK (candidate_schema_version IS NULL OR candidate_schema_version <> active_schema_version),
  CHECK (NOT (retiring_schema_versions @> ARRAY[active_schema_version]::TEXT[])),
  CHECK (NOT (retiring_schema_versions @> ARRAY[candidate_schema_version]::TEXT[])),
  CHECK (lifecycle_state NOT IN ('shadow', 'assist') OR active_schema_version IS NOT NULL),
  CHECK (lifecycle_state <> 'assist' OR approved_evaluation_run_id IS NOT NULL)
);

CREATE SEQUENCE IF NOT EXISTS crm_search_source_event_sequence AS BIGINT
  MINVALUE 1
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

CREATE TABLE IF NOT EXISTS crm_search_source_dirty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'company', 'opportunity')),
  entity_id UUID NOT NULL,
  source_revision BIGINT NOT NULL CHECK (source_revision >= 1),
  desired_action TEXT NOT NULL CHECK (desired_action IN ('upsert', 'delete')),
  event_sequence BIGINT NOT NULL CHECK (event_sequence >= 1),
  claim_token UUID,
  claim_generation BIGINT NOT NULL DEFAULT 0 CHECK (claim_generation >= 0),
  claim_lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 1000),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_class TEXT CHECK (
    error_class IS NULL OR error_class ~ '^[a-z][a-z0-9_]{1,119}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_scope_id, client_id, entity_type, entity_id),
  UNIQUE (organisation_scope_id, event_sequence),
  CHECK ((claim_token IS NULL) = (claim_lease_expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS crm_search_source_dirty_claim
  ON crm_search_source_dirty (next_attempt_at, event_sequence)
  WHERE claim_token IS NULL;

CREATE OR REPLACE FUNCTION crm_search_complete_source_dirty_claim(
  p_id UUID,
  p_source_revision BIGINT,
  p_event_sequence BIGINT,
  p_claim_token UUID,
  p_claim_generation BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM public.crm_search_source_dirty
  WHERE id = p_id
    AND source_revision = p_source_revision
    AND event_sequence = p_event_sequence
    AND claim_token = p_claim_token
    AND claim_generation = p_claim_generation;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_operation_state_transition_allowed(
  p_from TEXT,
  p_to TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE p_from
    WHEN 'pending_transport' THEN p_to IN ('pending_transport', 'queued', 'retryable', 'superseded', 'terminal_dead_letter')
    WHEN 'queued' THEN p_to IN ('queued', 'processing', 'retryable', 'superseded', 'terminal_dead_letter')
    WHEN 'processing' THEN p_to IN ('processing', 'admitted', 'retryable', 'superseded', 'terminal_dead_letter')
    WHEN 'admitted' THEN p_to IN ('admitted', 'provider_pending', 'retryable', 'terminal_dead_letter')
    WHEN 'retryable' THEN p_to IN ('retryable', 'pending_transport', 'queued', 'processing', 'admitted', 'superseded', 'terminal_dead_letter')
    WHEN 'provider_pending' THEN p_to IN ('provider_pending', 'confirmed', 'retryable', 'terminal_dead_letter')
    WHEN 'confirmed' THEN p_to = 'confirmed'
    WHEN 'superseded' THEN p_to = 'superseded'
    WHEN 'terminal_dead_letter' THEN p_to = 'terminal_dead_letter'
    ELSE FALSE
  END
$$;

CREATE TABLE IF NOT EXISTS crm_search_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'company', 'opportunity')),
  entity_id UUID NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version ~ '^crm-search-v[1-9][0-9]*$'),
  source_revision BIGINT NOT NULL CHECK (source_revision >= 1),
  source_event_sequence BIGINT NOT NULL CHECK (source_event_sequence >= 1),
  desired_action TEXT NOT NULL CHECK (desired_action IN ('upsert', 'delete')),
  vector_id TEXT NOT NULL CHECK (
    vector_id ~ '^[A-Za-z0-9_-]{1,64}$' AND octet_length(vector_id) <= 64
  ),
  namespace TEXT NOT NULL CHECK (
    namespace ~ '^[A-Za-z0-9_-]{1,64}$' AND octet_length(namespace) <= 64
  ),
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  confirmation_tag TEXT CHECK (
    confirmation_tag IS NULL OR confirmation_tag ~ '^hmac-sha256:[a-f0-9]{64}$'
  ),
  confirmation_key_version TEXT CHECK (
    confirmation_key_version IS NULL OR confirmation_key_version ~ '^[a-zA-Z0-9._:-]{1,80}$'
  ),
  control_revision BIGINT NOT NULL DEFAULT 0 CHECK (control_revision >= 0),
  state TEXT NOT NULL DEFAULT 'pending_transport'
    CHECK (state IN (
      'pending_transport', 'queued', 'processing', 'admitted', 'provider_pending', 'retryable',
      'confirmed', 'superseded', 'terminal_dead_letter'
    )),
  successor_of UUID REFERENCES crm_search_operations(id) ON DELETE RESTRICT,
  transport_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (transport_attempt_count BETWEEN 0 AND 1000),
  processing_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempt_count BETWEEN 0 AND 1000),
  provider_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (provider_attempt_count BETWEEN 0 AND 1000),
  confirmation_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_attempt_count BETWEEN 0 AND 1000),
  provider_mutation_id TEXT CHECK (
    provider_mutation_id IS NULL OR char_length(provider_mutation_id) BETWEEN 1 AND 256
  ),
  lease_token UUID,
  lease_generation BIGINT NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_class TEXT CHECK (error_class IS NULL OR error_class ~ '^[a-z][a-z0-9_]{1,119}$'),
  provider_accepted_at TIMESTAMPTZ,
  provider_admitted_at TIMESTAMPTZ,
  admission_identity_hash TEXT CHECK (
    admission_identity_hash IS NULL OR admission_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  CHECK (successor_of IS NULL OR successor_of <> id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (
    (desired_action = 'upsert' AND content_hash IS NOT NULL
      AND confirmation_tag IS NOT NULL AND confirmation_key_version IS NOT NULL)
    OR (desired_action = 'delete' AND content_hash IS NULL)
  ),
  CHECK (
    state NOT IN ('provider_pending', 'confirmed')
    OR (provider_mutation_id IS NOT NULL AND provider_accepted_at IS NOT NULL)
  ),
  CHECK (
    provider_admitted_at IS NOT NULL
    OR (provider_mutation_id IS NULL AND provider_accepted_at IS NULL)
  ),
  CHECK (state <> 'confirmed' OR confirmed_at IS NOT NULL),
  CHECK ((provider_admitted_at IS NULL) = (admission_identity_hash IS NULL)),
  CHECK (
    state NOT IN ('admitted', 'provider_pending', 'confirmed')
    OR provider_admitted_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_unique_root_intent
  ON crm_search_operations (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version,
    source_revision, source_event_sequence, desired_action
  )
  WHERE successor_of IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_pre_admission
  ON crm_search_operations (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version
  )
  WHERE successor_of IS NULL
    AND provider_admitted_at IS NULL
    AND state IN ('pending_transport', 'queued', 'processing', 'retryable');

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_provider_inflight
  ON crm_search_operations (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version
  )
  WHERE provider_admitted_at IS NOT NULL
    AND state NOT IN ('confirmed', 'superseded', 'terminal_dead_letter');

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_successor
  ON crm_search_operations (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version
  )
  WHERE successor_of IS NOT NULL
    AND provider_admitted_at IS NULL
    AND state IN ('pending_transport', 'queued', 'processing', 'retryable');

-- Admission/terminal transitions must not reopen a slot for another direct
-- successor. Chained recovery remains explicit through each predecessor.
CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_direct_successor
  ON crm_search_operations (successor_of)
  WHERE successor_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_search_operations_claim
  ON crm_search_operations (next_attempt_at, created_at, id)
  WHERE state IN ('pending_transport', 'retryable') AND lease_token IS NULL;

CREATE TABLE IF NOT EXISTS crm_search_operation_admission_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backend_pid INTEGER NOT NULL,
  transaction_id BIGINT NOT NULL,
  operation_id UUID NOT NULL REFERENCES crm_search_operations(id) ON DELETE RESTRICT,
  control_revision BIGINT NOT NULL CHECK (control_revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (backend_pid, transaction_id, operation_id)
);

CREATE TABLE IF NOT EXISTS crm_search_terminal_replacement_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backend_pid INTEGER NOT NULL,
  transaction_id BIGINT NOT NULL,
  replacement_operation_id UUID NOT NULL,
  terminal_operation_id UUID NOT NULL
    REFERENCES crm_search_operations(id) ON DELETE RESTRICT,
  audit_log_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (backend_pid, transaction_id, replacement_operation_id)
);

CREATE OR REPLACE FUNCTION crm_search_provider_attempt_transition_allowed(
  p_provider TEXT,
  p_from TEXT,
  p_to TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE p_from
    WHEN 'precommitted' THEN p_to IN ('precommitted', 'sent', 'released')
    WHEN 'sent' THEN p_to IN ('sent', 'settled', 'accepted', 'ambiguous')
    WHEN 'released' THEN p_to = 'released'
    WHEN 'settled' THEN p_to = 'settled'
    WHEN 'ambiguous' THEN p_to = 'ambiguous'
    WHEN 'accepted' THEN p_to = 'accepted'
    ELSE FALSE
  END
$$;

CREATE TABLE IF NOT EXISTS crm_search_provider_attempts (
  id UUID PRIMARY KEY,
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  usage_kind TEXT NOT NULL CHECK (usage_kind IN ('query', 'indexing')),
  operation_id UUID
    REFERENCES crm_search_operations(id) ON DELETE RESTRICT,
  correlation_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('workers_ai', 'vectorize')),
  provider_action TEXT NOT NULL
    CHECK (provider_action IN ('embedding', 'query', 'upsert', 'delete')),
  attempt_sequence INTEGER NOT NULL CHECK (attempt_sequence BETWEEN 1 AND 1000),
  control_revision BIGINT NOT NULL CHECK (control_revision >= 0),
  policy_revision BIGINT NOT NULL CHECK (policy_revision >= 0),
  lease_generation BIGINT CHECK (lease_generation IS NULL OR lease_generation >= 1),
  state TEXT NOT NULL DEFAULT 'precommitted'
    CHECK (state IN ('precommitted', 'sent', 'released', 'settled', 'accepted', 'ambiguous')),
  provider_call_sent BOOLEAN NOT NULL DEFAULT FALSE,
  provider_mutation_id TEXT CHECK (
    provider_mutation_id IS NULL OR char_length(provider_mutation_id) BETWEEN 1 AND 256
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '400 days'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  CHECK (
    (usage_kind = 'query' AND operation_id IS NULL AND lease_generation IS NULL
      AND ((provider = 'workers_ai' AND provider_action = 'embedding')
        OR (provider = 'vectorize' AND provider_action = 'query')))
    OR (usage_kind = 'indexing' AND operation_id IS NOT NULL AND lease_generation IS NOT NULL
      AND ((provider = 'workers_ai' AND provider_action = 'embedding')
        OR (provider = 'vectorize' AND provider_action IN ('upsert', 'delete'))))
  ),
  CHECK (
    (state IN ('precommitted', 'released') AND provider_call_sent = FALSE AND sent_at IS NULL)
    OR (state IN ('sent', 'settled', 'accepted', 'ambiguous')
      AND provider_call_sent = TRUE AND sent_at IS NOT NULL)
  ),
  CHECK (
    (state IN ('precommitted', 'sent') AND settled_at IS NULL)
    OR (state IN ('released', 'settled', 'accepted', 'ambiguous') AND settled_at IS NOT NULL)
  ),
  CHECK (provider = 'vectorize' OR provider_mutation_id IS NULL),
  CHECK (state <> 'accepted' OR (
    provider = 'vectorize'
    AND provider_action IN ('upsert', 'delete')
    AND provider_mutation_id IS NOT NULL
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_provider_attempts_indexing_identity
  ON crm_search_provider_attempts (operation_id, provider, attempt_sequence)
  WHERE usage_kind = 'indexing';

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_provider_attempts_query_identity
  ON crm_search_provider_attempts (correlation_id, provider, attempt_sequence)
  WHERE usage_kind = 'query';

CREATE OR REPLACE FUNCTION crm_search_guard_provider_attempt_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'precommitted'
      OR NEW.provider_call_sent <> FALSE
      OR NEW.sent_at IS NOT NULL
      OR NEW.settled_at IS NOT NULL
      OR NEW.provider_mutation_id IS NOT NULL THEN
      RAISE EXCEPTION 'CRM search provider attempt must begin precommitted';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(
       NEW.organisation_scope_id, NEW.client_id, NEW.usage_kind,
       NEW.operation_id, NEW.correlation_id, NEW.provider, NEW.provider_action,
       NEW.attempt_sequence, NEW.control_revision, NEW.policy_revision, NEW.lease_generation,
       NEW.created_at, NEW.retention_expires_at
     ) IS DISTINCT FROM ROW(
       OLD.organisation_scope_id, OLD.client_id, OLD.usage_kind,
       OLD.operation_id, OLD.correlation_id, OLD.provider, OLD.provider_action,
       OLD.attempt_sequence, OLD.control_revision, OLD.policy_revision, OLD.lease_generation,
       OLD.created_at, OLD.retention_expires_at
     ) THEN
    RAISE EXCEPTION 'CRM search provider-attempt identity is immutable';
  END IF;
  IF NOT public.crm_search_provider_attempt_transition_allowed(
    OLD.provider, OLD.state, NEW.state
  ) THEN
    RAISE EXCEPTION 'invalid CRM search provider-attempt transition';
  END IF;
  IF OLD.state IN ('released', 'settled', 'accepted', 'ambiguous') AND ROW(
       NEW.state, NEW.provider_call_sent, NEW.provider_mutation_id,
       NEW.sent_at, NEW.settled_at
     ) IS DISTINCT FROM ROW(
       OLD.state, OLD.provider_call_sent, OLD.provider_mutation_id,
       OLD.sent_at, OLD.settled_at
     ) THEN
    RAISE EXCEPTION 'CRM search provider-attempt terminal evidence is immutable';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_provider_attempt_transition
  ON crm_search_provider_attempts;
CREATE TRIGGER crm_search_guard_provider_attempt_transition
  BEFORE INSERT OR UPDATE ON crm_search_provider_attempts
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_provider_attempt_transition();

CREATE TABLE IF NOT EXISTS crm_search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'company', 'opportunity')),
  entity_id UUID NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version ~ '^crm-search-v[1-9][0-9]*$'),
  vector_id TEXT NOT NULL CHECK (
    vector_id ~ '^[A-Za-z0-9_-]{1,64}$' AND octet_length(vector_id) <= 64
  ),
  namespace TEXT NOT NULL CHECK (
    namespace ~ '^[A-Za-z0-9_-]{1,64}$' AND octet_length(namespace) <= 64
  ),
  source_revision BIGINT NOT NULL CHECK (source_revision >= 1),
  source_event_sequence BIGINT NOT NULL CHECK (source_event_sequence >= 1),
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  provider_mutation_id TEXT CHECK (
    provider_mutation_id IS NULL OR char_length(provider_mutation_id) BETWEEN 1 AND 256
  ),
  confirmation_state TEXT NOT NULL DEFAULT 'absent'
    CHECK (confirmation_state IN (
      'absent', 'provider_pending', 'indexed', 'delete_pending', 'deleted', 'error'
    )),
  tombstoned BOOLEAN NOT NULL DEFAULT FALSE,
  provider_high_watermark BIGINT NOT NULL DEFAULT 0 CHECK (provider_high_watermark >= 0),
  lease_token UUID,
  lease_generation BIGINT NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  confirmation_tag TEXT CHECK (
    confirmation_tag IS NULL OR confirmation_tag ~ '^hmac-sha256:[a-f0-9]{64}$'
  ),
  confirmation_key_version TEXT CHECK (
    confirmation_key_version IS NULL OR confirmation_key_version ~ '^[a-zA-Z0-9._:-]{1,80}$'
  ),
  last_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (organisation_scope_id, client_id, entity_type, entity_id, schema_version),
  UNIQUE (organisation_scope_id, namespace, vector_id),
  CHECK ((lease_token IS NULL) OR lease_generation > 0),
  CHECK (confirmation_state <> 'indexed' OR (tombstoned = FALSE AND content_hash IS NOT NULL)),
  CHECK (confirmation_state <> 'deleted' OR tombstoned = TRUE)
);

CREATE INDEX IF NOT EXISTS crm_search_documents_join_back
  ON crm_search_documents (
    organisation_scope_id, client_id, schema_version, namespace, vector_id
  )
  WHERE confirmation_state = 'indexed' AND tombstoned = FALSE;

CREATE TABLE IF NOT EXISTS crm_search_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date DATE NOT NULL,
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  usage_scope TEXT NOT NULL CHECK (usage_scope IN ('global', 'client')),
  client_id UUID,
  usage_kind TEXT NOT NULL CHECK (usage_kind IN ('query', 'indexing')),
  cap_provider_calls BIGINT NOT NULL DEFAULT 0 CHECK (cap_provider_calls >= 0),
  cap_model_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (cap_model_input_tokens >= 0),
  cap_query_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (cap_query_dimensions >= 0),
  cap_inserted_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (cap_inserted_dimensions >= 0),
  cap_stored_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (cap_stored_dimensions >= 0),
  cap_charged_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (cap_charged_usd_micros >= 0),
  reserved_provider_calls BIGINT NOT NULL DEFAULT 0 CHECK (reserved_provider_calls >= 0),
  charged_provider_calls BIGINT NOT NULL DEFAULT 0 CHECK (charged_provider_calls >= 0),
  reserved_model_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_model_input_tokens >= 0),
  charged_model_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (charged_model_input_tokens >= 0),
  reserved_query_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (reserved_query_dimensions >= 0),
  charged_query_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (charged_query_dimensions >= 0),
  reserved_inserted_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (reserved_inserted_dimensions >= 0),
  charged_inserted_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (charged_inserted_dimensions >= 0),
  stored_dimension_high_watermark BIGINT NOT NULL DEFAULT 0 CHECK (stored_dimension_high_watermark >= 0),
  reserved_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (reserved_usd_micros >= 0),
  charged_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (charged_usd_micros >= 0),
  late_billed_completions BIGINT NOT NULL DEFAULT 0 CHECK (late_billed_completions >= 0),
  rate_card_id UUID NOT NULL REFERENCES crm_search_rate_cards(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '400 days'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  CHECK (
    (usage_scope = 'global' AND client_id IS NULL)
    OR (usage_scope = 'client' AND client_id IS NOT NULL)
  ),
  CHECK (charged_provider_calls <= reserved_provider_calls),
  CHECK (charged_model_input_tokens <= reserved_model_input_tokens),
  CHECK (charged_query_dimensions <= reserved_query_dimensions),
  CHECK (charged_inserted_dimensions <= reserved_inserted_dimensions),
  CHECK (charged_usd_micros <= reserved_usd_micros)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_usage_daily_identity
  ON crm_search_usage_daily (
    usage_date,
    organisation_scope_id,
    usage_scope,
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::UUID),
    usage_kind
  );

CREATE TABLE IF NOT EXISTS crm_search_usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  usage_kind TEXT NOT NULL CHECK (usage_kind IN ('query', 'indexing')),
  correlation_id UUID NOT NULL,
  operation_id UUID,
  provider_attempt_id UUID NOT NULL
    CONSTRAINT crm_search_usage_reservations_provider_attempt_fk
    REFERENCES crm_search_provider_attempts(id) ON DELETE RESTRICT,
  control_revision BIGINT NOT NULL CHECK (control_revision >= 0),
  policy_revision BIGINT NOT NULL CHECK (policy_revision >= 0),
  rate_card_id UUID NOT NULL REFERENCES crm_search_rate_cards(id) ON DELETE RESTRICT,
  rate_card_revision TEXT NOT NULL CHECK (
    rate_card_revision ~ '^[a-z0-9][a-z0-9._:-]{2,119}$'
  ),
  reserved_provider_calls INTEGER NOT NULL CHECK (reserved_provider_calls BETWEEN 0 AND 1000),
  reserved_model_input_tokens INTEGER NOT NULL CHECK (
    reserved_model_input_tokens IN (0, 512)
  ),
  reserved_query_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (reserved_query_dimensions >= 0),
  reserved_inserted_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (reserved_inserted_dimensions >= 0),
  reserved_stored_dimensions BIGINT NOT NULL DEFAULT 0 CHECK (reserved_stored_dimensions >= 0),
  reserved_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (reserved_usd_micros >= 0),
  state TEXT NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'released_no_call', 'charged', 'late_charged')),
  provider_call_sent BOOLEAN,
  completion_class TEXT CHECK (
    completion_class IS NULL OR completion_class IN (
      'completed', 'failed', 'abandoned', 'late_discarded', 'released_no_call'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '400 days'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  CHECK (
    (usage_kind = 'query' AND operation_id IS NULL)
    OR (usage_kind = 'indexing' AND operation_id IS NOT NULL AND provider_attempt_id IS NOT NULL)
  ),
  CHECK (
    state = 'reserved'
    OR (settled_at IS NOT NULL AND provider_call_sent IS NOT NULL AND completion_class IS NOT NULL)
  ),
  CHECK (state <> 'released_no_call' OR provider_call_sent = FALSE),
  CHECK (state NOT IN ('charged', 'late_charged') OR provider_call_sent = TRUE)
);

ALTER TABLE crm_search_usage_reservations
  ADD COLUMN IF NOT EXISTS provider_attempt_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM crm_search_usage_reservations WHERE provider_attempt_id IS NULL
  ) THEN
    RAISE EXCEPTION 'existing CRM search usage rows lack durable provider-attempt identity';
  END IF;
END;
$$;

ALTER TABLE crm_search_usage_reservations
  ALTER COLUMN provider_attempt_id SET NOT NULL;

DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT constraint_row.conname
    FROM pg_catalog.pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'crm_search_usage_reservations'::REGCLASS
      AND constraint_row.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid)
        = 'UNIQUE (correlation_id, usage_kind, operation_id)'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE crm_search_usage_reservations DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'crm_search_usage_reservations'::REGCLASS
      AND conname = 'crm_search_usage_reservations_provider_attempt_fk'
  ) THEN
    ALTER TABLE crm_search_usage_reservations
      ADD CONSTRAINT crm_search_usage_reservations_provider_attempt_fk
      FOREIGN KEY (provider_attempt_id)
      REFERENCES crm_search_provider_attempts(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE crm_search_usage_reservations
  DROP CONSTRAINT IF EXISTS crm_search_usage_reservations_attempt_shape;
ALTER TABLE crm_search_usage_reservations
  ADD CONSTRAINT crm_search_usage_reservations_attempt_shape CHECK (
    (usage_kind = 'query' AND operation_id IS NULL)
    OR (usage_kind = 'indexing' AND operation_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_usage_reservations_provider_attempt_identity
  ON crm_search_usage_reservations (provider_attempt_id)
  WHERE provider_attempt_id IS NOT NULL;

DROP INDEX IF EXISTS crm_search_usage_reservations_query_identity;

CREATE OR REPLACE FUNCTION crm_search_json_schema_is_safe(
  p_value JSONB,
  p_schema TEXT,
  p_depth INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_normalized_key TEXT;
  v_child JSONB;
  v_entity_type TEXT;
  v_entity_id_digest TEXT;
  v_rank INTEGER;
  v_score_bucket INTEGER;
BEGIN
  IF p_value IS NULL OR p_depth > 2 OR octet_length(p_value::TEXT) > 8192 THEN
    RETURN FALSE;
  END IF;

  IF p_schema = 'rank_evidence' THEN
    IF jsonb_typeof(p_value) <> 'object' OR p_depth <> 0
       OR (SELECT COUNT(*) FROM jsonb_object_keys(p_value)) > 10
       OR (SELECT COUNT(*) FROM jsonb_object_keys(p_value)) <>
          (SELECT COUNT(DISTINCT lower(regexp_replace(key, '[^a-zA-Z0-9]', '', 'g')))
           FROM jsonb_object_keys(p_value) AS object_key(key)) THEN
      RETURN FALSE;
    END IF;
    FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
    LOOP
      v_normalized_key := lower(regexp_replace(v_key, '[^a-zA-Z0-9]', '', 'g'));
      IF NOT (v_normalized_key = ANY(ARRAY[
        'keywordranks', 'semanticranks', 'fusedranks', 'overlapcount',
        'orderingchanged', 'abstained', 'thresholdrevision', 'resultcount',
        'reasonclass'
      ]::TEXT[])) THEN
        RETURN FALSE;
      END IF;

      IF v_normalized_key = ANY(ARRAY[
        'keywordranks', 'semanticranks', 'fusedranks'
      ]::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'array' OR jsonb_array_length(v_child) > 50 THEN
          RETURN FALSE;
        END IF;
        IF EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_child) rank_item(item)
          WHERE NOT public.crm_search_json_schema_is_safe(
            rank_item.item, 'rank_entry', p_depth + 1
          )
        ) THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = ANY(ARRAY['overlapcount', 'resultcount']::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'number'
           OR (v_child #>> '{}') !~ '^[0-9]+$'
           OR (v_child #>> '{}')::INTEGER NOT BETWEEN 0 AND 50 THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = ANY(ARRAY['orderingchanged', 'abstained']::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'boolean' THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key IN ('thresholdrevision', 'reasonclass') THEN
        IF jsonb_typeof(v_child) <> 'string'
           OR (v_child #>> '{}') !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$' THEN
          RETURN FALSE;
        END IF;
      END IF;
    END LOOP;
    RETURN TRUE;
  END IF;

  IF p_schema = 'rank_entry' THEN
    IF jsonb_typeof(p_value) <> 'object'
       OR (SELECT COUNT(*) FROM jsonb_object_keys(p_value)) NOT BETWEEN 3 AND 4
       OR (SELECT COUNT(*) FROM jsonb_object_keys(p_value)) <>
          (SELECT COUNT(DISTINCT lower(regexp_replace(key, '[^a-zA-Z0-9]', '', 'g')))
           FROM jsonb_object_keys(p_value) AS object_key(key)) THEN
      RETURN FALSE;
    END IF;
    FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
    LOOP
      v_normalized_key := lower(regexp_replace(v_key, '[^a-zA-Z0-9]', '', 'g'));
      IF NOT (v_normalized_key = ANY(ARRAY[
        'entitytype', 'entityiddigest', 'rank', 'scorebucket'
      ]::TEXT[])) OR jsonb_typeof(v_child) IN ('array', 'object', 'null') THEN
        RETURN FALSE;
      END IF;
      CASE v_normalized_key
        WHEN 'entitytype' THEN
          IF jsonb_typeof(v_child) <> 'string' THEN RETURN FALSE; END IF;
          v_entity_type := v_child #>> '{}';
        WHEN 'entityiddigest' THEN
          IF jsonb_typeof(v_child) <> 'string' THEN RETURN FALSE; END IF;
          v_entity_id_digest := v_child #>> '{}';
        WHEN 'rank' THEN
          IF jsonb_typeof(v_child) <> 'number' OR (v_child #>> '{}') !~ '^[0-9]+$' THEN
            RETURN FALSE;
          END IF;
          v_rank := (v_child #>> '{}')::INTEGER;
        WHEN 'scorebucket' THEN
          IF jsonb_typeof(v_child) <> 'number' OR (v_child #>> '{}') !~ '^[0-9]+$' THEN
            RETURN FALSE;
          END IF;
          v_score_bucket := (v_child #>> '{}')::INTEGER;
        ELSE
          RETURN FALSE;
      END CASE;
    END LOOP;
    RETURN v_entity_type IN ('person', 'company', 'opportunity')
      AND v_entity_id_digest ~ '^(hmac-sha256:)?[a-f0-9]{64}$'
      AND v_rank BETWEEN 1 AND 50
      AND (v_score_bucket IS NULL OR v_score_bucket BETWEEN 0 AND 100);
  END IF;

  IF p_schema = 'audit_details' THEN
    IF jsonb_typeof(p_value) <> 'object'
       OR (SELECT COUNT(*) FROM jsonb_object_keys(p_value)) > 32
       OR (SELECT COUNT(*) FROM jsonb_object_keys(p_value)) <>
          (SELECT COUNT(DISTINCT lower(regexp_replace(key, '[^a-zA-Z0-9]', '', 'g')))
           FROM jsonb_object_keys(p_value) AS object_key(key)) THEN
      RETURN FALSE;
    END IF;
    FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
    LOOP
      v_normalized_key := lower(regexp_replace(v_key, '[^a-zA-Z0-9]', '', 'g'));
      IF NOT (v_normalized_key = ANY(ARRAY[
        'fromstate', 'tostate', 'fromrevision', 'torevision', 'origin',
        'action', 'targettable', 'partitionname', 'rowcount', 'schemaversion',
        'candidateschemaversion', 'activeschemaversion', 'retiringschemaversion',
        'approvalid', 'teardownid', 'operationid', 'resolutionstate',
        'expectedstate', 'correlationid', 'evidencehash', 'manifesthash',
        'highwatermarkhash', 'complete'
      ]::TEXT[])) OR jsonb_typeof(v_child) IN ('array', 'object', 'null') THEN
        RETURN FALSE;
      END IF;

      IF v_normalized_key = ANY(ARRAY[
        'fromstate', 'tostate', 'origin', 'action', 'resolutionstate',
        'expectedstate'
      ]::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'string'
           OR (v_child #>> '{}') !~ '^[a-z][a-z0-9_.:-]{0,119}$' THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = ANY(ARRAY['targettable', 'partitionname']::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'string'
           OR (v_child #>> '{}') !~ '^crm_search_[a-z0-9_]{1,96}$' THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = ANY(ARRAY[
        'schemaversion', 'candidateschemaversion', 'activeschemaversion',
        'retiringschemaversion'
      ]::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'string'
           OR (v_child #>> '{}') !~ '^crm-search-v[1-9][0-9]*$' THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = ANY(ARRAY[
        'approvalid', 'teardownid', 'operationid', 'correlationid'
      ]::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'string'
           OR (v_child #>> '{}') !~
             '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = ANY(ARRAY[
        'evidencehash', 'manifesthash', 'highwatermarkhash'
      ]::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'string'
           OR (v_child #>> '{}') !~ '^(hmac-sha256:)?[a-f0-9]{64}$' THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = ANY(ARRAY[
        'fromrevision', 'torevision', 'rowcount'
      ]::TEXT[]) THEN
        IF jsonb_typeof(v_child) <> 'number' OR (v_child #>> '{}') !~ '^[0-9]+$' THEN
          RETURN FALSE;
        END IF;
      ELSIF v_normalized_key = 'complete' AND jsonb_typeof(v_child) <> 'boolean' THEN
        RETURN FALSE;
      END IF;
    END LOOP;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE TABLE IF NOT EXISTS crm_search_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  correlation_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{2,119}$'),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'portal', 'system')),
  mode TEXT NOT NULL CHECK (mode IN ('off', 'shadow', 'assist')),
  surface TEXT NOT NULL CHECK (surface IN ('agency_global', 'portal_global', 'agency_ai')),
  sampled BOOLEAN NOT NULL DEFAULT FALSE,
  query_digest TEXT CHECK (query_digest IS NULL OR query_digest ~ '^hmac-sha256:[a-f0-9]{64}$'),
  query_digest_key_version TEXT CHECK (
    query_digest_key_version IS NULL OR query_digest_key_version ~ '^[a-zA-Z0-9._:-]{1,80}$'
  ),
  query_length_bucket TEXT CHECK (
    query_length_bucket IS NULL OR query_length_bucket IN ('1_16', '17_32', '33_64', '65_128', '129_256')
  ),
  keyword_result_count SMALLINT CHECK (keyword_result_count BETWEEN 0 AND 50),
  semantic_candidate_count SMALLINT CHECK (semantic_candidate_count BETWEEN 0 AND 50),
  fused_result_count SMALLINT CHECK (fused_result_count BETWEEN 0 AND 50),
  rank_evidence JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (
      jsonb_typeof(rank_evidence) = 'object'
      AND public.crm_search_json_schema_is_safe(rank_evidence, 'rank_evidence')
    ),
  keyword_latency_ms INTEGER CHECK (keyword_latency_ms IS NULL OR keyword_latency_ms >= 0),
  embedding_latency_ms INTEGER CHECK (embedding_latency_ms IS NULL OR embedding_latency_ms >= 0),
  vector_latency_ms INTEGER CHECK (vector_latency_ms IS NULL OR vector_latency_ms >= 0),
  join_back_latency_ms INTEGER CHECK (join_back_latency_ms IS NULL OR join_back_latency_ms >= 0),
  total_latency_ms INTEGER CHECK (total_latency_ms IS NULL OR total_latency_ms >= 0),
  fallback_class TEXT CHECK (
    fallback_class IS NULL OR fallback_class IN (
      'none', 'mode_off', 'privacy_guard', 'budget_exhausted', 'deadline',
      'provider_unavailable', 'policy_changed', 'authorization_changed',
      'ledger_failure', 'join_back_failure', 'validation_failure'
    )
  ),
  status_class TEXT NOT NULL CHECK (
    status_class IN ('keyword_only', 'shadow_completed', 'assist_completed', 'fallback', 'security_rejection')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  PRIMARY KEY (created_at, id),
  CHECK (query_digest IS NULL = (query_digest_key_version IS NULL))
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS crm_search_events_default
  PARTITION OF crm_search_events DEFAULT;

CREATE INDEX IF NOT EXISTS crm_search_events_client_created
  ON crm_search_events (organisation_scope_id, client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crm_search_events_expiry
  ON crm_search_events (retention_expires_at, created_at, id);

CREATE TABLE IF NOT EXISTS crm_search_daily_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID,
  mode TEXT NOT NULL CHECK (mode IN ('off', 'shadow', 'assist')),
  surface TEXT NOT NULL CHECK (surface IN ('agency_global', 'portal_global', 'agency_ai')),
  status_class TEXT NOT NULL CHECK (
    status_class IN ('keyword_only', 'shadow_completed', 'assist_completed', 'fallback', 'security_rejection')
  ),
  eligible_count BIGINT NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  sampled_count BIGINT NOT NULL DEFAULT 0 CHECK (sampled_count >= 0),
  request_count BIGINT NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  fallback_count BIGINT NOT NULL DEFAULT 0 CHECK (fallback_count >= 0),
  timeout_count BIGINT NOT NULL DEFAULT 0 CHECK (timeout_count >= 0),
  late_billed_completion_count BIGINT NOT NULL DEFAULT 0
    CHECK (late_billed_completion_count >= 0),
  latency_count BIGINT NOT NULL DEFAULT 0 CHECK (latency_count >= 0),
  latency_sum_ms BIGINT NOT NULL DEFAULT 0 CHECK (latency_sum_ms >= 0),
  latency_max_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_max_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (event_date, organisation_scope_id, client_id, mode, surface, status_class),
  CHECK (sampled_count <= eligible_count),
  CHECK (fallback_count <= request_count),
  CHECK (timeout_count <= request_count)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_daily_events_global_identity
  ON crm_search_daily_events (
    event_date, organisation_scope_id, mode, surface, status_class
  )
  WHERE client_id IS NULL;

CREATE OR REPLACE FUNCTION crm_search_uuid_array_is_distinct(p_values UUID[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(
    pg_catalog.cardinality(p_values) = (
      SELECT pg_catalog.count(DISTINCT item)
      FROM pg_catalog.unnest(p_values) AS value(item)
      WHERE item IS NOT NULL
    ),
    FALSE
  )
$$;

CREATE TABLE IF NOT EXISTS crm_search_evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  schema_version TEXT NOT NULL CHECK (schema_version ~ '^crm-search-v[1-9][0-9]*$'),
  dataset_version TEXT NOT NULL CHECK (char_length(dataset_version) BETWEEN 1 AND 160),
  dataset_sha256 TEXT NOT NULL CHECK (dataset_sha256 ~ '^[a-f0-9]{64}$'),
  sealed_judgement_sha256 TEXT NOT NULL CHECK (sealed_judgement_sha256 ~ '^[a-f0-9]{64}$'),
  query_evidence_bundle_sha256 TEXT NOT NULL CHECK (query_evidence_bundle_sha256 ~ '^[a-f0-9]{64}$'),
  preregistration_sha256 TEXT NOT NULL CHECK (preregistration_sha256 ~ '^[a-f0-9]{64}$'),
  adjudication_sha256 TEXT NOT NULL CHECK (adjudication_sha256 ~ '^[a-f0-9]{64}$'),
  implementation_git_sha TEXT NOT NULL
    CHECK (implementation_git_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  artifact_manifest_digest TEXT NOT NULL CHECK (artifact_manifest_digest ~ '^[a-f0-9]{64}$'),
  pages_bundle_digest TEXT NOT NULL CHECK (pages_bundle_digest ~ '^[a-f0-9]{64}$'),
  worker_bundle_digest TEXT NOT NULL CHECK (worker_bundle_digest ~ '^[a-f0-9]{64}$'),
  binding_manifest_digest TEXT NOT NULL CHECK (binding_manifest_digest ~ '^[a-f0-9]{64}$'),
  preview_pages_deployment_id TEXT CHECK (
    preview_pages_deployment_id IS NULL OR char_length(preview_pages_deployment_id) BETWEEN 1 AND 200
  ),
  preview_worker_deployment_id TEXT CHECK (
    preview_worker_deployment_id IS NULL OR char_length(preview_worker_deployment_id) BETWEEN 1 AND 200
  ),
  model_id TEXT NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 240),
  pooling TEXT NOT NULL CHECK (pooling = 'cls'),
  tokenizer_revision TEXT NOT NULL CHECK (char_length(tokenizer_revision) BETWEEN 1 AND 200),
  document_builder_revision TEXT NOT NULL CHECK (char_length(document_builder_revision) BETWEEN 1 AND 200),
  ranking_revision TEXT NOT NULL CHECK (char_length(ranking_revision) BETWEEN 1 AND 200),
  threshold_revision TEXT NOT NULL CHECK (char_length(threshold_revision) BETWEEN 1 AND 200),
  provider_contract_digest TEXT NOT NULL CHECK (provider_contract_digest ~ '^[a-f0-9]{64}$'),
  environment TEXT NOT NULL CHECK (environment IN ('test', 'preview')),
  load_protocol_digest TEXT NOT NULL CHECK (load_protocol_digest ~ '^[a-f0-9]{64}$'),
  rate_card_id UUID NOT NULL REFERENCES crm_search_rate_cards(id) ON DELETE RESTRICT,
  implementation_author_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  fixture_author_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  judgement_author_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  domain_reviewer_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  adjudicator_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  runner_id UUID NOT NULL,
  development_query_count INTEGER NOT NULL CHECK (development_query_count >= 180),
  metric_bundle JSONB NOT NULL CHECK (
    jsonb_typeof(metric_bundle) = 'object' AND octet_length(metric_bundle::TEXT) <= 32768
  ),
  gate_passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (
    organisation_scope_id, dataset_sha256, sealed_judgement_sha256,
    query_evidence_bundle_sha256, implementation_git_sha, schema_version
  ),
  CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '14 days'),
  CHECK (public.crm_search_uuid_array_is_distinct(domain_reviewer_ids)),
  CHECK (cardinality(domain_reviewer_ids) >= 0),
  CHECK (NOT (implementation_author_ids && judgement_author_ids)),
  CHECK (NOT (fixture_author_ids && judgement_author_ids))
);

CREATE TABLE IF NOT EXISTS crm_search_evaluation_query_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id UUID NOT NULL
    REFERENCES crm_search_evaluation_runs(id) ON DELETE RESTRICT,
  query_key_digest TEXT NOT NULL CHECK (query_key_digest ~ '^[a-f0-9]{64}$'),
  client_key_digest TEXT NOT NULL CHECK (client_key_digest ~ '^[a-f0-9]{64}$'),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'company', 'opportunity')),
  strata TEXT[] NOT NULL CHECK (cardinality(strata) BETWEEN 1 AND 16),
  keyword_ndcg10 NUMERIC(8,7) NOT NULL CHECK (keyword_ndcg10 BETWEEN 0 AND 1),
  assist_ndcg10 NUMERIC(8,7) NOT NULL CHECK (assist_ndcg10 BETWEEN 0 AND 1),
  keyword_mrr NUMERIC(8,7) NOT NULL CHECK (keyword_mrr BETWEEN 0 AND 1),
  assist_mrr NUMERIC(8,7) NOT NULL CHECK (assist_mrr BETWEEN 0 AND 1),
  keyword_false_positive BOOLEAN NOT NULL,
  assist_false_positive BOOLEAN NOT NULL,
  cross_client_leakage_count INTEGER NOT NULL DEFAULT 0 CHECK (cross_client_leakage_count >= 0),
  unauthorized_leakage_count INTEGER NOT NULL DEFAULT 0 CHECK (unauthorized_leakage_count >= 0),
  deleted_record_leakage_count INTEGER NOT NULL DEFAULT 0 CHECK (deleted_record_leakage_count >= 0),
  semantic_added_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (semantic_added_latency_ms >= 0),
  keyword_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (keyword_latency_ms >= 0),
  assist_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (assist_latency_ms >= 0),
  fallback BOOLEAN NOT NULL DEFAULT FALSE,
  late_billed_completion BOOLEAN NOT NULL DEFAULT FALSE,
  off_result_digest TEXT NOT NULL CHECK (off_result_digest ~ '^[a-f0-9]{64}$'),
  shadow_result_digest TEXT NOT NULL CHECK (shadow_result_digest ~ '^[a-f0-9]{64}$'),
  load_stratum TEXT NOT NULL CHECK (load_stratum IN ('cold', 'warm', 'concurrent')),
  observed_p95_concurrency INTEGER NOT NULL CHECK (observed_p95_concurrency >= 0),
  load_concurrency INTEGER NOT NULL CHECK (load_concurrency >= 1),
  stale_record_count INTEGER NOT NULL CHECK (stale_record_count >= 0),
  orphaned_record_count INTEGER NOT NULL CHECK (orphaned_record_count >= 0),
  telemetry_leakage_count INTEGER NOT NULL CHECK (telemetry_leakage_count >= 0),
  telemetry_inspected_at TIMESTAMPTZ NOT NULL,
  reserved_query_usd_micros BIGINT NOT NULL CHECK (reserved_query_usd_micros >= 0),
  query_budget_usd_micros BIGINT NOT NULL CHECK (query_budget_usd_micros >= 0),
  reserved_indexing_usd_micros BIGINT NOT NULL CHECK (reserved_indexing_usd_micros >= 0),
  indexing_budget_usd_micros BIGINT NOT NULL CHECK (indexing_budget_usd_micros >= 0),
  active_vector_count BIGINT NOT NULL CHECK (active_vector_count >= 0),
  candidate_vector_count BIGINT NOT NULL CHECK (candidate_vector_count >= 0),
  retiring_vector_count BIGINT NOT NULL CHECK (retiring_vector_count >= 0),
  sentinel_vector_count BIGINT NOT NULL CHECK (sentinel_vector_count >= 0),
  deletion_pending_vector_count BIGINT NOT NULL CHECK (deletion_pending_vector_count >= 0),
  forecast_vector_count BIGINT NOT NULL CHECK (forecast_vector_count >= 0),
  vector_capacity BIGINT NOT NULL CHECK (vector_capacity >= 0),
  active_namespace_count BIGINT NOT NULL CHECK (active_namespace_count >= 0),
  candidate_namespace_count BIGINT NOT NULL CHECK (candidate_namespace_count >= 0),
  retiring_namespace_count BIGINT NOT NULL CHECK (retiring_namespace_count >= 0),
  sentinel_namespace_count BIGINT NOT NULL CHECK (sentinel_namespace_count >= 0),
  deletion_pending_namespace_count BIGINT NOT NULL CHECK (
    deletion_pending_namespace_count >= 0
  ),
  forecast_namespace_count BIGINT NOT NULL CHECK (forecast_namespace_count >= 0),
  namespace_capacity BIGINT NOT NULL CHECK (namespace_capacity >= 0),
  shadow_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  shadow_client_id UUID,
  shadow_observed_at TIMESTAMPTZ,
  shadow_sampling_digest TEXT CHECK (
    shadow_sampling_digest IS NULL OR shadow_sampling_digest ~ '^[a-f0-9]{64}$'
  ),
  shadow_sample_bucket INTEGER CHECK (
    shadow_sample_bucket IS NULL OR shadow_sample_bucket BETWEEN 0 AND 9999
  ),
  shadow_sample_threshold INTEGER CHECK (
    shadow_sample_threshold IS NULL OR shadow_sample_threshold BETWEEN 1 AND 10000
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (evaluation_run_id, query_key_digest),
  CHECK (
    forecast_vector_count = active_vector_count + candidate_vector_count
      + retiring_vector_count + sentinel_vector_count + deletion_pending_vector_count
  ),
  CHECK (
    forecast_namespace_count = active_namespace_count + candidate_namespace_count
      + retiring_namespace_count + sentinel_namespace_count
      + deletion_pending_namespace_count
  ),
  CHECK (
    shadow_eligible = FALSE
    OR (
      shadow_observed_at IS NOT NULL AND shadow_client_id IS NOT NULL
      AND shadow_sampling_digest IS NOT NULL
      AND shadow_sample_bucket IS NOT NULL
      AND shadow_sample_threshold IS NOT NULL
      AND shadow_sample_bucket < shadow_sample_threshold
    )
  )
);

CREATE TABLE IF NOT EXISTS crm_search_evaluation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id UUID NOT NULL
    REFERENCES crm_search_evaluation_runs(id) ON DELETE RESTRICT,
  approved_by UUID NOT NULL,
  planned_policy_updater UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  evidence_hash TEXT NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (evaluation_run_id, approved_by),
  CHECK (approved_by <> planned_policy_updater),
  CHECK (expires_at > approved_at AND expires_at <= approved_at + INTERVAL '14 days')
);

CREATE TABLE IF NOT EXISTS crm_search_evaluation_approval_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL UNIQUE
    REFERENCES crm_search_evaluation_approvals(id) ON DELETE RESTRICT,
  revoked_by UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS crm_search_evaluation_approval_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL UNIQUE
    REFERENCES crm_search_evaluation_approvals(id) ON DELETE RESTRICT,
  consumed_by UUID NOT NULL,
  consumption_kind TEXT NOT NULL CHECK (consumption_kind = 'client_assist'),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS crm_search_change_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type TEXT NOT NULL CHECK (approval_type IN (
    'resource_provision', 'production_migration', 'production_deploy',
    'client_indexing', 'client_shadow', 'client_assist'
  )),
  environment TEXT NOT NULL CHECK (environment IN ('preview', 'production')),
  implementation_git_sha TEXT NOT NULL
    CHECK (implementation_git_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  artifact_manifest_digest TEXT NOT NULL CHECK (artifact_manifest_digest ~ '^[a-f0-9]{64}$'),
  pages_bundle_digest TEXT CHECK (pages_bundle_digest IS NULL OR pages_bundle_digest ~ '^[a-f0-9]{64}$'),
  worker_bundle_digest TEXT CHECK (worker_bundle_digest IS NULL OR worker_bundle_digest ~ '^[a-f0-9]{64}$'),
  binding_manifest_digest TEXT NOT NULL CHECK (binding_manifest_digest ~ '^[a-f0-9]{64}$'),
  evidence_bundle_hash TEXT NOT NULL CHECK (evidence_bundle_hash ~ '^[a-f0-9]{64}$'),
  load_protocol_digest TEXT CHECK (
    load_protocol_digest IS NULL OR load_protocol_digest ~ '^[a-f0-9]{64}$'
  ),
  provider_contract_digest TEXT CHECK (
    provider_contract_digest IS NULL OR provider_contract_digest ~ '^[a-f0-9]{64}$'
  ),
  rate_card_id UUID REFERENCES crm_search_rate_cards(id) ON DELETE RESTRICT,
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('global', 'client')),
  client_id UUID,
  maximum_cost_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (maximum_cost_usd_micros >= 0),
  active_vector_count BIGINT CHECK (active_vector_count IS NULL OR active_vector_count >= 0),
  candidate_vector_count BIGINT CHECK (candidate_vector_count IS NULL OR candidate_vector_count >= 0),
  retiring_vector_count BIGINT CHECK (retiring_vector_count IS NULL OR retiring_vector_count >= 0),
  sentinel_vector_count BIGINT CHECK (sentinel_vector_count IS NULL OR sentinel_vector_count >= 0),
  deletion_pending_vector_count BIGINT CHECK (
    deletion_pending_vector_count IS NULL OR deletion_pending_vector_count >= 0
  ),
  forecast_vector_count BIGINT CHECK (forecast_vector_count IS NULL OR forecast_vector_count >= 0),
  vector_capacity BIGINT CHECK (vector_capacity IS NULL OR vector_capacity > 0),
  active_namespace_count BIGINT CHECK (
    active_namespace_count IS NULL OR active_namespace_count >= 0
  ),
  candidate_namespace_count BIGINT CHECK (
    candidate_namespace_count IS NULL OR candidate_namespace_count >= 0
  ),
  retiring_namespace_count BIGINT CHECK (
    retiring_namespace_count IS NULL OR retiring_namespace_count >= 0
  ),
  sentinel_namespace_count BIGINT CHECK (
    sentinel_namespace_count IS NULL OR sentinel_namespace_count >= 0
  ),
  deletion_pending_namespace_count BIGINT CHECK (
    deletion_pending_namespace_count IS NULL OR deletion_pending_namespace_count >= 0
  ),
  forecast_namespace_count BIGINT CHECK (
    forecast_namespace_count IS NULL OR forecast_namespace_count >= 0
  ),
  namespace_capacity BIGINT CHECK (namespace_capacity IS NULL OR namespace_capacity > 0),
  expected_control_revision BIGINT CHECK (expected_control_revision IS NULL OR expected_control_revision >= 0),
  expected_policy_revision BIGINT CHECK (expected_policy_revision IS NULL OR expected_policy_revision >= 0),
  expected_deployment_approval_id UUID,
  target_schema_version TEXT CHECK (
    target_schema_version IS NULL OR target_schema_version ~ '^crm-search-v[1-9][0-9]*$'
  ),
  requested_action TEXT CHECK (requested_action IS NULL OR requested_action IN (
    'enable_indexing', 'restore_indexing_readiness', 'policy_indexing',
    'configure_candidate', 'promote_candidate', 'retire_schema'
  )),
  approved_by UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  imported_provenance_hash TEXT CHECK (
    imported_provenance_hash IS NULL OR imported_provenance_hash ~ '^[a-f0-9]{64}$'
  ),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  CHECK (
    (scope_kind = 'global' AND client_id IS NULL)
    OR (scope_kind = 'client' AND client_id IS NOT NULL)
  ),
  CHECK (expires_at > issued_at),
  CHECK (approval_type <> 'client_assist' OR scope_kind = 'client'),
  CHECK (
    approval_type <> 'client_indexing'
    OR (target_schema_version IS NOT NULL AND requested_action IS NOT NULL)
  ),
  CHECK (
    approval_type NOT IN ('client_indexing', 'client_shadow', 'client_assist')
    OR (
      scope_kind = 'client'
      AND pages_bundle_digest IS NOT NULL
      AND worker_bundle_digest IS NOT NULL
      AND load_protocol_digest IS NOT NULL
      AND provider_contract_digest IS NOT NULL
      AND rate_card_id IS NOT NULL
      AND expected_control_revision IS NOT NULL
      AND expected_policy_revision IS NOT NULL
      AND expected_deployment_approval_id IS NOT NULL
      AND (approval_type <> 'client_indexing' OR (
        active_vector_count IS NOT NULL
        AND candidate_vector_count IS NOT NULL
        AND retiring_vector_count IS NOT NULL
        AND sentinel_vector_count IS NOT NULL
        AND deletion_pending_vector_count IS NOT NULL
        AND forecast_vector_count IS NOT NULL
        AND vector_capacity IS NOT NULL
        AND active_namespace_count IS NOT NULL
        AND candidate_namespace_count IS NOT NULL
        AND retiring_namespace_count IS NOT NULL
        AND sentinel_namespace_count IS NOT NULL
        AND deletion_pending_namespace_count IS NOT NULL
        AND forecast_namespace_count IS NOT NULL
        AND namespace_capacity IS NOT NULL
        AND forecast_vector_count = active_vector_count + candidate_vector_count + retiring_vector_count + sentinel_vector_count + deletion_pending_vector_count
        AND forecast_namespace_count = active_namespace_count + candidate_namespace_count + retiring_namespace_count + sentinel_namespace_count + deletion_pending_namespace_count
        AND forecast_vector_count * 5 < vector_capacity * 4
        AND forecast_namespace_count * 5 < namespace_capacity * 4
      ))
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_change_approvals_exact_authority
  ON crm_search_change_approvals (
    approval_type, environment, implementation_git_sha, artifact_manifest_digest,
    organisation_scope_id,
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(expected_control_revision, -1),
    COALESCE(expected_policy_revision, -1),
    COALESCE(expected_deployment_approval_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(target_schema_version, ''), COALESCE(requested_action, ''),
    approved_by
  );

CREATE TABLE IF NOT EXISTS crm_search_change_approval_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL UNIQUE
    REFERENCES crm_search_change_approvals(id) ON DELETE RESTRICT,
  revoked_by UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS crm_search_change_approval_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL UNIQUE
    REFERENCES crm_search_change_approvals(id) ON DELETE RESTRICT,
  consumed_by UUID NOT NULL,
  consumption_kind TEXT NOT NULL CHECK (
    consumption_kind IN (
      'global_control', 'policy_transition', 'candidate_configuration',
      'candidate_promotion', 'retiring_completion', 'dormant_deployment'
    )
  ),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION crm_search_guard_change_approval_revocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.approval_id::TEXT, 351)
  );
  PERFORM 1 FROM public.crm_search_change_approvals
  WHERE id = NEW.approval_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search change approval not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.crm_search_change_approval_consumptions
    WHERE approval_id = NEW.approval_id
  ) THEN
    RAISE EXCEPTION 'consumed CRM search change approval cannot be revoked';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_change_approval_revocation
  ON crm_search_change_approval_revocations;
CREATE TRIGGER crm_search_guard_change_approval_revocation
  BEFORE INSERT ON crm_search_change_approval_revocations
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_change_approval_revocation();

CREATE OR REPLACE FUNCTION crm_search_guard_evaluation_approval_revocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.approval_id::TEXT, 352)
  );
  PERFORM 1 FROM public.crm_search_evaluation_approvals
  WHERE id = NEW.approval_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search evaluation approval not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.crm_search_evaluation_approval_consumptions
    WHERE approval_id = NEW.approval_id
  ) THEN
    RAISE EXCEPTION 'consumed CRM search evaluation approval cannot be revoked';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_evaluation_approval_revocation
  ON crm_search_evaluation_approval_revocations;
CREATE TRIGGER crm_search_guard_evaluation_approval_revocation
  BEFORE INSERT ON crm_search_evaluation_approval_revocations
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_evaluation_approval_revocation();

CREATE TABLE IF NOT EXISTS crm_search_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID,
  event_type TEXT NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{2,119}$'),
  actor_id UUID,
  correlation_id UUID NOT NULL,
  operation_id UUID,
  entity_type TEXT CHECK (entity_type IS NULL OR entity_type IN ('person', 'company', 'opportunity')),
  entity_id UUID,
  reason TEXT CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 10 AND 2000),
  evidence_hash TEXT CHECK (evidence_hash IS NULL OR evidence_hash ~ '^[a-f0-9]{64}$'),
  details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(details) = 'object'
    AND octet_length(details::TEXT) <= 8192
    AND public.crm_search_json_schema_is_safe(details, 'audit_details')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS crm_search_audit_log_default
  PARTITION OF crm_search_audit_log DEFAULT;

CREATE INDEX IF NOT EXISTS crm_search_audit_log_scope_created
  ON crm_search_audit_log (organisation_scope_id, client_id, created_at DESC);

CREATE OR REPLACE FUNCTION crm_search_dead_letter_transition_allowed(
  p_origin TEXT,
  p_from TEXT,
  p_to TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_origin = 'cloudflare_transport' THEN CASE p_from
      WHEN 'open' THEN p_to IN ('open', 'transport_retry_requested', 'resolved', 'dismissed')
      WHEN 'transport_retry_requested' THEN p_to IN ('transport_retry_requested', 'open', 'resolved', 'dismissed')
      WHEN 'resolved' THEN p_to = 'resolved'
      WHEN 'dismissed' THEN p_to = 'dismissed'
      ELSE FALSE
    END
    WHEN p_origin = 'provider_confirmation' THEN CASE p_from
      WHEN 'open' THEN p_to IN ('open', 'confirmation_reconcile_requested', 'resolved', 'dismissed')
      WHEN 'confirmation_reconcile_requested' THEN p_to IN ('confirmation_reconcile_requested', 'open', 'resolved', 'dismissed')
      WHEN 'resolved' THEN p_to = 'resolved'
      WHEN 'dismissed' THEN p_to = 'dismissed'
      ELSE FALSE
    END
    ELSE FALSE
  END
$$;

CREATE TABLE IF NOT EXISTS crm_search_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  origin TEXT NOT NULL
    CHECK (origin IN ('cloudflare_transport', 'provider_confirmation')),
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 1000),
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_class TEXT NOT NULL CHECK (error_class ~ '^[a-z][a-z0-9_]{1,119}$'),
  resolution_state TEXT NOT NULL DEFAULT 'open',
  resolver_id UUID,
  resolution_reason TEXT CHECK (
    resolution_reason IS NULL OR char_length(btrim(resolution_reason)) BETWEEN 10 AND 2000
  ),
  resolved_at TIMESTAMPTZ,
  audit_log_id UUID,
  audit_log_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  FOREIGN KEY (audit_log_created_at, audit_log_id)
    REFERENCES crm_search_audit_log(created_at, id) ON DELETE RESTRICT,
  UNIQUE (operation_id),
  CHECK (last_failed_at >= first_failed_at),
  CHECK (
    (origin = 'cloudflare_transport' AND resolution_state IN (
      'open', 'transport_retry_requested', 'resolved', 'dismissed'
    ))
    OR (origin = 'provider_confirmation' AND resolution_state IN (
      'open', 'confirmation_reconcile_requested', 'resolved', 'dismissed'
    ))
  ),
  CHECK (
    resolution_state NOT IN ('resolved', 'dismissed')
    OR (resolver_id IS NOT NULL AND resolution_reason IS NOT NULL
      AND resolved_at IS NOT NULL AND retention_expires_at IS NOT NULL)
  ),
  CHECK ((audit_log_id IS NULL) = (audit_log_created_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_dead_letters_one_origin
  ON crm_search_dead_letters (operation_id);

CREATE INDEX IF NOT EXISTS crm_search_dead_letters_open
  ON crm_search_dead_letters (origin, first_failed_at, operation_id)
  WHERE resolution_state NOT IN ('resolved', 'dismissed');

CREATE TABLE IF NOT EXISTS crm_search_client_teardowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  policy_revision BIGINT NOT NULL CHECK (policy_revision >= 0),
  namespace TEXT NOT NULL CHECK (
    namespace ~ '^[A-Za-z0-9_-]{1,64}$' AND octet_length(namespace) <= 64
  ),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'deleting', 'provider_pending', 'confirmed', 'failed')),
  provider_deletion_state TEXT NOT NULL DEFAULT 'not_started'
    CHECK (provider_deletion_state IN ('not_started', 'pending', 'partially_confirmed', 'confirmed_absent', 'failed')),
  requested_by UUID NOT NULL,
  request_reason TEXT NOT NULL CHECK (char_length(btrim(request_reason)) BETWEEN 10 AND 2000),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deletion_deadline_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  client_deactivated_at TIMESTAMPTZ,
  client_deleted_at TIMESTAMPTZ,
  source_high_watermark BIGINT NOT NULL DEFAULT 0 CHECK (source_high_watermark >= 0),
  ledger_manifest_hash TEXT NOT NULL CHECK (ledger_manifest_hash ~ '^[a-f0-9]{64}$'),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  CHECK (completed_at IS NULL OR state = 'confirmed'),
  CHECK (state <> 'confirmed' OR provider_deletion_state = 'confirmed_absent')
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_client_teardowns_one_active
  ON crm_search_client_teardowns (organisation_scope_id, client_id)
  WHERE state IN ('pending', 'deleting', 'provider_pending', 'failed');

CREATE TABLE IF NOT EXISTS crm_search_teardown_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teardown_id UUID NOT NULL
    REFERENCES crm_search_client_teardowns(id) ON DELETE RESTRICT,
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'company', 'opportunity')),
  entity_id UUID NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version ~ '^crm-search-v[1-9][0-9]*$'),
  vector_id TEXT NOT NULL CHECK (
    vector_id ~ '^[A-Za-z0-9_-]{1,64}$' AND octet_length(vector_id) <= 64
  ),
  namespace TEXT NOT NULL CHECK (
    namespace ~ '^[A-Za-z0-9_-]{1,64}$' AND octet_length(namespace) <= 64
  ),
  source_revision BIGINT NOT NULL CHECK (source_revision >= 1),
  deletion_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (deletion_state IN ('pending', 'provider_pending', 'confirmed_absent', 'failed')),
  provider_mutation_id TEXT CHECK (
    provider_mutation_id IS NULL OR char_length(provider_mutation_id) BETWEEN 1 AND 256
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 1000),
  last_error_class TEXT CHECK (
    last_error_class IS NULL OR last_error_class ~ '^[a-z][a-z0-9_]{1,119}$'
  ),
  confirmed_absent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (teardown_id, schema_version, vector_id),
  CHECK (deletion_state <> 'confirmed_absent' OR confirmed_absent_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS crm_search_retention_high_watermarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table TEXT NOT NULL CHECK (target_table ~ '^crm_search_[a-z0-9_]{1,96}$'),
  partition_name TEXT NOT NULL CHECK (partition_name ~ '^crm_search_[a-z0-9_]{1,96}$'),
  last_expire_through TIMESTAMPTZ NOT NULL DEFAULT '-infinity'::TIMESTAMPTZ,
  pending_expire_through TIMESTAMPTZ,
  last_attestation_hash TEXT NOT NULL DEFAULT repeat('0', 64)
    CHECK (last_attestation_hash ~ '^[a-f0-9]{64}$'),
  high_watermark_hash TEXT NOT NULL CHECK (high_watermark_hash ~ '^[a-f0-9]{64}$'),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_table, partition_name)
);

CREATE TABLE IF NOT EXISTS crm_search_retention_delete_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backend_pid INTEGER NOT NULL,
  transaction_id BIGINT NOT NULL,
  target_relation_oid OID NOT NULL,
  partition_relation_oid OID NOT NULL,
  candidate_ids UUID[] NOT NULL CHECK (
    cardinality(candidate_ids) BETWEEN 1 AND 5000
    AND public.crm_search_uuid_array_is_distinct(candidate_ids)
  ),
  computed_manifest_hash TEXT NOT NULL CHECK (computed_manifest_hash ~ '^[a-f0-9]{64}$'),
  attestation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (backend_pid, transaction_id, partition_relation_oid)
);

CREATE TABLE IF NOT EXISTS crm_search_retention_attestations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  target_table TEXT NOT NULL CHECK (target_table ~ '^crm_search_[a-z0-9_]{1,96}$'),
  partition_name TEXT NOT NULL CHECK (partition_name ~ '^crm_search_[a-z0-9_]{1,96}$'),
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  row_count BIGINT NOT NULL CHECK (row_count >= 0),
  prior_attestation_hash TEXT NOT NULL CHECK (prior_attestation_hash ~ '^[a-f0-9]{64}$'),
  deletion_manifest_hash TEXT NOT NULL CHECK (deletion_manifest_hash ~ '^[a-f0-9]{64}$'),
  attestation_hash TEXT NOT NULL CHECK (attestation_hash ~ '^[a-f0-9]{64}$'),
  executor_id UUID NOT NULL,
  secondary_approver_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  PRIMARY KEY (created_at, id),
  UNIQUE (created_at, attestation_hash),
  CHECK (range_end >= range_start),
  CHECK (secondary_approver_id IS NULL OR secondary_approver_id <> executor_id)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS crm_search_retention_attestations_default
  PARTITION OF crm_search_retention_attestations DEFAULT;

CREATE INDEX IF NOT EXISTS crm_search_retention_attestations_chain
  ON crm_search_retention_attestations (target_table, partition_name, created_at, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'crm_search_policies_evaluation_run_fk'
      AND conrelid = 'crm_search_policies'::REGCLASS
  ) THEN
    ALTER TABLE crm_search_policies
      ADD CONSTRAINT crm_search_policies_evaluation_run_fk
      FOREIGN KEY (approved_evaluation_run_id)
      REFERENCES crm_search_evaluation_runs(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'crm_search_policies_active_teardown_fk'
      AND conrelid = 'crm_search_policies'::REGCLASS
  ) THEN
    ALTER TABLE crm_search_policies
      ADD CONSTRAINT crm_search_policies_active_teardown_fk
      FOREIGN KEY (active_teardown_id)
      REFERENCES crm_search_client_teardowns(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_policy_transition_allowed(
  p_from TEXT,
  p_to TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE p_from
    WHEN 'off' THEN p_to IN ('off', 'indexing', 'teardown_pending')
    WHEN 'indexing' THEN p_to IN ('indexing', 'off', 'shadow', 'teardown_pending')
    WHEN 'shadow' THEN p_to IN ('shadow', 'off', 'assist', 'teardown_pending')
    WHEN 'assist' THEN p_to IN ('assist', 'shadow', 'off', 'teardown_pending')
    WHEN 'teardown_pending' THEN p_to IN ('teardown_pending', 'off')
    ELSE FALSE
  END
$$;

CREATE OR REPLACE FUNCTION crm_search_client_advisory_lock_key(
  p_organisation_scope_id UUID,
  p_client_id UUID
)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT pg_catalog.hashtextextended(
    pg_catalog.concat_ws('|', p_organisation_scope_id::TEXT, p_client_id::TEXT),
    350
  )
$$;

CREATE OR REPLACE FUNCTION crm_search_guard_organisation_scope_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND ROW(NEW.id, NEW.scope_key, NEW.scope_kind, NEW.identity_locked_at, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.scope_key, OLD.scope_kind, OLD.identity_locked_at, OLD.created_at) THEN
    RAISE EXCEPTION 'CRM search organisation scope identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_organisation_scope_identity
  ON crm_search_organisation_scopes;
CREATE TRIGGER crm_search_guard_organisation_scope_identity
  BEFORE UPDATE ON crm_search_organisation_scopes
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_organisation_scope_identity();

CREATE OR REPLACE FUNCTION crm_search_operation_identity_hash(p_operation crm_search_operations)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public.crm_search_projection_hash(pg_catalog.concat_ws(
    '|', p_operation.organisation_scope_id::TEXT, p_operation.client_id::TEXT,
    p_operation.entity_type, p_operation.entity_id::TEXT, p_operation.schema_version,
    p_operation.source_revision::TEXT, p_operation.source_event_sequence::TEXT,
    p_operation.desired_action, p_operation.vector_id, p_operation.namespace,
    COALESCE(p_operation.content_hash, ''), COALESCE(p_operation.confirmation_tag, ''),
    COALESCE(p_operation.confirmation_key_version, ''),
    p_operation.control_revision::TEXT, COALESCE(p_operation.successor_of::TEXT, '')
  ))
$$;

CREATE OR REPLACE FUNCTION crm_search_terminal_replacement_satisfied(
  p_terminal_operation_id UUID,
  p_require_confirmed_delete BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  WITH RECURSIVE replacement_chain AS (
    SELECT operation.id, operation.state, operation.desired_action
    FROM public.crm_search_operations operation
    WHERE operation.successor_of = p_terminal_operation_id
    UNION
    SELECT successor.id, successor.state, successor.desired_action
    FROM public.crm_search_operations successor
    JOIN replacement_chain parent ON successor.successor_of = parent.id
  )
  SELECT EXISTS (
    SELECT 1 FROM replacement_chain replacement
    WHERE replacement.state = 'confirmed'
      AND (NOT p_require_confirmed_delete OR replacement.desired_action = 'delete')
  )
$$;

CREATE OR REPLACE FUNCTION crm_search_operation_converged(
  p_operation_id UUID,
  p_require_confirmed_delete BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  operation_row public.crm_search_operations%ROWTYPE;
BEGIN
  SELECT * INTO operation_row
  FROM public.crm_search_operations
  WHERE id = p_operation_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_require_confirmed_delete THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.crm_search_operations later_delete
      WHERE later_delete.organisation_scope_id = operation_row.organisation_scope_id
        AND later_delete.client_id = operation_row.client_id
        AND later_delete.entity_type = operation_row.entity_type
        AND later_delete.entity_id = operation_row.entity_id
        AND later_delete.schema_version = operation_row.schema_version
        AND later_delete.desired_action = 'delete'
        AND later_delete.state = 'confirmed'
        AND (
          later_delete.source_event_sequence > operation_row.source_event_sequence
          OR later_delete.id = operation_row.id
          OR later_delete.successor_of = operation_row.id
        )
    ) OR (
      operation_row.state = 'terminal_dead_letter'
      AND public.crm_search_terminal_replacement_satisfied(operation_row.id, TRUE)
    );
  END IF;

  RETURN operation_row.state = 'confirmed'
    OR operation_row.state = 'superseded'
    OR (
      operation_row.state = 'terminal_dead_letter'
      AND public.crm_search_terminal_replacement_satisfied(operation_row.id, FALSE)
    );
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_guard_operation_admission()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_parent public.crm_search_operations%ROWTYPE;
  v_recovery_origin TEXT;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.concat_ws(
      '|', NEW.organisation_scope_id::TEXT, NEW.client_id::TEXT,
      NEW.entity_type, NEW.entity_id::TEXT, NEW.schema_version
    ),
    350
  ));

  IF NEW.successor_of IS NULL
     AND (NEW.provider_admitted_at IS NOT NULL
       OR NEW.admission_identity_hash IS NOT NULL
       OR NEW.provider_mutation_id IS NOT NULL
       OR NEW.provider_accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'CRM search provider evidence and admission markers are server controlled';
  END IF;

  IF NEW.successor_of IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.crm_search_operations operation
      WHERE operation.organisation_scope_id = NEW.organisation_scope_id
        AND operation.client_id = NEW.client_id
        AND operation.entity_type = NEW.entity_type
        AND operation.entity_id = NEW.entity_id
        AND operation.schema_version = NEW.schema_version
        AND operation.state NOT IN ('confirmed', 'superseded')
        AND (
          operation.state <> 'terminal_dead_letter'
          OR NOT public.crm_search_terminal_replacement_satisfied(operation.id, FALSE)
        )
        AND (
          operation.provider_admitted_at IS NOT NULL
          OR operation.successor_of IS NOT NULL
        )
    ) THEN
      RAISE EXCEPTION 'accepted CRM search operation requires one explicit successor';
    END IF;
  ELSE
    SELECT * INTO v_parent
    FROM public.crm_search_operations
    WHERE id = NEW.successor_of
    FOR UPDATE;
    IF NOT FOUND
       OR ROW(
         v_parent.organisation_scope_id, v_parent.client_id, v_parent.entity_type,
         v_parent.entity_id, v_parent.schema_version
       ) IS DISTINCT FROM ROW(
         NEW.organisation_scope_id, NEW.client_id, NEW.entity_type,
         NEW.entity_id, NEW.schema_version
       ) THEN
      RAISE EXCEPTION 'CRM search successor must reference the current same-key admitted operation';
    END IF;

    IF v_parent.state = 'terminal_dead_letter' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.crm_search_terminal_replacement_authorizations auth_row
        WHERE auth_row.backend_pid = pg_catalog.pg_backend_pid()
          AND auth_row.transaction_id = pg_catalog.txid_current()
          AND auth_row.replacement_operation_id = NEW.id
          AND auth_row.terminal_operation_id = v_parent.id
      ) OR public.crm_search_terminal_replacement_satisfied(v_parent.id, FALSE) THEN
        RAISE EXCEPTION 'terminal CRM search operation requires one audited replacement';
      END IF;
      SELECT dead_letter.origin INTO v_recovery_origin
      FROM public.crm_search_dead_letters dead_letter
      WHERE dead_letter.operation_id = v_parent.id
        AND dead_letter.resolution_state = 'open';
      IF v_recovery_origin = 'provider_confirmation' THEN
        IF v_parent.provider_admitted_at IS NULL
           OR NEW.state <> 'provider_pending'
           OR NEW.control_revision IS DISTINCT FROM v_parent.control_revision
           OR NEW.provider_admitted_at IS DISTINCT FROM v_parent.provider_admitted_at
           OR NEW.provider_mutation_id IS DISTINCT FROM v_parent.provider_mutation_id
           OR NEW.provider_accepted_at IS DISTINCT FROM v_parent.provider_accepted_at
           OR NEW.admission_identity_hash IS DISTINCT FROM
              public.crm_search_operation_identity_hash(NEW) THEN
          RAISE EXCEPTION 'provider_confirmation replacement must be born admitted with frozen provider evidence';
        END IF;
      ELSIF v_recovery_origin = 'cloudflare_transport' THEN
        IF NEW.state <> 'pending_transport'
           OR NEW.provider_admitted_at IS NOT NULL
           OR NEW.admission_identity_hash IS NOT NULL
           OR NEW.provider_mutation_id IS NOT NULL
           OR NEW.provider_accepted_at IS NOT NULL THEN
          RAISE EXCEPTION 'transport replacement cannot forge provider admission evidence';
        END IF;
      ELSE
        RAISE EXCEPTION 'terminal CRM search operation lacks an exact dead-letter origin';
      END IF;
    ELSIF v_parent.provider_admitted_at IS NULL
       OR v_parent.state IN ('confirmed', 'superseded') THEN
      RAISE EXCEPTION 'CRM search successor must reference the current same-key admitted operation';
    ELSIF NEW.provider_admitted_at IS NOT NULL
       OR NEW.admission_identity_hash IS NOT NULL
       OR NEW.provider_mutation_id IS NOT NULL
       OR NEW.provider_accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'CRM search successor provider evidence and admission markers are server controlled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_operation_admission ON crm_search_operations;
CREATE TRIGGER crm_search_guard_operation_admission
  BEFORE INSERT ON crm_search_operations
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_operation_admission();

CREATE OR REPLACE FUNCTION crm_search_guard_operation_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.state IN ('confirmed', 'superseded', 'terminal_dead_letter') THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'terminal CRM search operation evidence is immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT public.crm_search_operation_state_transition_allowed(OLD.state, NEW.state) THEN
    RAISE EXCEPTION 'invalid CRM search operation transition from % to %', OLD.state, NEW.state;
  END IF;

  IF ROW(
       NEW.id, NEW.organisation_scope_id, NEW.client_id, NEW.entity_type,
       NEW.entity_id, NEW.schema_version, NEW.successor_of, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.organisation_scope_id, OLD.client_id, OLD.entity_type,
       OLD.entity_id, OLD.schema_version, OLD.successor_of, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'CRM search operation ordering identity is immutable';
  END IF;

  IF OLD.provider_admitted_at IS NULL
     AND (NEW.provider_mutation_id IS NOT NULL
       OR NEW.provider_accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'CRM search provider evidence is server controlled until governed admission';
  END IF;

  IF OLD.provider_mutation_id IS NOT NULL
     AND ROW(NEW.provider_mutation_id, NEW.provider_accepted_at)
       IS DISTINCT FROM ROW(OLD.provider_mutation_id, OLD.provider_accepted_at) THEN
    RAISE EXCEPTION 'accepted CRM search provider evidence is immutable';
  END IF;
  IF OLD.provider_admitted_at IS NOT NULL
     AND OLD.provider_mutation_id IS NULL
     AND (NEW.provider_mutation_id IS NOT NULL OR NEW.provider_accepted_at IS NOT NULL)
     AND (NEW.state <> 'provider_pending'
       OR NEW.provider_mutation_id IS NULL OR NEW.provider_accepted_at IS NULL) THEN
    RAISE EXCEPTION 'CRM search provider acceptance must atomically enter provider_pending';
  END IF;

  IF OLD.provider_admitted_at IS NOT NULL
     AND ROW(
       NEW.organisation_scope_id, NEW.client_id, NEW.entity_type, NEW.entity_id,
       NEW.schema_version, NEW.source_revision, NEW.source_event_sequence,
       NEW.desired_action, NEW.vector_id, NEW.namespace, NEW.content_hash,
       NEW.confirmation_tag, NEW.confirmation_key_version, NEW.control_revision,
       NEW.successor_of
     ) IS DISTINCT FROM ROW(
       OLD.organisation_scope_id, OLD.client_id, OLD.entity_type, OLD.entity_id,
       OLD.schema_version, OLD.source_revision, OLD.source_event_sequence,
       OLD.desired_action, OLD.vector_id, OLD.namespace, OLD.content_hash,
       OLD.confirmation_tag, OLD.confirmation_key_version, OLD.control_revision,
       OLD.successor_of
     ) THEN
    RAISE EXCEPTION 'admitted CRM search operation identity is immutable';
  END IF;

  IF OLD.provider_admitted_at IS NOT NULL
     AND (NEW.provider_admitted_at IS DISTINCT FROM OLD.provider_admitted_at
       OR NEW.admission_identity_hash IS DISTINCT FROM OLD.admission_identity_hash
       OR NEW.admission_identity_hash IS DISTINCT FROM public.crm_search_operation_identity_hash(NEW)) THEN
    RAISE EXCEPTION 'admitted CRM search operation marker is immutable';
  END IF;

  IF NEW.state = 'admitted' AND OLD.state <> 'admitted' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.crm_search_operation_admission_authorizations auth_row
      WHERE auth_row.backend_pid = pg_catalog.pg_backend_pid()
        AND auth_row.transaction_id = pg_catalog.txid_current()
        AND auth_row.operation_id = NEW.id
        AND auth_row.control_revision = NEW.control_revision
    ) THEN
      RAISE EXCEPTION 'CRM search provider admission requires the governed admission function';
    END IF;
    IF OLD.provider_admitted_at IS NULL THEN
      NEW.provider_admitted_at := NOW();
      NEW.admission_identity_hash := public.crm_search_operation_identity_hash(NEW);
    END IF;
  ELSIF OLD.provider_admitted_at IS NULL
        AND (NEW.provider_admitted_at IS NOT NULL OR NEW.admission_identity_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'CRM search provider admission marker is server controlled';
  END IF;

  IF NEW.state = 'confirmed' AND OLD.state <> 'confirmed' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := NOW();
  END IF;
  IF NEW.state = 'confirmed' AND NEW.retention_expires_at IS NULL THEN
    NEW.retention_expires_at := NOW() + INTERVAL '90 days';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_operation_transition ON crm_search_operations;
CREATE TRIGGER crm_search_guard_operation_transition
  BEFORE UPDATE ON crm_search_operations
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_operation_transition();

CREATE OR REPLACE FUNCTION crm_search_admit_operation(
  p_operation_id UUID,
  p_expected_state TEXT,
  p_expected_control_revision BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_operation public.crm_search_operations%ROWTYPE;
  v_control public.crm_search_global_control%ROWTYPE;
  v_authorization_id UUID;
  v_state TEXT;
BEGIN
  SELECT * INTO v_operation
  FROM public.crm_search_operations
  WHERE id = p_operation_id
  FOR NO KEY UPDATE;
  IF NOT FOUND OR v_operation.state IS DISTINCT FROM p_expected_state
     OR v_operation.state NOT IN ('processing', 'retryable') THEN
    RAISE EXCEPTION 'CRM search operation is not ready for provider admission';
  END IF;

  SELECT * INTO v_control
  FROM public.crm_search_global_control
  WHERE organisation_scope_id = v_operation.organisation_scope_id
  FOR SHARE;
  IF NOT FOUND OR v_control.revision IS DISTINCT FROM p_expected_control_revision
     OR (v_operation.desired_action = 'upsert' AND v_control.state <> 'enabled')
     OR (v_operation.desired_action = 'delete'
       AND v_control.state NOT IN ('enabled', 'delete_only')) THEN
    RAISE EXCEPTION 'CRM search global control does not admit this provider operation';
  END IF;
  IF v_operation.provider_admitted_at IS NOT NULL
     AND (
       v_operation.control_revision IS DISTINCT FROM p_expected_control_revision
       OR v_operation.admission_identity_hash IS DISTINCT FROM
          public.crm_search_operation_identity_hash(v_operation)
     ) THEN
    RAISE EXCEPTION 'CRM search admitted operation no longer matches its frozen identity';
  END IF;
  IF v_operation.provider_mutation_id IS NOT NULL
     OR v_operation.provider_accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'CRM search admission requires provider_mutation_id and provider_accepted_at to be NULL';
  END IF;

  INSERT INTO public.crm_search_operation_admission_authorizations (
    backend_pid, transaction_id, operation_id, control_revision
  ) VALUES (
    pg_catalog.pg_backend_pid(), pg_catalog.txid_current(),
    p_operation_id, p_expected_control_revision
  ) RETURNING id INTO v_authorization_id;

  UPDATE public.crm_search_operations
  SET state = 'admitted',
      control_revision = p_expected_control_revision
  WHERE id = p_operation_id
    AND state = p_expected_state
  RETURNING state INTO v_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search operation admission CAS failed';
  END IF;

  DELETE FROM public.crm_search_operation_admission_authorizations
  WHERE id = v_authorization_id;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_guard_dead_letter_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF ROW(
       NEW.id, NEW.organisation_scope_id, NEW.client_id, NEW.operation_id,
       NEW.origin, NEW.first_failed_at, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.organisation_scope_id, OLD.client_id, OLD.operation_id,
       OLD.origin, OLD.first_failed_at, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'CRM search dead-letter identity is immutable';
  END IF;

  IF NOT public.crm_search_dead_letter_transition_allowed(
    OLD.origin, OLD.resolution_state, NEW.resolution_state
  ) THEN
    RAISE EXCEPTION 'invalid CRM search dead-letter transition for % origin', OLD.origin;
  END IF;

  IF NEW.resolution_state IS DISTINCT FROM OLD.resolution_state
     AND (NEW.audit_log_id IS NULL OR NEW.audit_log_created_at IS NULL) THEN
    RAISE EXCEPTION 'CRM search dead-letter operator action requires immutable audit linkage';
  END IF;

  IF NEW.resolution_state IN ('resolved', 'dismissed')
     AND OLD.resolution_state NOT IN ('resolved', 'dismissed') THEN
    IF NEW.resolver_id IS NULL OR NEW.resolution_reason IS NULL THEN
      RAISE EXCEPTION 'CRM search dead-letter resolution requires resolver and reason';
    END IF;
    NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
    NEW.retention_expires_at := COALESCE(
      NEW.retention_expires_at,
      NEW.resolved_at + INTERVAL '180 days'
    );
  END IF;

  IF OLD.resolution_state IN ('resolved', 'dismissed') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'resolved CRM search dead-letter evidence is immutable';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_dead_letter_transition ON crm_search_dead_letters;
CREATE TRIGGER crm_search_guard_dead_letter_transition
  BEFORE UPDATE ON crm_search_dead_letters
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_dead_letter_transition();

CREATE OR REPLACE FUNCTION crm_search_transition_dead_letter(
  p_dead_letter_id UUID,
  p_expected_state TEXT,
  p_next_state TEXT,
  p_actor_id UUID,
  p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  current_row public.crm_search_dead_letters%ROWTYPE;
  v_audit_log_id UUID;
  v_audit_log_created_at TIMESTAMPTZ;
BEGIN
  IF p_actor_id IS NULL OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search dead-letter transition requires bounded actor reason';
  END IF;
  SELECT * INTO current_row
  FROM public.crm_search_dead_letters
  WHERE id = p_dead_letter_id
  FOR UPDATE;
  IF NOT FOUND OR current_row.resolution_state IS DISTINCT FROM p_expected_state THEN
    RAISE EXCEPTION 'CRM search dead-letter state changed';
  END IF;
  IF NOT public.crm_search_dead_letter_transition_allowed(
    current_row.origin, current_row.resolution_state, p_next_state
  ) THEN
    RAISE EXCEPTION 'invalid CRM search dead-letter transition';
  END IF;

  INSERT INTO public.crm_search_audit_log (
    organisation_scope_id, client_id, event_type, actor_id, correlation_id,
    operation_id, reason, details
  ) VALUES (
    current_row.organisation_scope_id, current_row.client_id,
    'dead_letter.operator_action', p_actor_id, gen_random_uuid(),
    current_row.operation_id, btrim(p_reason),
    jsonb_build_object(
      'origin', current_row.origin,
      'fromState', current_row.resolution_state,
      'toState', p_next_state,
      'operationId', current_row.operation_id
    )
  ) RETURNING id, created_at INTO v_audit_log_id, v_audit_log_created_at;

  UPDATE public.crm_search_dead_letters
  SET resolution_state = p_next_state,
      resolver_id = CASE WHEN p_next_state IN ('resolved', 'dismissed') THEN p_actor_id ELSE resolver_id END,
      resolution_reason = CASE WHEN p_next_state IN ('resolved', 'dismissed') THEN btrim(p_reason) ELSE resolution_reason END,
      audit_log_id = v_audit_log_id,
      audit_log_created_at = v_audit_log_created_at
  WHERE id = p_dead_letter_id;
  RETURN p_next_state;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_replace_terminal_operation(
  p_terminal_operation_id UUID,
  p_source_revision BIGINT,
  p_source_event_sequence BIGINT,
  p_desired_action TEXT,
  p_vector_id TEXT,
  p_namespace TEXT,
  p_content_hash TEXT,
  p_confirmation_tag TEXT,
  p_confirmation_key_version TEXT,
  p_actor_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_terminal public.crm_search_operations%ROWTYPE;
  v_dead_letter public.crm_search_dead_letters%ROWTYPE;
  v_replacement public.crm_search_operations%ROWTYPE;
  v_replacement_id UUID := gen_random_uuid();
  v_audit_id UUID := gen_random_uuid();
  v_audit_created_at TIMESTAMPTZ := NOW();
  v_authorization_id UUID;
  v_next_resolution_state TEXT;
BEGIN
  IF p_actor_id IS NULL
     OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search terminal replacement requires bounded actor reason';
  END IF;

  SELECT * INTO v_terminal
  FROM public.crm_search_operations
  WHERE id = p_terminal_operation_id
  FOR UPDATE;
  IF NOT FOUND OR v_terminal.state <> 'terminal_dead_letter' THEN
    RAISE EXCEPTION 'CRM search replacement requires terminal dead-letter operation evidence';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.concat_ws(
      '|', v_terminal.organisation_scope_id::TEXT, v_terminal.client_id::TEXT,
      v_terminal.entity_type, v_terminal.entity_id::TEXT, v_terminal.schema_version
    ),
    350
  ));

  SELECT * INTO v_dead_letter
  FROM public.crm_search_dead_letters
  WHERE operation_id = v_terminal.id
    AND resolution_state = 'open'
  FOR UPDATE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.crm_search_operations replacement
    WHERE replacement.successor_of = v_terminal.id
  ) THEN
    RAISE EXCEPTION 'CRM search terminal operation already has recovery evidence';
  END IF;

  IF v_dead_letter.origin = 'provider_confirmation' AND ROW(
       p_source_revision, p_source_event_sequence, p_desired_action, p_vector_id,
       p_namespace, p_content_hash, p_confirmation_tag, p_confirmation_key_version
     ) IS DISTINCT FROM ROW(
       v_terminal.source_revision, v_terminal.source_event_sequence,
       v_terminal.desired_action, v_terminal.vector_id, v_terminal.namespace,
       v_terminal.content_hash, v_terminal.confirmation_tag,
       v_terminal.confirmation_key_version
     ) THEN
    RAISE EXCEPTION 'provider-confirmation recovery must preserve the accepted identity';
  ELSIF v_dead_letter.origin = 'cloudflare_transport'
        AND (p_source_revision < v_terminal.source_revision
          OR p_source_event_sequence < v_terminal.source_event_sequence) THEN
    RAISE EXCEPTION 'transport recovery cannot replace terminal work with older intent';
  END IF;

  v_next_resolution_state := CASE v_dead_letter.origin
    WHEN 'cloudflare_transport' THEN 'transport_retry_requested'
    WHEN 'provider_confirmation' THEN 'confirmation_reconcile_requested'
  END;

  v_replacement.id := v_replacement_id;
  v_replacement.organisation_scope_id := v_terminal.organisation_scope_id;
  v_replacement.client_id := v_terminal.client_id;
  v_replacement.entity_type := v_terminal.entity_type;
  v_replacement.entity_id := v_terminal.entity_id;
  v_replacement.schema_version := v_terminal.schema_version;
  v_replacement.source_revision := p_source_revision;
  v_replacement.source_event_sequence := p_source_event_sequence;
  v_replacement.desired_action := p_desired_action;
  v_replacement.vector_id := p_vector_id;
  v_replacement.namespace := p_namespace;
  v_replacement.content_hash := p_content_hash;
  v_replacement.confirmation_tag := p_confirmation_tag;
  v_replacement.confirmation_key_version := p_confirmation_key_version;
  v_replacement.successor_of := v_terminal.id;
  IF v_dead_letter.origin = 'provider_confirmation' THEN
    v_replacement.state := 'provider_pending';
    v_replacement.control_revision := v_terminal.control_revision;
    v_replacement.provider_mutation_id := v_terminal.provider_mutation_id;
    v_replacement.provider_accepted_at := v_terminal.provider_accepted_at;
    v_replacement.provider_admitted_at := v_terminal.provider_admitted_at;
    v_replacement.admission_identity_hash :=
      public.crm_search_operation_identity_hash(v_replacement);
  ELSE
    v_replacement.state := 'pending_transport';
    v_replacement.control_revision := 0;
  END IF;

  INSERT INTO public.crm_search_audit_log (
    id, organisation_scope_id, client_id, event_type, actor_id, correlation_id,
    operation_id, reason, details, created_at
  ) VALUES (
    v_audit_id, v_terminal.organisation_scope_id, v_terminal.client_id,
    'operation.terminal_replacement', p_actor_id, gen_random_uuid(),
    v_terminal.id, btrim(p_reason),
    jsonb_build_object(
      'action', 'terminal_replacement', 'origin', v_dead_letter.origin,
      'fromState', v_dead_letter.resolution_state,
      'toState', v_next_resolution_state, 'operationId', v_replacement_id
    ),
    v_audit_created_at
  );

  INSERT INTO public.crm_search_terminal_replacement_authorizations (
    backend_pid, transaction_id, replacement_operation_id,
    terminal_operation_id, audit_log_id
  ) VALUES (
    pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), v_replacement_id,
    v_terminal.id, v_audit_id
  ) RETURNING id INTO v_authorization_id;

  INSERT INTO public.crm_search_operations (
    id, organisation_scope_id, client_id, entity_type, entity_id, schema_version,
    source_revision, source_event_sequence, desired_action, vector_id, namespace,
    content_hash, confirmation_tag, confirmation_key_version, control_revision,
    state, successor_of, provider_mutation_id, provider_accepted_at,
    provider_admitted_at, admission_identity_hash
  ) VALUES (
    v_replacement.id, v_replacement.organisation_scope_id, v_replacement.client_id,
    v_replacement.entity_type, v_replacement.entity_id, v_replacement.schema_version,
    v_replacement.source_revision, v_replacement.source_event_sequence,
    v_replacement.desired_action, v_replacement.vector_id, v_replacement.namespace,
    v_replacement.content_hash, v_replacement.confirmation_tag,
    v_replacement.confirmation_key_version, v_replacement.control_revision,
    v_replacement.state, v_replacement.successor_of, v_replacement.provider_mutation_id,
    v_replacement.provider_accepted_at, v_replacement.provider_admitted_at,
    v_replacement.admission_identity_hash
  );

  DELETE FROM public.crm_search_terminal_replacement_authorizations
  WHERE id = v_authorization_id;

  UPDATE public.crm_search_dead_letters
  SET resolution_state = v_next_resolution_state,
      audit_log_id = v_audit_id,
      audit_log_created_at = v_audit_created_at
  WHERE id = v_dead_letter.id AND resolution_state = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search terminal replacement dead-letter CAS failed';
  END IF;
  RETURN v_replacement_id;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_guard_evaluation_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  run_row public.crm_search_evaluation_runs%ROWTYPE;
BEGIN
  SELECT * INTO run_row
  FROM public.crm_search_evaluation_runs
  WHERE id = NEW.evaluation_run_id
  FOR KEY SHARE;

  IF NOT FOUND OR run_row.gate_passed = FALSE OR run_row.expires_at <= NOW() THEN
    RAISE EXCEPTION 'CRM search evaluation run is not approvable';
  END IF;
  IF NEW.approved_by = run_row.runner_id
     OR NEW.approved_by = ANY(run_row.implementation_author_ids)
     OR NEW.approved_by = ANY(run_row.fixture_author_ids)
     OR NEW.approved_by = ANY(run_row.judgement_author_ids)
     OR NEW.planned_policy_updater = run_row.runner_id THEN
    RAISE EXCEPTION 'CRM search evaluation approval violates actor separation';
  END IF;
  IF NEW.evidence_hash IS DISTINCT FROM run_row.query_evidence_bundle_sha256 THEN
    RAISE EXCEPTION 'CRM search evaluation approval evidence does not match run';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_search_guard_evaluation_approval
  ON crm_search_evaluation_approvals;
CREATE TRIGGER crm_search_guard_evaluation_approval
  BEFORE INSERT ON crm_search_evaluation_approvals
  FOR EACH ROW EXECUTE FUNCTION crm_search_guard_evaluation_approval();

CREATE OR REPLACE FUNCTION crm_search_record_evaluation_run(
  p_organisation_scope_id UUID,
  p_schema_version TEXT,
  p_dataset_version TEXT,
  p_dataset_sha256 TEXT,
  p_sealed_judgement_sha256 TEXT,
  p_preregistration_sha256 TEXT,
  p_adjudication_sha256 TEXT,
  p_implementation_git_sha TEXT,
  p_artifact_manifest_digest TEXT,
  p_pages_bundle_digest TEXT,
  p_worker_bundle_digest TEXT,
  p_binding_manifest_digest TEXT,
  p_preview_pages_deployment_id TEXT,
  p_preview_worker_deployment_id TEXT,
  p_model_id TEXT,
  p_pooling TEXT,
  p_tokenizer_revision TEXT,
  p_document_builder_revision TEXT,
  p_ranking_revision TEXT,
  p_threshold_revision TEXT,
  p_provider_contract_digest TEXT,
  p_environment TEXT,
  p_load_protocol_digest TEXT,
  p_rate_card_id UUID,
  p_implementation_author_ids UUID[],
  p_fixture_author_ids UUID[],
  p_judgement_author_ids UUID[],
  p_domain_reviewer_ids UUID[],
  p_adjudicator_ids UUID[],
  p_runner_id UUID,
  p_development_query_count INTEGER,
  p_query_evidence JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_run_id UUID := gen_random_uuid();
  v_created_at TIMESTAMPTZ := NOW();
  v_query_evidence_bundle_sha256 TEXT;
  v_total BIGINT;
  v_clients BIGINT;
  v_natural BIGINT;
  v_exact_identifier BIGINT;
  v_no_result BIGINT;
  v_cross_client BIGINT;
  v_leakage BIGINT;
  v_keyword_natural_ndcg NUMERIC;
  v_assist_natural_ndcg NUMERIC;
  v_keyword_natural_mrr NUMERIC;
  v_assist_natural_mrr NUMERIC;
  v_keyword_exact_ndcg NUMERIC;
  v_assist_exact_ndcg NUMERIC;
  v_keyword_exact_mrr NUMERIC;
  v_assist_exact_mrr NUMERIC;
  v_keyword_no_result_false_positives NUMERIC;
  v_assist_no_result_false_positives NUMERIC;
  v_natural_delta_ci_lower NUMERIC := -1;
  v_natural_deltas NUMERIC[] := ARRAY[]::NUMERIC[];
  v_semantic_added_latency_p95 NUMERIC;
  v_assist_latency_p95 NUMERIC;
  v_keyword_latency_p95 NUMERIC;
  v_fallback_rate NUMERIC;
  v_late_completion_rate NUMERIC;
  v_min_queries_per_client BIGINT := 0;
  v_min_queries_per_entity BIGINT := 0;
  v_entity_count BIGINT := 0;
  v_max_client_entity_ndcg_regression NUMERIC := 1;
  v_max_client_entity_mrr_regression NUMERIC := 1;
  v_off_shadow_equal BOOLEAN := FALSE;
  v_load_strata_count BIGINT := 0;
  v_load_safe BOOLEAN := FALSE;
  v_client_entity_cells BIGINT := 0;
  v_client_entity_load_cells BIGINT := 0;
  v_min_client_entity_queries BIGINT := 0;
  v_max_load_semantic_latency_p95 NUMERIC := 999999;
  v_max_load_assist_overhead_p95 NUMERIC := 999999;
  v_max_load_fallback_rate NUMERIC := 1;
  v_max_load_late_completion_rate NUMERIC := 1;
  v_load_thresholds_safe BOOLEAN := FALSE;
  v_convergence_safe BOOLEAN := FALSE;
  v_telemetry_safe BOOLEAN := FALSE;
  v_budgets_safe BOOLEAN := FALSE;
  v_capacity_safe BOOLEAN := FALSE;
  v_shadow_clients BIGINT := 0;
  v_shadow_min_per_client BIGINT := 0;
  v_shadow_days_consecutive BOOLEAN := FALSE;
  v_shadow_clients_approved BOOLEAN := FALSE;
  v_shadow_sampling_valid BOOLEAN := FALSE;
  v_metric_bundle JSONB;
  v_gate_passed BOOLEAN;
BEGIN
  IF p_runner_id IS NULL
     OR p_development_query_count IS NULL OR p_development_query_count < 180
     OR p_preregistration_sha256 IS NULL OR p_adjudication_sha256 IS NULL
     OR p_binding_manifest_digest IS NULL OR p_rate_card_id IS NULL
     OR p_provider_contract_digest IS NULL
     OR jsonb_typeof(p_query_evidence) <> 'array'
     OR jsonb_array_length(p_query_evidence) = 0 THEN
    RAISE EXCEPTION 'CRM search evaluation requires granular evidence, development split, and runner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_query_evidence) AS evidence(item)
    WHERE jsonb_typeof(item) <> 'object'
       OR item - ARRAY[
         'queryKeyDigest', 'clientKeyDigest', 'entityType', 'strata',
         'keywordNdcg10', 'assistNdcg10', 'keywordMrr', 'assistMrr',
         'keywordFalsePositive', 'assistFalsePositive',
         'crossClientLeakageCount', 'unauthorizedLeakageCount',
         'deletedRecordLeakageCount', 'semanticAddedLatencyMs',
         'keywordLatencyMs', 'assistLatencyMs', 'fallback',
         'lateBilledCompletion', 'offResultDigest', 'shadowResultDigest',
         'loadStratum', 'observedP95Concurrency', 'loadConcurrency',
         'staleRecordCount', 'orphanedRecordCount', 'telemetryLeakageCount',
         'telemetryInspectedAt', 'reservedQueryUsdMicros', 'queryBudgetUsdMicros',
         'reservedIndexingUsdMicros', 'indexingBudgetUsdMicros',
         'activeVectorCount', 'candidateVectorCount', 'retiringVectorCount',
         'sentinelVectorCount', 'deletionPendingVectorCount',
         'forecastVectorCount', 'vectorCapacity',
         'activeNamespaceCount', 'candidateNamespaceCount', 'retiringNamespaceCount',
         'sentinelNamespaceCount', 'deletionPendingNamespaceCount',
         'forecastNamespaceCount', 'namespaceCapacity', 'shadowEligible',
         'shadowClientId', 'shadowObservedAt', 'shadowSamplingDigest',
         'shadowSampleBucket', 'shadowSampleThreshold'
       ]::TEXT[] <> '{}'::JSONB
       OR item->>'entityType' NOT IN ('person', 'company', 'opportunity')
       OR item->>'loadStratum' NOT IN ('cold', 'warm', 'concurrent')
  ) THEN
    RAISE EXCEPTION 'CRM search evaluation contains unknown, aggregate-only, or invalid evidence';
  END IF;

  IF NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_implementation_author_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_fixture_author_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_judgement_author_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_adjudicator_ids, ARRAY[]::UUID[])) THEN
    RAISE EXCEPTION 'CRM search evaluation actor lists must be distinct and non-null';
  END IF;

  v_query_evidence_bundle_sha256 := public.crm_search_projection_hash(p_query_evidence::TEXT);

  WITH evidence AS (
    SELECT
      item->>'clientKeyDigest' AS client_key_digest,
      item->>'entityType' AS entity_type,
      ARRAY(SELECT value FROM jsonb_array_elements_text(item->'strata')) AS strata,
      (item->>'keywordNdcg10')::NUMERIC AS keyword_ndcg,
      (item->>'assistNdcg10')::NUMERIC AS assist_ndcg,
      (item->>'keywordMrr')::NUMERIC AS keyword_mrr,
      (item->>'assistMrr')::NUMERIC AS assist_mrr,
      (item->>'keywordFalsePositive')::BOOLEAN AS keyword_false_positive,
      (item->>'assistFalsePositive')::BOOLEAN AS assist_false_positive,
      COALESCE((item->>'crossClientLeakageCount')::BIGINT, 0) AS cross_client_leakage,
      COALESCE((item->>'unauthorizedLeakageCount')::BIGINT, 0) AS unauthorized_leakage,
      COALESCE((item->>'deletedRecordLeakageCount')::BIGINT, 0) AS deleted_leakage,
      (item->>'semanticAddedLatencyMs')::NUMERIC AS semantic_added_latency,
      (item->>'keywordLatencyMs')::NUMERIC AS keyword_latency,
      (item->>'assistLatencyMs')::NUMERIC AS assist_latency,
      (item->>'fallback')::BOOLEAN AS fallback,
      (item->>'lateBilledCompletion')::BOOLEAN AS late_completion,
      item->>'offResultDigest' AS off_result_digest,
      item->>'shadowResultDigest' AS shadow_result_digest,
      item->>'loadStratum' AS load_stratum,
      (item->>'observedP95Concurrency')::INTEGER AS observed_p95_concurrency,
      (item->>'loadConcurrency')::INTEGER AS load_concurrency,
      (item->>'staleRecordCount')::INTEGER AS stale_record_count,
      (item->>'orphanedRecordCount')::INTEGER AS orphaned_record_count,
      (item->>'telemetryLeakageCount')::INTEGER AS telemetry_leakage_count,
      NULLIF(item->>'telemetryInspectedAt', '')::TIMESTAMPTZ AS telemetry_inspected_at,
      (item->>'reservedQueryUsdMicros')::BIGINT AS reserved_query_usd_micros,
      (item->>'queryBudgetUsdMicros')::BIGINT AS query_budget_usd_micros,
      (item->>'reservedIndexingUsdMicros')::BIGINT AS reserved_indexing_usd_micros,
      (item->>'indexingBudgetUsdMicros')::BIGINT AS indexing_budget_usd_micros,
      (item->>'activeVectorCount')::BIGINT AS active_vector_count,
      (item->>'candidateVectorCount')::BIGINT AS candidate_vector_count,
      (item->>'retiringVectorCount')::BIGINT AS retiring_vector_count,
      (item->>'sentinelVectorCount')::BIGINT AS sentinel_vector_count,
      (item->>'deletionPendingVectorCount')::BIGINT AS deletion_pending_vector_count,
      (item->>'forecastVectorCount')::BIGINT AS forecast_vector_count,
      (item->>'vectorCapacity')::BIGINT AS vector_capacity,
      (item->>'activeNamespaceCount')::BIGINT AS active_namespace_count,
      (item->>'candidateNamespaceCount')::BIGINT AS candidate_namespace_count,
      (item->>'retiringNamespaceCount')::BIGINT AS retiring_namespace_count,
      (item->>'sentinelNamespaceCount')::BIGINT AS sentinel_namespace_count,
      (item->>'deletionPendingNamespaceCount')::BIGINT AS deletion_pending_namespace_count,
      (item->>'forecastNamespaceCount')::BIGINT AS forecast_namespace_count,
      (item->>'namespaceCapacity')::BIGINT AS namespace_capacity
    FROM jsonb_array_elements(p_query_evidence) AS query(item)
  )
  SELECT
    COUNT(*), COUNT(DISTINCT client_key_digest),
    COUNT(*) FILTER (WHERE 'natural_language' = ANY(strata)),
    COUNT(*) FILTER (WHERE strata && ARRAY['exact_name', 'identifier']::TEXT[]),
    COUNT(*) FILTER (WHERE 'no_result' = ANY(strata)),
    COUNT(*) FILTER (WHERE 'cross_client_overlap' = ANY(strata)),
    COALESCE(SUM(cross_client_leakage + unauthorized_leakage + deleted_leakage), 0),
    COALESCE(AVG(keyword_ndcg) FILTER (WHERE 'natural_language' = ANY(strata)), 0),
    COALESCE(AVG(assist_ndcg) FILTER (WHERE 'natural_language' = ANY(strata)), 0),
    COALESCE(AVG(keyword_mrr) FILTER (WHERE 'natural_language' = ANY(strata)), 0),
    COALESCE(AVG(assist_mrr) FILTER (WHERE 'natural_language' = ANY(strata)), 0),
    COALESCE(AVG(keyword_ndcg) FILTER (WHERE strata && ARRAY['exact_name', 'identifier']::TEXT[]), 0),
    COALESCE(AVG(assist_ndcg) FILTER (WHERE strata && ARRAY['exact_name', 'identifier']::TEXT[]), 0),
    COALESCE(AVG(keyword_mrr) FILTER (WHERE strata && ARRAY['exact_name', 'identifier']::TEXT[]), 0),
    COALESCE(AVG(assist_mrr) FILTER (WHERE strata && ARRAY['exact_name', 'identifier']::TEXT[]), 0),
    COALESCE(AVG(keyword_false_positive::INT) FILTER (WHERE 'no_result' = ANY(strata)), 0),
    COALESCE(AVG(assist_false_positive::INT) FILTER (WHERE 'no_result' = ANY(strata)), 0),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY semantic_added_latency), 0),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY assist_latency), 0),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY keyword_latency), 0),
    COALESCE(AVG(fallback::INT), 0), COALESCE(AVG(late_completion::INT), 0),
    COALESCE(BOOL_AND(off_result_digest = shadow_result_digest), FALSE),
    COUNT(DISTINCT load_stratum),
    COALESCE(BOOL_AND(load_stratum <> 'concurrent' OR load_concurrency >= GREATEST(10, 2 * observed_p95_concurrency)), FALSE),
    COALESCE(BOOL_AND(stale_record_count = 0 AND orphaned_record_count = 0), FALSE),
    COALESCE(BOOL_AND(telemetry_leakage_count = 0 AND telemetry_inspected_at IS NOT NULL), FALSE),
    COALESCE(BOOL_AND(reserved_query_usd_micros <= query_budget_usd_micros
      AND reserved_indexing_usd_micros <= indexing_budget_usd_micros), FALSE),
    COALESCE(BOOL_AND(
      forecast_vector_count = active_vector_count + candidate_vector_count
        + retiring_vector_count + sentinel_vector_count + deletion_pending_vector_count
      AND forecast_namespace_count = active_namespace_count + candidate_namespace_count
        + retiring_namespace_count + sentinel_namespace_count
        + deletion_pending_namespace_count
      AND forecast_vector_count * 5 < vector_capacity * 4
      AND forecast_namespace_count * 5 < namespace_capacity * 4
    ), FALSE)
  INTO
    v_total, v_clients, v_natural, v_exact_identifier, v_no_result, v_cross_client,
    v_leakage, v_keyword_natural_ndcg, v_assist_natural_ndcg,
    v_keyword_natural_mrr, v_assist_natural_mrr,
    v_keyword_exact_ndcg, v_assist_exact_ndcg, v_keyword_exact_mrr, v_assist_exact_mrr,
    v_keyword_no_result_false_positives, v_assist_no_result_false_positives,
    v_semantic_added_latency_p95, v_assist_latency_p95, v_keyword_latency_p95,
    v_fallback_rate, v_late_completion_rate, v_off_shadow_equal,
    v_load_strata_count, v_load_safe, v_convergence_safe, v_telemetry_safe,
    v_budgets_safe, v_capacity_safe
  FROM evidence;

  WITH evidence AS (
    SELECT item->>'clientKeyDigest' AS client_key_digest,
           item->>'entityType' AS entity_type,
           item->>'loadStratum' AS load_stratum,
           (item->>'keywordNdcg10')::NUMERIC AS keyword_ndcg,
           (item->>'assistNdcg10')::NUMERIC AS assist_ndcg,
           (item->>'keywordMrr')::NUMERIC AS keyword_mrr,
           (item->>'assistMrr')::NUMERIC AS assist_mrr
    FROM jsonb_array_elements(p_query_evidence) AS query(item)
  ), clients AS (
    SELECT client_key_digest, COUNT(*) AS count FROM evidence GROUP BY client_key_digest
  ), entities AS (
    SELECT entity_type, COUNT(*) AS count FROM evidence GROUP BY entity_type
  ), client_entities AS (
    SELECT client_key_digest, entity_type, COUNT(*) AS count,
           AVG(keyword_ndcg) - AVG(assist_ndcg) AS ndcg_regression,
           AVG(keyword_mrr) - AVG(assist_mrr) AS mrr_regression
    FROM evidence GROUP BY client_key_digest, entity_type
  ), client_entity_load AS (
    SELECT client_key_digest, entity_type, load_stratum, COUNT(*) AS count
    FROM evidence GROUP BY client_key_digest, entity_type, load_stratum
  )
  SELECT
    (SELECT COALESCE(MIN(count), 0) FROM clients),
    (SELECT COALESCE(MIN(count), 0) FROM entities),
    (SELECT COUNT(*) FROM entities),
    (SELECT COALESCE(MAX(ndcg_regression), 1) FROM client_entities),
    (SELECT COALESCE(MAX(mrr_regression), 1) FROM client_entities),
    (SELECT COUNT(*) FROM client_entities),
    (SELECT COUNT(*) FROM client_entity_load),
    (SELECT COALESCE(MIN(count), 0) FROM client_entities)
  INTO v_min_queries_per_client, v_min_queries_per_entity, v_entity_count,
       v_max_client_entity_ndcg_regression, v_max_client_entity_mrr_regression,
       v_client_entity_cells, v_client_entity_load_cells,
       v_min_client_entity_queries;

  WITH evidence AS (
    SELECT item->>'loadStratum' AS load_stratum,
           (item->>'semanticAddedLatencyMs')::NUMERIC AS semantic_added_latency,
           (item->>'keywordLatencyMs')::NUMERIC AS keyword_latency,
           (item->>'assistLatencyMs')::NUMERIC AS assist_latency,
           (item->>'fallback')::BOOLEAN AS fallback,
           (item->>'lateBilledCompletion')::BOOLEAN AS late_completion,
           (item->>'observedP95Concurrency')::INTEGER AS observed_p95_concurrency,
           (item->>'loadConcurrency')::INTEGER AS load_concurrency
    FROM jsonb_array_elements(p_query_evidence) AS query(item)
  ), per_load_stratum AS (
    SELECT load_stratum,
           percentile_cont(0.95) WITHIN GROUP (
             ORDER BY semantic_added_latency
           ) AS semantic_latency_p95,
           percentile_cont(0.95) WITHIN GROUP (
             ORDER BY assist_latency
           ) - percentile_cont(0.95) WITHIN GROUP (
             ORDER BY keyword_latency
           ) AS assist_overhead_p95,
           AVG(fallback::INT) AS fallback_rate,
           AVG(late_completion::INT) AS late_completion_rate,
           BOOL_AND(CASE load_stratum
             WHEN 'cold' THEN load_concurrency = 1
             WHEN 'warm' THEN load_concurrency = 1
             WHEN 'concurrent' THEN
               load_concurrency >= GREATEST(10, 2 * observed_p95_concurrency)
             ELSE FALSE
           END) AS credible
    FROM evidence
    GROUP BY load_stratum
  )
  SELECT
    COALESCE(MAX(semantic_latency_p95), 999999),
    COALESCE(MAX(assist_overhead_p95), 999999),
    COALESCE(MAX(fallback_rate), 1),
    COALESCE(MAX(late_completion_rate), 1),
    COALESCE(BOOL_AND(
      semantic_latency_p95 <= 500
      AND assist_overhead_p95 <= 500
      AND fallback_rate <= 0.05
      AND late_completion_rate <= 0.01
      AND credible
    ), FALSE)
  INTO v_max_load_semantic_latency_p95, v_max_load_assist_overhead_p95,
       v_max_load_fallback_rate, v_max_load_late_completion_rate,
       v_load_thresholds_safe
  FROM per_load_stratum;

  SELECT array_agg(
    (item->>'assistNdcg10')::NUMERIC - (item->>'keywordNdcg10')::NUMERIC
    ORDER BY item->>'queryKeyDigest'
  )
  INTO v_natural_deltas
  FROM jsonb_array_elements(p_query_evidence) AS query(item)
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(item->'strata') AS stratum(value)
    WHERE value = 'natural_language'
  );

  WITH bootstrap_means AS (
    SELECT bootstrap.sample_number,
           AVG(v_natural_deltas[
             1 + MOD(
               pg_catalog.hashtextextended(
                 bootstrap.sample_number::TEXT || ':' || draw.draw_number::TEXT
                   || ':' || v_query_evidence_bundle_sha256,
                 354
               ) & 9223372036854775807,
               cardinality(v_natural_deltas)
             )::INTEGER
           ]) AS mean_delta
    FROM generate_series(1, 1000) AS bootstrap(sample_number)
    CROSS JOIN LATERAL generate_series(1, cardinality(v_natural_deltas)) AS draw(draw_number)
    GROUP BY bootstrap.sample_number
  )
  SELECT COALESCE(percentile_cont(0.025) WITHIN GROUP (ORDER BY mean_delta), -1)
  INTO v_natural_delta_ci_lower
  FROM bootstrap_means;

  -- Each draw preserves the paired keyword/assist delta from one sealed query.

  WITH shadow AS (
    SELECT
      (item->>'shadowClientId')::UUID AS client_id,
      (item->>'shadowObservedAt')::TIMESTAMPTZ AS observed_at,
      (item->>'shadowObservedAt')::TIMESTAMPTZ::DATE AS observed_date,
      item->>'shadowSamplingDigest' AS sampling_digest,
      (item->>'shadowSampleBucket')::INTEGER AS sample_bucket,
      (item->>'shadowSampleThreshold')::INTEGER AS sample_threshold
    FROM jsonb_array_elements(p_query_evidence) AS query(item)
    WHERE COALESCE((item->>'shadowEligible')::BOOLEAN, FALSE)
  ), per_client AS (
    SELECT client_id, COUNT(*) AS sample_count, COUNT(DISTINCT observed_date) AS day_count,
           MIN(observed_date) AS first_day, MAX(observed_date) AS last_day,
           MIN(observed_at) AS first_observed_at,
           MAX(observed_at) AS last_observed_at,
           BOOL_AND(
             sampling_digest ~ '^[a-f0-9]{64}$'
             AND sample_bucket BETWEEN 0 AND 9999
             AND sample_threshold BETWEEN 1 AND 10000
             AND sample_bucket < sample_threshold
           ) AS unbiased_sampling
    FROM shadow GROUP BY client_id
  )
  SELECT COUNT(*), COALESCE(MIN(sample_count), 0),
         COALESCE(BOOL_AND(
           day_count = 7 AND last_day - first_day = 6
           AND first_observed_at >= v_created_at - INTERVAL '7 days'
           AND last_observed_at <= v_created_at
         ), FALSE),
         COALESCE(BOOL_AND(EXISTS (
           SELECT 1
           FROM public.crm_search_change_approvals approval
           LEFT JOIN public.crm_search_change_approval_revocations revocation
             ON revocation.approval_id = approval.id
           WHERE approval.approval_type = 'client_shadow'
             AND approval.organisation_scope_id = p_organisation_scope_id
             AND approval.client_id = per_client.client_id
             AND approval.issued_at <= per_client.first_observed_at
             AND approval.expires_at > per_client.last_observed_at
             AND per_client.last_observed_at <= v_created_at
             AND revocation.id IS NULL
         )), FALSE),
         COALESCE(BOOL_AND(unbiased_sampling), FALSE)
  INTO v_shadow_clients, v_shadow_min_per_client, v_shadow_days_consecutive,
       v_shadow_clients_approved, v_shadow_sampling_valid
  FROM per_client;

  v_gate_passed :=
    p_development_query_count >= 180
    AND v_total >= 360 AND v_clients >= 3
    AND v_min_queries_per_client >= 80
    AND v_entity_count = 3 AND v_min_queries_per_entity >= 60
    AND v_client_entity_cells = v_clients * 3
    AND v_client_entity_load_cells = v_clients * 3 * 3
    AND v_min_client_entity_queries >= 1
    AND v_natural >= 120 AND v_exact_identifier >= 60
    AND v_no_result >= 60 AND v_cross_client >= 60
    AND v_leakage = 0 AND v_off_shadow_equal
    AND v_assist_exact_ndcg >= v_keyword_exact_ndcg
    AND v_assist_exact_mrr >= v_keyword_exact_mrr
    AND v_assist_natural_ndcg >= v_keyword_natural_ndcg * 1.10
    AND v_assist_natural_mrr >= v_keyword_natural_mrr
    AND v_assist_no_result_false_positives <= v_keyword_no_result_false_positives
    AND v_max_client_entity_ndcg_regression <= 0.05
    AND v_max_client_entity_mrr_regression <= 0.05
    AND v_natural_delta_ci_lower > 0
    AND v_semantic_added_latency_p95 <= 500
    AND v_assist_latency_p95 <= v_keyword_latency_p95 + 500
    AND v_fallback_rate <= 0.05 AND v_late_completion_rate <= 0.01
    AND v_max_load_semantic_latency_p95 <= 500
    AND v_max_load_assist_overhead_p95 <= 500
    AND v_max_load_fallback_rate <= 0.05
    AND v_max_load_late_completion_rate <= 0.01
    AND v_load_thresholds_safe
    AND v_load_strata_count = 3 AND v_load_safe
    AND v_convergence_safe AND v_telemetry_safe AND v_budgets_safe AND v_capacity_safe
    AND v_shadow_clients >= 3 AND v_shadow_min_per_client >= 200
    AND v_shadow_days_consecutive AND v_shadow_clients_approved
    AND v_shadow_sampling_valid
    AND cardinality(COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[])) >= 2
    AND p_preregistration_sha256 IS NOT NULL AND p_adjudication_sha256 IS NOT NULL
    AND NOT (COALESCE(p_implementation_author_ids, ARRAY[]::UUID[]) && COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]))
    AND NOT (COALESCE(p_fixture_author_ids, ARRAY[]::UUID[]) && COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]))
    AND NOT (COALESCE(p_judgement_author_ids, ARRAY[]::UUID[]) && ARRAY[p_runner_id]::UUID[]);

  v_metric_bundle := jsonb_build_object(
    'queryCount', v_total, 'clientCount', v_clients,
    'minimumQueriesPerClient', v_min_queries_per_client,
    'minimumQueriesPerEntity', v_min_queries_per_entity,
    'naturalDeltaPairedBootstrapLower', v_natural_delta_ci_lower,
    'maximumClientEntityNdcgRegression', v_max_client_entity_ndcg_regression,
    'maximumClientEntityMrrRegression', v_max_client_entity_mrr_regression,
    'clientEntityCells', v_client_entity_cells,
    'clientEntityLoadCells', v_client_entity_load_cells,
    'minimumClientEntityQueries', v_min_client_entity_queries,
    'maximumLoadSemanticLatencyP95', v_max_load_semantic_latency_p95,
    'maximumLoadAssistOverheadP95', v_max_load_assist_overhead_p95,
    'maximumLoadFallbackRate', v_max_load_fallback_rate,
    'maximumLoadLateCompletionRate', v_max_load_late_completion_rate,
    'loadStrataCount', v_load_strata_count, 'shadowClientCount', v_shadow_clients,
    'shadowMinimumPerClient', v_shadow_min_per_client,
    'shadowDaysConsecutive', v_shadow_days_consecutive
  );

  INSERT INTO public.crm_search_evaluation_runs (
    id, organisation_scope_id, schema_version, dataset_version, dataset_sha256,
    sealed_judgement_sha256, query_evidence_bundle_sha256, preregistration_sha256,
    adjudication_sha256, implementation_git_sha, artifact_manifest_digest,
    pages_bundle_digest, worker_bundle_digest, binding_manifest_digest,
    preview_pages_deployment_id, preview_worker_deployment_id, model_id, pooling,
    tokenizer_revision, document_builder_revision, ranking_revision,
    threshold_revision, provider_contract_digest, environment,
    load_protocol_digest, rate_card_id,
    implementation_author_ids, fixture_author_ids, judgement_author_ids,
    domain_reviewer_ids, adjudicator_ids, runner_id, development_query_count,
    metric_bundle, gate_passed, created_at, expires_at, retention_expires_at
  ) VALUES (
    v_run_id, p_organisation_scope_id, p_schema_version, p_dataset_version,
    p_dataset_sha256, p_sealed_judgement_sha256, v_query_evidence_bundle_sha256,
    p_preregistration_sha256, p_adjudication_sha256, p_implementation_git_sha,
    p_artifact_manifest_digest, p_pages_bundle_digest, p_worker_bundle_digest,
    p_binding_manifest_digest, p_preview_pages_deployment_id,
    p_preview_worker_deployment_id, p_model_id, p_pooling, p_tokenizer_revision,
    p_document_builder_revision, p_ranking_revision, p_threshold_revision,
    p_provider_contract_digest, p_environment, p_load_protocol_digest, p_rate_card_id,
    COALESCE(p_implementation_author_ids, ARRAY[]::UUID[]),
    COALESCE(p_fixture_author_ids, ARRAY[]::UUID[]),
    COALESCE(p_judgement_author_ids, ARRAY[]::UUID[]),
    COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]),
    COALESCE(p_adjudicator_ids, ARRAY[]::UUID[]), p_runner_id,
    p_development_query_count, v_metric_bundle, v_gate_passed, v_created_at,
    v_created_at + INTERVAL '14 days', v_created_at + INTERVAL '2 years'
  );

  INSERT INTO public.crm_search_evaluation_query_evidence (
    evaluation_run_id, query_key_digest, client_key_digest, entity_type, strata,
    keyword_ndcg10, assist_ndcg10, keyword_mrr, assist_mrr,
    keyword_false_positive, assist_false_positive, cross_client_leakage_count,
    unauthorized_leakage_count, deleted_record_leakage_count,
    semantic_added_latency_ms, keyword_latency_ms, assist_latency_ms, fallback,
    late_billed_completion, off_result_digest, shadow_result_digest, load_stratum,
    observed_p95_concurrency, load_concurrency, stale_record_count,
    orphaned_record_count, telemetry_leakage_count, telemetry_inspected_at,
    reserved_query_usd_micros, query_budget_usd_micros,
    reserved_indexing_usd_micros, indexing_budget_usd_micros,
    active_vector_count, candidate_vector_count, retiring_vector_count,
    sentinel_vector_count, deletion_pending_vector_count,
    forecast_vector_count, vector_capacity,
    active_namespace_count, candidate_namespace_count,
    retiring_namespace_count, sentinel_namespace_count,
    deletion_pending_namespace_count, forecast_namespace_count, namespace_capacity,
    shadow_eligible, shadow_client_id, shadow_observed_at,
    shadow_sampling_digest, shadow_sample_bucket, shadow_sample_threshold,
    retention_expires_at
  )
  SELECT
    v_run_id, item->>'queryKeyDigest', item->>'clientKeyDigest', item->>'entityType',
    ARRAY(SELECT value FROM jsonb_array_elements_text(item->'strata')),
    (item->>'keywordNdcg10')::NUMERIC, (item->>'assistNdcg10')::NUMERIC,
    (item->>'keywordMrr')::NUMERIC, (item->>'assistMrr')::NUMERIC,
    (item->>'keywordFalsePositive')::BOOLEAN, (item->>'assistFalsePositive')::BOOLEAN,
    (item->>'crossClientLeakageCount')::INTEGER,
    (item->>'unauthorizedLeakageCount')::INTEGER,
    (item->>'deletedRecordLeakageCount')::INTEGER,
    (item->>'semanticAddedLatencyMs')::INTEGER, (item->>'keywordLatencyMs')::INTEGER,
    (item->>'assistLatencyMs')::INTEGER, (item->>'fallback')::BOOLEAN,
    (item->>'lateBilledCompletion')::BOOLEAN, item->>'offResultDigest',
    item->>'shadowResultDigest', item->>'loadStratum',
    (item->>'observedP95Concurrency')::INTEGER, (item->>'loadConcurrency')::INTEGER,
    (item->>'staleRecordCount')::INTEGER, (item->>'orphanedRecordCount')::INTEGER,
    (item->>'telemetryLeakageCount')::INTEGER,
    (item->>'telemetryInspectedAt')::TIMESTAMPTZ,
    (item->>'reservedQueryUsdMicros')::BIGINT, (item->>'queryBudgetUsdMicros')::BIGINT,
    (item->>'reservedIndexingUsdMicros')::BIGINT, (item->>'indexingBudgetUsdMicros')::BIGINT,
    (item->>'activeVectorCount')::BIGINT, (item->>'candidateVectorCount')::BIGINT,
    (item->>'retiringVectorCount')::BIGINT, (item->>'sentinelVectorCount')::BIGINT,
    (item->>'deletionPendingVectorCount')::BIGINT,
    (item->>'forecastVectorCount')::BIGINT, (item->>'vectorCapacity')::BIGINT,
    (item->>'activeNamespaceCount')::BIGINT, (item->>'candidateNamespaceCount')::BIGINT,
    (item->>'retiringNamespaceCount')::BIGINT, (item->>'sentinelNamespaceCount')::BIGINT,
    (item->>'deletionPendingNamespaceCount')::BIGINT,
    (item->>'forecastNamespaceCount')::BIGINT, (item->>'namespaceCapacity')::BIGINT,
    (item->>'shadowEligible')::BOOLEAN, NULLIF(item->>'shadowClientId', '')::UUID,
    NULLIF(item->>'shadowObservedAt', '')::TIMESTAMPTZ,
    NULLIF(item->>'shadowSamplingDigest', ''),
    NULLIF(item->>'shadowSampleBucket', '')::INTEGER,
    NULLIF(item->>'shadowSampleThreshold', '')::INTEGER,
    v_created_at + INTERVAL '2 years'
  FROM jsonb_array_elements(p_query_evidence) AS query(item);

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_retention_target_allowed(p_target_table TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_target_table = ANY(ARRAY[
    'crm_search_schema_versions',
    'crm_search_rate_cards',
    'crm_search_rate_card_revocations',
    'crm_search_operations',
    'crm_search_provider_attempts',
    'crm_search_documents',
    'crm_search_usage_daily',
    'crm_search_usage_reservations',
    'crm_search_events',
    'crm_search_daily_events',
    'crm_search_evaluation_runs',
    'crm_search_evaluation_query_evidence',
    'crm_search_evaluation_approvals',
    'crm_search_evaluation_approval_revocations',
    'crm_search_evaluation_approval_consumptions',
    'crm_search_change_approvals',
    'crm_search_change_approval_revocations',
    'crm_search_change_approval_consumptions',
    'crm_search_audit_log',
    'crm_search_dead_letters',
    'crm_search_client_teardowns',
    'crm_search_teardown_vectors',
    'crm_search_retention_attestations'
  ]::TEXT[])
$$;

CREATE OR REPLACE FUNCTION crm_search_place_legal_hold(
  p_organisation_scope_id UUID,
  p_client_id UUID,
  p_hold_key TEXT,
  p_reason TEXT,
  p_approved_by UUID,
  p_second_approved_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_hold_id UUID;
BEGIN
  IF p_approved_by IS NULL OR p_second_approved_by IS NULL
     OR p_approved_by = p_second_approved_by
     OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search legal hold requires two distinct approvers and a bounded reason';
  END IF;

  INSERT INTO public.crm_search_legal_holds (
    organisation_scope_id, client_id, hold_key, reason, approved_by, second_approved_by
  ) VALUES (
    p_organisation_scope_id, p_client_id, p_hold_key, btrim(p_reason),
    p_approved_by, p_second_approved_by
  )
  RETURNING id INTO v_hold_id;
  RETURN v_hold_id;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_release_legal_hold(
  p_legal_hold_id UUID,
  p_released_by UUID,
  p_second_approved_by UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_release_id UUID;
BEGIN
  IF p_released_by IS NULL OR p_second_approved_by IS NULL
     OR p_released_by = p_second_approved_by
     OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search legal-hold release requires two distinct approvers and a bounded reason';
  END IF;

  PERFORM 1
  FROM public.crm_search_legal_holds
  WHERE id = p_legal_hold_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search legal hold not found';
  END IF;

  INSERT INTO public.crm_search_legal_hold_releases (
    legal_hold_id, released_by, second_approved_by, reason
  ) VALUES (
    p_legal_hold_id, p_released_by, p_second_approved_by, btrim(p_reason)
  )
  RETURNING id INTO v_release_id;
  RETURN v_release_id;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_attach_legal_hold(
  p_legal_hold_id UUID,
  p_target_table TEXT,
  p_target_row_id UUID,
  p_attached_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_locked_target_id UUID;
  v_target_id UUID;
BEGIN
  IF p_attached_by IS NULL OR p_target_row_id IS NULL
     OR NOT public.crm_search_retention_target_allowed(p_target_table) THEN
    RAISE EXCEPTION 'CRM search legal-hold target is not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_search_legal_holds hold_row
    WHERE hold_row.id = p_legal_hold_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.crm_search_legal_hold_releases release
        WHERE release.legal_hold_id = hold_row.id
      )
  ) THEN
    RAISE EXCEPTION 'CRM search legal hold is missing or released';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(p_target_table, 353)
  );

  EXECUTE pg_catalog.format(
    'SELECT id FROM public.%I WHERE id = $1 FOR UPDATE',
    p_target_table
  ) INTO v_locked_target_id USING p_target_row_id;
  IF v_locked_target_id IS NULL THEN
    RAISE EXCEPTION 'CRM search legal-hold target row not found';
  END IF;

  INSERT INTO public.crm_search_legal_hold_targets (
    legal_hold_id, target_table, target_row_id, attached_by
  ) VALUES (
    p_legal_hold_id, p_target_table, p_target_row_id, p_attached_by
  )
  RETURNING id INTO v_target_id;
  RETURN v_target_id;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_expire_governed_rows(
  p_target_table TEXT,
  p_partition_name TEXT,
  p_expire_through TIMESTAMPTZ,
  p_expected_high_watermark_hash TEXT,
  p_deletion_manifest_hash TEXT,
  p_executor_id UUID,
  p_secondary_approver_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_target_oid REGCLASS;
  v_partition_oid REGCLASS;
  v_watermark public.crm_search_retention_high_watermarks%ROWTYPE;
  v_candidate_ids UUID[] := ARRAY[]::UUID[];
  v_row_count BIGINT := 0;
  v_deleted_count BIGINT := 0;
  v_has_remaining BOOLEAN := FALSE;
  v_complete BOOLEAN := FALSE;
  v_authorization_id UUID;
  v_attestation_id UUID := gen_random_uuid();
  v_computed_manifest_hash TEXT;
  v_attestation_hash TEXT;
  v_next_high_watermark_hash TEXT;
BEGIN
  IF NOT public.crm_search_retention_target_allowed(p_target_table)
     OR p_partition_name !~ '^crm_search_[a-z0-9_]{1,96}$'
     OR p_expected_high_watermark_hash !~ '^[a-f0-9]{64}$'
     OR p_deletion_manifest_hash !~ '^[a-f0-9]{64}$'
     OR p_executor_id IS NULL
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 5000
     OR p_expire_through IS NULL OR p_expire_through > NOW() THEN
    RAISE EXCEPTION 'CRM search retention request failed closed validation';
  END IF;
  IF p_target_table = 'crm_search_retention_attestations'
     AND (p_secondary_approver_id IS NULL OR p_secondary_approver_id = p_executor_id) THEN
    RAISE EXCEPTION 'retention-attestation expiry requires a distinct second approver';
  END IF;

  v_target_oid := pg_catalog.to_regclass(pg_catalog.format('public.%I', p_target_table));
  v_partition_oid := pg_catalog.to_regclass(pg_catalog.format('public.%I', p_partition_name));
  IF v_target_oid IS NULL OR v_partition_oid IS NULL THEN
    RAISE EXCEPTION 'CRM search retention table or partition does not exist';
  END IF;
  IF v_partition_oid <> v_target_oid AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_inherits
    WHERE inhparent = v_target_oid AND inhrelid = v_partition_oid
  ) THEN
    RAISE EXCEPTION 'CRM search retention partition is not owned by the target table';
  END IF;

  -- Hold attachment takes the shared form of this same fence before locking a row.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_table, 353)
  );
  EXECUTE pg_catalog.format(
    'LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', p_partition_name
  );

  INSERT INTO public.crm_search_retention_high_watermarks (
    target_table, partition_name, high_watermark_hash
  ) VALUES (p_target_table, p_partition_name, repeat('0', 64))
  ON CONFLICT (target_table, partition_name) DO NOTHING;

  SELECT * INTO v_watermark
  FROM public.crm_search_retention_high_watermarks
  WHERE target_table = p_target_table AND partition_name = p_partition_name
  FOR UPDATE;
  IF v_watermark.high_watermark_hash IS DISTINCT FROM p_expected_high_watermark_hash THEN
    RAISE EXCEPTION 'CRM search retention high-watermark hash changed';
  END IF;
  IF v_watermark.pending_expire_through IS NULL THEN
    IF p_expire_through <= v_watermark.last_expire_through THEN
      RAISE EXCEPTION 'CRM search retention high-watermark must move forward';
    END IF;
  ELSIF p_expire_through IS DISTINCT FROM v_watermark.pending_expire_through THEN
    RAISE EXCEPTION 'CRM search retention must finish the pending cutoff first';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT COALESCE(pg_catalog.array_agg(candidate.id ORDER BY candidate.retention_expires_at, candidate.id), ARRAY[]::UUID[])
       FROM (
         SELECT retained.id, retained.retention_expires_at
         FROM public.%I retained
         WHERE retained.retention_expires_at <= $1
           AND (
             retained.legal_hold_id IS NULL
             OR EXISTS (
               SELECT 1 FROM public.crm_search_legal_hold_releases direct_release
               WHERE direct_release.legal_hold_id = retained.legal_hold_id
             )
           )
           AND NOT EXISTS (
             SELECT 1
             FROM public.crm_search_legal_hold_targets held_target
             LEFT JOIN public.crm_search_legal_hold_releases hold_release
               ON hold_release.legal_hold_id = held_target.legal_hold_id
             WHERE held_target.target_table = $2
               AND held_target.target_row_id = retained.id
               AND hold_release.id IS NULL
           )
         ORDER BY retained.retention_expires_at, retained.id
         LIMIT $3
         FOR UPDATE
       ) candidate',
    p_partition_name
  ) INTO v_candidate_ids USING p_expire_through, p_target_table, p_limit;

  v_row_count := COALESCE(cardinality(v_candidate_ids), 0);
  v_computed_manifest_hash := public.crm_search_projection_hash(pg_catalog.concat_ws(
    '|', p_target_table, p_partition_name, p_expire_through::TEXT,
    COALESCE(array_to_string(v_candidate_ids, ','), '')
  ));
  IF p_deletion_manifest_hash IS DISTINCT FROM v_computed_manifest_hash THEN
    RAISE EXCEPTION 'CRM search retention candidate manifest changed';
  END IF;

  v_attestation_hash := public.crm_search_projection_hash(pg_catalog.concat_ws(
    '|', p_target_table, p_partition_name, v_watermark.last_expire_through::TEXT,
    p_expire_through::TEXT, v_row_count::TEXT, v_watermark.last_attestation_hash,
    v_computed_manifest_hash, p_executor_id::TEXT,
    COALESCE(p_secondary_approver_id::TEXT, '')
  ));
  INSERT INTO public.crm_search_retention_attestations (
    id, target_table, partition_name, range_start, range_end, row_count,
    prior_attestation_hash, deletion_manifest_hash, attestation_hash,
    executor_id, secondary_approver_id
  ) VALUES (
    v_attestation_id, p_target_table, p_partition_name,
    v_watermark.last_expire_through, p_expire_through, v_row_count,
    v_watermark.last_attestation_hash, v_computed_manifest_hash,
    v_attestation_hash, p_executor_id, p_secondary_approver_id
  );

  IF v_row_count > 0 THEN
    INSERT INTO public.crm_search_retention_delete_authorizations (
      backend_pid, transaction_id, target_relation_oid, partition_relation_oid,
      candidate_ids, computed_manifest_hash, attestation_id
    ) VALUES (
      pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), v_target_oid::OID,
      v_partition_oid::OID, v_candidate_ids, v_computed_manifest_hash, v_attestation_id
    ) RETURNING id INTO v_authorization_id;

    EXECUTE pg_catalog.format(
      'DELETE FROM public.%I WHERE id = ANY($1)', p_partition_name
    ) USING v_candidate_ids;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count <> v_row_count THEN
      RAISE EXCEPTION 'CRM search retention deletion count changed';
    END IF;
    DELETE FROM public.crm_search_retention_delete_authorizations
    WHERE id = v_authorization_id;
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM public.%I retained
       WHERE retained.retention_expires_at <= $1
         AND (
           retained.legal_hold_id IS NULL
           OR EXISTS (
             SELECT 1 FROM public.crm_search_legal_hold_releases direct_release
             WHERE direct_release.legal_hold_id = retained.legal_hold_id
           )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.crm_search_legal_hold_targets held_target
           LEFT JOIN public.crm_search_legal_hold_releases hold_release
             ON hold_release.legal_hold_id = held_target.legal_hold_id
           WHERE held_target.target_table = $2
             AND held_target.target_row_id = retained.id
             AND hold_release.id IS NULL
         )
     )', p_partition_name
  ) INTO v_has_remaining USING p_expire_through, p_target_table;
  v_complete := NOT v_has_remaining;

  v_next_high_watermark_hash := public.crm_search_projection_hash(pg_catalog.concat_ws(
    '|', p_target_table, p_partition_name,
    CASE WHEN v_complete THEN p_expire_through ELSE v_watermark.last_expire_through END::TEXT,
    COALESCE(CASE WHEN v_complete THEN NULL ELSE p_expire_through END::TEXT, ''),
    v_attestation_hash, (v_watermark.revision + 1)::TEXT
  ));
  UPDATE public.crm_search_retention_high_watermarks
  SET last_expire_through = CASE WHEN v_complete THEN p_expire_through ELSE last_expire_through END,
      pending_expire_through = CASE WHEN v_complete THEN NULL ELSE p_expire_through END,
      last_attestation_hash = v_attestation_hash,
      high_watermark_hash = v_next_high_watermark_hash,
      revision = revision + 1,
      updated_at = NOW()
  WHERE id = v_watermark.id
    AND high_watermark_hash = p_expected_high_watermark_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search retention high-watermark CAS failed';
  END IF;

  RETURN jsonb_build_object(
    'attestationId', v_attestation_id, 'rowCount', v_row_count,
    'deletionManifestHash', v_computed_manifest_hash,
    'attestationHash', v_attestation_hash,
    'highWatermarkHash', v_next_high_watermark_hash, 'complete', v_complete
  );
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_approval_matches_active_deployment(
  p_approval crm_search_change_approvals,
  p_control crm_search_global_control
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_control.active_deployment_approval_id IS NOT NULL
    AND p_approval.expected_deployment_approval_id = p_control.active_deployment_approval_id
    AND p_approval.environment = p_control.environment
    AND p_approval.implementation_git_sha = p_control.deployed_git_sha
    AND p_approval.artifact_manifest_digest = p_control.artifact_manifest_digest
    AND p_approval.pages_bundle_digest = p_control.pages_bundle_digest
    AND p_approval.worker_bundle_digest = p_control.worker_bundle_digest
    AND p_approval.binding_manifest_digest = p_control.binding_manifest_digest
    AND p_approval.maximum_cost_usd_micros <= p_control.maximum_cost_usd_micros
    AND p_approval.rate_card_id = p_control.rate_card_id
$$;

CREATE OR REPLACE FUNCTION crm_search_record_dormant_deployment(
  p_organisation_scope_id UUID,
  p_expected_control_revision BIGINT,
  p_actor_id UUID,
  p_reason TEXT,
  p_change_approval_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_control public.crm_search_global_control%ROWTYPE;
  v_approval public.crm_search_change_approvals%ROWTYPE;
  v_new_revision BIGINT;
BEGIN
  IF p_actor_id IS NULL
     OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search dormant deployment requires actor and bounded reason';
  END IF;
  SELECT * INTO v_control
  FROM public.crm_search_global_control
  WHERE organisation_scope_id = p_organisation_scope_id
  FOR UPDATE;
  IF NOT FOUND OR v_control.revision IS DISTINCT FROM p_expected_control_revision
     OR v_control.state <> 'halted' THEN
    RAISE EXCEPTION 'CRM search deployment must remain halted';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_change_approval_id::TEXT, 351)
  );
  SELECT approval.* INTO v_approval
  FROM public.crm_search_change_approvals approval
  LEFT JOIN public.crm_search_change_approval_revocations revocation
    ON revocation.approval_id = approval.id
  WHERE approval.id = p_change_approval_id
    AND approval.approval_type = 'production_deploy'
    AND approval.scope_kind = 'global'
    AND approval.organisation_scope_id = p_organisation_scope_id
    AND approval.expected_control_revision = p_expected_control_revision
    AND approval.approved_by <> p_actor_id
    AND approval.pages_bundle_digest IS NOT NULL
    AND approval.worker_bundle_digest IS NOT NULL
    AND approval.rate_card_id IS NOT NULL
    AND approval.expires_at > NOW()
    AND revocation.id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.crm_search_rate_cards rate_card
      LEFT JOIN public.crm_search_rate_card_revocations rate_revocation
        ON rate_revocation.rate_card_id = rate_card.id
      WHERE rate_card.id = approval.rate_card_id
        AND rate_card.organisation_scope_id = p_organisation_scope_id
        AND rate_card.valid_from <= NOW() AND rate_card.valid_until > NOW()
        AND rate_revocation.id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_search_change_approval_consumptions consumption
      WHERE consumption.approval_id = approval.id
    )
  FOR UPDATE OF approval;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search dormant deployment lacks exact production-deploy approval';
  END IF;

  UPDATE public.crm_search_global_control
  SET environment = v_approval.environment,
      deployed_git_sha = v_approval.implementation_git_sha,
      artifact_manifest_digest = v_approval.artifact_manifest_digest,
      pages_bundle_digest = v_approval.pages_bundle_digest,
      worker_bundle_digest = v_approval.worker_bundle_digest,
      binding_manifest_digest = v_approval.binding_manifest_digest,
      evidence_bundle_hash = v_approval.evidence_bundle_hash,
      active_deployment_approval_id = v_approval.id,
      maximum_cost_usd_micros = v_approval.maximum_cost_usd_micros,
      rate_card_id = v_approval.rate_card_id,
      transition_reason = btrim(p_reason),
      updated_by = p_actor_id,
      revision = revision + 1,
      updated_at = NOW()
  WHERE organisation_scope_id = p_organisation_scope_id
    AND revision = p_expected_control_revision
    AND state = 'halted'
  RETURNING revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search dormant deployment CAS failed';
  END IF;

  INSERT INTO public.crm_search_change_approval_consumptions (
    approval_id, consumed_by, consumption_kind
  ) VALUES (v_approval.id, p_actor_id, 'dormant_deployment');
  INSERT INTO public.crm_search_audit_log (
    organisation_scope_id, event_type, actor_id, correlation_id, reason,
    evidence_hash, details
  ) VALUES (
    p_organisation_scope_id, 'deployment.dormant_recorded', p_actor_id,
    gen_random_uuid(), btrim(p_reason), v_approval.evidence_bundle_hash,
    jsonb_build_object(
      'fromState', 'halted', 'toState', 'halted',
      'fromRevision', p_expected_control_revision, 'toRevision', v_new_revision,
      'approvalId', v_approval.id
    )
  );
  RETURN v_new_revision;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_transition_global_control(
  p_organisation_scope_id UUID,
  p_expected_revision BIGINT,
  p_next_state TEXT,
  p_next_maximum_mode TEXT,
  p_indexing_ready BOOLEAN,
  p_actor_id UUID,
  p_reason TEXT,
  p_change_approval_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_control public.crm_search_global_control%ROWTYPE;
  v_approval public.crm_search_change_approvals%ROWTYPE;
  v_policy public.crm_search_policies%ROWTYPE;
  v_new_revision BIGINT;
  v_requested_action TEXT;
BEGIN
  IF p_actor_id IS NULL
     OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000
     OR p_next_state NOT IN ('halted', 'delete_only', 'enabled')
     OR p_next_maximum_mode NOT IN ('off', 'shadow', 'assist')
     OR (p_next_state <> 'enabled' AND (p_next_maximum_mode <> 'off' OR p_indexing_ready)) THEN
    RAISE EXCEPTION 'invalid CRM search global-control transition request';
  END IF;

  SELECT * INTO v_control
  FROM public.crm_search_global_control
  WHERE organisation_scope_id = p_organisation_scope_id
  FOR UPDATE;
  IF NOT FOUND OR v_control.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'CRM search global-control revision changed';
  END IF;
  v_requested_action := CASE
    WHEN v_control.state <> 'enabled' THEN 'enable_indexing'
    ELSE 'restore_indexing_readiness'
  END;

  IF p_next_state = 'enabled'
     AND (
       v_control.state <> 'enabled'
       OR p_next_maximum_mode <> v_control.maximum_mode
       OR (p_indexing_ready AND NOT v_control.indexing_ready)
     ) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_change_approval_id::TEXT, 351)
    );
    SELECT approval.* INTO v_approval
    FROM public.crm_search_change_approvals approval
    LEFT JOIN public.crm_search_change_approval_revocations revocation
      ON revocation.approval_id = approval.id
    WHERE approval.id = p_change_approval_id
      AND approval.approval_type = 'client_indexing'
      AND approval.scope_kind = 'client'
      AND approval.organisation_scope_id = p_organisation_scope_id
      AND approval.expected_control_revision = p_expected_revision
      AND approval.requested_action = v_requested_action
      AND public.crm_search_approval_matches_active_deployment(approval, v_control)
      AND approval.maximum_cost_usd_micros > 0
      AND approval.rate_card_id = v_control.rate_card_id
      AND approval.approved_by <> p_actor_id
      AND approval.expires_at > NOW()
      AND revocation.id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_search_change_approval_consumptions consumption
        WHERE consumption.approval_id = approval.id
      )
    FOR UPDATE OF approval;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRM search global-control rollout lacks exact client-indexing approval';
    END IF;

    SELECT * INTO v_policy
    FROM public.crm_search_policies
    WHERE organisation_scope_id = p_organisation_scope_id
      AND client_id = v_approval.client_id
      AND revision = v_approval.expected_policy_revision
      AND daily_query_budget_usd_micros + daily_indexing_budget_usd_micros
        <= v_approval.maximum_cost_usd_micros
    FOR KEY SHARE;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM public.crm_search_rate_cards rate_card
      LEFT JOIN public.crm_search_rate_card_revocations revocation
        ON revocation.rate_card_id = rate_card.id
      WHERE rate_card.id = v_approval.rate_card_id
        AND rate_card.organisation_scope_id = p_organisation_scope_id
        AND rate_card.valid_from <= NOW() AND rate_card.valid_until > NOW()
        AND revocation.id IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM public.crm_search_schema_versions target_schema
      WHERE target_schema.organisation_scope_id = p_organisation_scope_id
        AND target_schema.schema_version = v_approval.target_schema_version
        AND target_schema.provider_contract_digest = v_approval.provider_contract_digest
    ) THEN
      RAISE EXCEPTION 'CRM search client-indexing cost or rate-card authority is stale';
    END IF;
  END IF;

  UPDATE public.crm_search_global_control
  SET state = p_next_state,
      maximum_mode = p_next_maximum_mode,
      indexing_ready = p_indexing_ready,
      revision = revision + 1,
      evidence_bundle_hash = CASE
        WHEN p_next_state = 'enabled' THEN COALESCE(v_approval.evidence_bundle_hash, evidence_bundle_hash)
        ELSE evidence_bundle_hash
      END,
      transition_reason = btrim(p_reason),
      updated_by = p_actor_id,
      updated_at = NOW()
  WHERE organisation_scope_id = p_organisation_scope_id
    AND revision = p_expected_revision
  RETURNING revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search global-control transition CAS failed';
  END IF;

  IF v_approval.id IS NOT NULL THEN
    INSERT INTO public.crm_search_change_approval_consumptions (
      approval_id, consumed_by, consumption_kind
    ) VALUES (v_approval.id, p_actor_id, 'global_control');
  END IF;

  INSERT INTO public.crm_search_audit_log (
    organisation_scope_id, event_type, actor_id, correlation_id, reason,
    evidence_hash, details
  ) VALUES (
    p_organisation_scope_id, 'global_control.transition', p_actor_id,
    gen_random_uuid(), btrim(p_reason),
    CASE WHEN p_change_approval_id IS NULL THEN NULL ELSE v_approval.evidence_bundle_hash END,
    jsonb_build_object(
      'fromState', v_control.state,
      'toState', p_next_state,
      'fromRevision', p_expected_revision,
      'toRevision', v_new_revision
    )
  );
  RETURN v_new_revision;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_configure_candidate_schema(
  p_organisation_scope_id UUID,
  p_client_id UUID,
  p_expected_policy_revision BIGINT,
  p_candidate_schema_version TEXT,
  p_actor_id UUID,
  p_reason TEXT,
  p_change_approval_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_control public.crm_search_global_control%ROWTYPE;
  v_policy public.crm_search_policies%ROWTYPE;
  v_schema public.crm_search_schema_versions%ROWTYPE;
  v_approval public.crm_search_change_approvals%ROWTYPE;
  v_new_revision BIGINT;
BEGIN
  IF p_actor_id IS NULL OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search candidate configuration requires actor and bounded reason';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    public.crm_search_client_advisory_lock_key(p_organisation_scope_id, p_client_id)
  );
  SELECT * INTO v_control FROM public.crm_search_global_control
  WHERE organisation_scope_id = p_organisation_scope_id
  FOR SHARE;
  IF NOT FOUND OR v_control.state <> 'enabled' OR NOT v_control.indexing_ready THEN
    RAISE EXCEPTION 'CRM search global indexing authority is not enabled';
  END IF;
  SELECT * INTO v_policy FROM public.crm_search_policies
  WHERE organisation_scope_id = p_organisation_scope_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND OR v_policy.revision IS DISTINCT FROM p_expected_policy_revision
     OR v_policy.lifecycle_state NOT IN ('indexing', 'shadow', 'assist')
     OR v_policy.candidate_schema_version IS NOT NULL
     OR cardinality(v_policy.retiring_schema_versions) <> 0 THEN
    RAISE EXCEPTION 'CRM search policy cannot accept a candidate schema';
  END IF;
  SELECT schema_row.* INTO v_schema
  FROM public.crm_search_schema_versions schema_row
  WHERE schema_row.organisation_scope_id = p_organisation_scope_id
    AND schema_row.schema_version = p_candidate_schema_version
    AND schema_row.metadata_index_state = 'ready'
    AND schema_row.sentinel_state = 'confirmed_absent'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search candidate schema lacks metadata-index and sentinel readiness';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_change_approval_id::TEXT, 351)
  );
  SELECT approval.* INTO v_approval
  FROM public.crm_search_change_approvals approval
  LEFT JOIN public.crm_search_change_approval_revocations revocation
    ON revocation.approval_id = approval.id
  WHERE approval.id = p_change_approval_id
    AND approval.approval_type = 'client_indexing'
    AND approval.scope_kind = 'client'
    AND approval.organisation_scope_id = p_organisation_scope_id
    AND approval.client_id = p_client_id
    AND approval.expected_control_revision = v_control.revision
    AND approval.expected_policy_revision = p_expected_policy_revision
    AND approval.requested_action = 'configure_candidate'
    AND approval.target_schema_version = p_candidate_schema_version
    AND public.crm_search_approval_matches_active_deployment(approval, v_control)
    AND approval.maximum_cost_usd_micros >=
      v_policy.daily_query_budget_usd_micros + v_policy.daily_indexing_budget_usd_micros
    AND approval.rate_card_id = v_control.rate_card_id
    AND approval.provider_contract_digest = v_schema.provider_contract_digest
    AND approval.approved_by <> p_actor_id
    AND approval.expires_at > NOW()
    AND revocation.id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.crm_search_rate_cards rate_card
      LEFT JOIN public.crm_search_rate_card_revocations rate_revocation
        ON rate_revocation.rate_card_id = rate_card.id
      WHERE rate_card.id = approval.rate_card_id
        AND rate_card.organisation_scope_id = p_organisation_scope_id
        AND rate_card.model_id = v_schema.model_id
        AND rate_card.valid_from <= NOW() AND rate_card.valid_until > NOW()
        AND rate_revocation.id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_search_change_approval_consumptions consumption
      WHERE consumption.approval_id = approval.id
    )
  FOR UPDATE OF approval;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search candidate configuration lacks fresh exact approval';
  END IF;

  UPDATE public.crm_search_policies
  SET candidate_schema_version = p_candidate_schema_version,
      deployed_environment = v_approval.environment,
      deployed_git_sha = v_approval.implementation_git_sha,
      artifact_manifest_digest = v_approval.artifact_manifest_digest,
      pages_bundle_digest = v_approval.pages_bundle_digest,
      worker_bundle_digest = v_approval.worker_bundle_digest,
      binding_manifest_digest = v_approval.binding_manifest_digest,
      evidence_bundle_hash = v_approval.evidence_bundle_hash,
      approved_control_revision = v_approval.expected_control_revision,
      active_deployment_approval_id = v_control.active_deployment_approval_id,
      maximum_cost_usd_micros = v_approval.maximum_cost_usd_micros,
      rate_card_id = v_approval.rate_card_id,
      revision = revision + 1, transition_reason = btrim(p_reason),
      updated_by = p_actor_id, updated_at = NOW()
  WHERE id = v_policy.id AND revision = p_expected_policy_revision
  RETURNING revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search candidate configuration CAS failed';
  END IF;
  INSERT INTO public.crm_search_change_approval_consumptions (
    approval_id, consumed_by, consumption_kind
  ) VALUES (v_approval.id, p_actor_id, 'candidate_configuration');
  INSERT INTO public.crm_search_audit_log (
    organisation_scope_id, client_id, event_type, actor_id, correlation_id,
    reason, evidence_hash, details
  ) VALUES (
    p_organisation_scope_id, p_client_id, 'schema.candidate_configured', p_actor_id,
    gen_random_uuid(), btrim(p_reason), v_approval.evidence_bundle_hash,
    jsonb_build_object(
      'candidateSchemaVersion', p_candidate_schema_version,
      'fromRevision', p_expected_policy_revision, 'toRevision', v_new_revision,
      'approvalId', v_approval.id
    )
  );
  RETURN v_new_revision;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_promote_candidate_schema(
  p_organisation_scope_id UUID,
  p_client_id UUID,
  p_expected_policy_revision BIGINT,
  p_actor_id UUID,
  p_reason TEXT,
  p_change_approval_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_control public.crm_search_global_control%ROWTYPE;
  v_policy public.crm_search_policies%ROWTYPE;
  v_schema public.crm_search_schema_versions%ROWTYPE;
  v_approval public.crm_search_change_approvals%ROWTYPE;
  v_new_revision BIGINT;
BEGIN
  IF p_actor_id IS NULL OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search candidate promotion requires actor and bounded reason';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    public.crm_search_client_advisory_lock_key(p_organisation_scope_id, p_client_id)
  );
  SELECT * INTO v_control FROM public.crm_search_global_control
  WHERE organisation_scope_id = p_organisation_scope_id
  FOR SHARE;
  IF NOT FOUND OR v_control.state <> 'enabled' OR NOT v_control.indexing_ready THEN
    RAISE EXCEPTION 'CRM search global indexing authority is not enabled';
  END IF;
  SELECT * INTO v_policy FROM public.crm_search_policies
  WHERE organisation_scope_id = p_organisation_scope_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND OR v_policy.revision IS DISTINCT FROM p_expected_policy_revision
     OR v_policy.lifecycle_state NOT IN ('indexing', 'shadow', 'assist')
     OR v_policy.candidate_schema_version IS NULL
     OR cardinality(v_policy.retiring_schema_versions) <> 0 THEN
    RAISE EXCEPTION 'CRM search policy has no promotable candidate';
  END IF;
  SELECT * INTO v_schema FROM public.crm_search_schema_versions
  WHERE organisation_scope_id = p_organisation_scope_id
    AND schema_version = v_policy.candidate_schema_version
    AND metadata_index_state = 'ready'
    AND sentinel_state = 'confirmed_absent'
  FOR KEY SHARE;
  IF NOT FOUND
     OR v_schema.captured_source_high_watermark IS DISTINCT FROM v_schema.confirmed_source_high_watermark
     OR EXISTS (
       SELECT 1 FROM public.crm_search_source_dirty dirty
       WHERE dirty.organisation_scope_id = p_organisation_scope_id
         AND dirty.client_id = p_client_id
         AND dirty.event_sequence <= v_schema.captured_source_high_watermark
     )
     OR EXISTS (
       SELECT 1 FROM public.crm_search_operations operation
       WHERE operation.organisation_scope_id = p_organisation_scope_id
         AND operation.client_id = p_client_id
         AND operation.schema_version = v_policy.candidate_schema_version
         AND operation.source_event_sequence <= v_schema.captured_source_high_watermark
         AND NOT public.crm_search_operation_converged(operation.id, FALSE)
     )
     OR EXISTS (
       SELECT 1 FROM public.crm_search_documents document
       WHERE document.organisation_scope_id = p_organisation_scope_id
         AND document.client_id = p_client_id
         AND document.schema_version = v_policy.candidate_schema_version
         AND document.source_event_sequence <= v_schema.captured_source_high_watermark
         AND document.confirmation_state NOT IN ('indexed', 'deleted')
     )
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT 'person'::TEXT AS entity_type, source.id, source.search_revision, source.deleted_at
         FROM public.crm_people source WHERE source.client_id = p_client_id
         UNION ALL
         SELECT 'company', source.id, source.search_revision, source.deleted_at
         FROM public.crm_companies source WHERE source.client_id = p_client_id
         UNION ALL
         SELECT 'opportunity', source.id, source.search_revision, source.deleted_at
         FROM public.crm_opportunities source WHERE source.client_id = p_client_id
       ) current_source
       LEFT JOIN public.crm_search_documents document
         ON document.organisation_scope_id = p_organisation_scope_id
        AND document.client_id = p_client_id
        AND document.entity_type = current_source.entity_type
        AND document.entity_id = current_source.id
        AND document.schema_version = v_policy.candidate_schema_version
        AND document.source_revision = current_source.search_revision
        AND (
          (current_source.deleted_at IS NULL
            AND document.confirmation_state = 'indexed' AND document.tombstoned = FALSE)
          OR (current_source.deleted_at IS NOT NULL
            AND document.confirmation_state = 'deleted' AND document.tombstoned = TRUE)
        )
       WHERE document.id IS NULL
     ) THEN
    RAISE EXCEPTION 'CRM search candidate has not reached its confirmed source high-watermark';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.crm_search_documents candidate_document
    LEFT JOIN (
      SELECT 'person'::TEXT AS entity_type, source.id, source.search_revision, source.deleted_at
      FROM public.crm_people source WHERE source.client_id = p_client_id
      UNION ALL
      SELECT 'company', source.id, source.search_revision, source.deleted_at
      FROM public.crm_companies source WHERE source.client_id = p_client_id
      UNION ALL
      SELECT 'opportunity', source.id, source.search_revision, source.deleted_at
      FROM public.crm_opportunities source WHERE source.client_id = p_client_id
    ) current_source
      ON current_source.entity_type = candidate_document.entity_type
     AND current_source.id = candidate_document.entity_id
    WHERE candidate_document.organisation_scope_id = p_organisation_scope_id
      AND candidate_document.client_id = p_client_id
      AND candidate_document.schema_version = v_policy.candidate_schema_version
      AND candidate_document.source_event_sequence <= v_schema.captured_source_high_watermark
      AND NOT (
        (candidate_document.confirmation_state = 'deleted'
          AND candidate_document.tombstoned = TRUE)
        OR (
          current_source.id IS NOT NULL
          AND current_source.deleted_at IS NULL
          AND candidate_document.source_revision = current_source.search_revision
          AND candidate_document.confirmation_state = 'indexed'
          AND candidate_document.tombstoned = FALSE
        )
      )
  ) THEN
    RAISE EXCEPTION 'CRM search reverse-orphan: candidate document has no current source or completed delete';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_change_approval_id::TEXT, 351)
  );
  SELECT approval.* INTO v_approval
  FROM public.crm_search_change_approvals approval
  LEFT JOIN public.crm_search_change_approval_revocations revocation
    ON revocation.approval_id = approval.id
  WHERE approval.id = p_change_approval_id
    AND approval.approval_type = 'client_indexing'
    AND approval.scope_kind = 'client'
    AND approval.organisation_scope_id = p_organisation_scope_id
    AND approval.client_id = p_client_id
    AND approval.expected_control_revision = v_control.revision
    AND approval.expected_policy_revision = p_expected_policy_revision
    AND approval.requested_action = 'promote_candidate'
    AND approval.target_schema_version = v_policy.candidate_schema_version
    AND public.crm_search_approval_matches_active_deployment(approval, v_control)
    AND approval.maximum_cost_usd_micros >=
      v_policy.daily_query_budget_usd_micros + v_policy.daily_indexing_budget_usd_micros
    AND approval.rate_card_id = v_control.rate_card_id
    AND approval.provider_contract_digest = v_schema.provider_contract_digest
    AND approval.approved_by <> p_actor_id
    AND approval.expires_at > NOW()
    AND revocation.id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.crm_search_rate_cards rate_card
      LEFT JOIN public.crm_search_rate_card_revocations rate_revocation
        ON rate_revocation.rate_card_id = rate_card.id
      WHERE rate_card.id = approval.rate_card_id
        AND rate_card.organisation_scope_id = p_organisation_scope_id
        AND rate_card.model_id = v_schema.model_id
        AND rate_card.valid_from <= NOW() AND rate_card.valid_until > NOW()
        AND rate_revocation.id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_search_change_approval_consumptions consumption
      WHERE consumption.approval_id = approval.id
    )
  FOR UPDATE OF approval;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search candidate promotion lacks fresh exact approval';
  END IF;

  UPDATE public.crm_search_policies
  SET lifecycle_state = 'indexing',
      effective_mode = 'off',
      indexing_enabled = TRUE,
      approved_evaluation_run_id = NULL,
      active_schema_version = candidate_schema_version,
      candidate_schema_version = NULL,
      retiring_schema_versions = CASE
        WHEN active_schema_version IS NULL THEN ARRAY[]::TEXT[]
        ELSE ARRAY[active_schema_version]::TEXT[]
      END,
      revision = revision + 1, transition_reason = btrim(p_reason),
      updated_by = p_actor_id, updated_at = NOW()
  WHERE id = v_policy.id AND revision = p_expected_policy_revision
  RETURNING revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search candidate promotion CAS failed';
  END IF;
  INSERT INTO public.crm_search_change_approval_consumptions (
    approval_id, consumed_by, consumption_kind
  ) VALUES (v_approval.id, p_actor_id, 'candidate_promotion');
  INSERT INTO public.crm_search_audit_log (
    organisation_scope_id, client_id, event_type, actor_id, correlation_id,
    reason, evidence_hash, details
  ) VALUES (
    p_organisation_scope_id, p_client_id, 'schema.candidate_promoted', p_actor_id,
    gen_random_uuid(), btrim(p_reason), v_approval.evidence_bundle_hash,
    jsonb_build_object(
      'activeSchemaVersion', v_policy.candidate_schema_version,
      'fromRevision', p_expected_policy_revision, 'toRevision', v_new_revision,
      'approvalId', v_approval.id
    )
  );
  RETURN v_new_revision;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_complete_retiring_schema(
  p_organisation_scope_id UUID,
  p_client_id UUID,
  p_expected_policy_revision BIGINT,
  p_retiring_schema_version TEXT,
  p_actor_id UUID,
  p_reason TEXT,
  p_change_approval_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_control public.crm_search_global_control%ROWTYPE;
  v_policy public.crm_search_policies%ROWTYPE;
  v_schema public.crm_search_schema_versions%ROWTYPE;
  v_approval public.crm_search_change_approvals%ROWTYPE;
  v_new_revision BIGINT;
BEGIN
  IF p_actor_id IS NULL
     OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search retiring completion requires actor and bounded reason';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    public.crm_search_client_advisory_lock_key(p_organisation_scope_id, p_client_id)
  );
  SELECT * INTO v_control
  FROM public.crm_search_global_control
  WHERE organisation_scope_id = p_organisation_scope_id
  FOR SHARE;
  IF NOT FOUND OR v_control.state NOT IN ('enabled', 'delete_only') THEN
    RAISE EXCEPTION 'CRM search retiring completion lacks global deletion authority';
  END IF;
  SELECT * INTO v_policy
  FROM public.crm_search_policies
  WHERE organisation_scope_id = p_organisation_scope_id
    AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND OR v_policy.revision IS DISTINCT FROM p_expected_policy_revision
     OR NOT (p_retiring_schema_version = ANY(v_policy.retiring_schema_versions)) THEN
    RAISE EXCEPTION 'CRM search retiring schema or policy revision changed';
  END IF;
  SELECT * INTO v_schema
  FROM public.crm_search_schema_versions
  WHERE organisation_scope_id = p_organisation_scope_id
    AND schema_version = p_retiring_schema_version
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search retiring schema contract is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.crm_search_documents document
    WHERE document.organisation_scope_id = p_organisation_scope_id
      AND document.client_id = p_client_id
      AND document.schema_version = p_retiring_schema_version
      AND (document.confirmation_state <> 'deleted' OR document.tombstoned = FALSE)
  ) OR EXISTS (
    SELECT 1 FROM public.crm_search_operations operation
    WHERE operation.organisation_scope_id = p_organisation_scope_id
      AND operation.client_id = p_client_id
      AND operation.schema_version = p_retiring_schema_version
      AND NOT public.crm_search_operation_converged(operation.id, TRUE)
  ) THEN
    RAISE EXCEPTION 'CRM search retiring schema deletion is not provider-confirmed';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_change_approval_id::TEXT, 351)
  );
  SELECT approval.* INTO v_approval
  FROM public.crm_search_change_approvals approval
  LEFT JOIN public.crm_search_change_approval_revocations revocation
    ON revocation.approval_id = approval.id
  WHERE approval.id = p_change_approval_id
    AND approval.approval_type = 'client_indexing'
    AND approval.scope_kind = 'client'
    AND approval.organisation_scope_id = p_organisation_scope_id
    AND approval.client_id = p_client_id
    AND approval.expected_control_revision = v_control.revision
    AND approval.expected_policy_revision = p_expected_policy_revision
    AND approval.requested_action = 'retire_schema'
    AND approval.target_schema_version = p_retiring_schema_version
    AND public.crm_search_approval_matches_active_deployment(approval, v_control)
    AND approval.maximum_cost_usd_micros >=
      v_policy.daily_query_budget_usd_micros + v_policy.daily_indexing_budget_usd_micros
    AND approval.rate_card_id = v_control.rate_card_id
    AND approval.provider_contract_digest = v_schema.provider_contract_digest
    AND approval.approved_by <> p_actor_id
    AND approval.expires_at > NOW()
    AND revocation.id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.crm_search_rate_cards rate_card
      LEFT JOIN public.crm_search_rate_card_revocations rate_revocation
        ON rate_revocation.rate_card_id = rate_card.id
      WHERE rate_card.id = approval.rate_card_id
        AND rate_card.organisation_scope_id = p_organisation_scope_id
        AND rate_card.model_id = v_schema.model_id
        AND rate_card.valid_from <= NOW() AND rate_card.valid_until > NOW()
        AND rate_revocation.id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.crm_search_change_approval_consumptions consumption
      WHERE consumption.approval_id = approval.id
    )
  FOR UPDATE OF approval;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search retiring completion lacks fresh exact approval';
  END IF;

  UPDATE public.crm_search_policies
  SET retiring_schema_versions = array_remove(
        retiring_schema_versions, p_retiring_schema_version
      ),
      revision = revision + 1,
      transition_reason = btrim(p_reason),
      updated_by = p_actor_id,
      updated_at = NOW()
  WHERE id = v_policy.id AND revision = p_expected_policy_revision
  RETURNING revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search retiring completion CAS failed';
  END IF;

  INSERT INTO public.crm_search_change_approval_consumptions (
    approval_id, consumed_by, consumption_kind
  ) VALUES (v_approval.id, p_actor_id, 'retiring_completion');
  INSERT INTO public.crm_search_audit_log (
    organisation_scope_id, client_id, event_type, actor_id, correlation_id,
    reason, evidence_hash, details
  ) VALUES (
    p_organisation_scope_id, p_client_id, 'schema.retiring_completed', p_actor_id,
    gen_random_uuid(), btrim(p_reason), v_approval.evidence_bundle_hash,
    jsonb_build_object(
      'retiringSchemaVersion', p_retiring_schema_version,
      'fromRevision', p_expected_policy_revision,
      'toRevision', v_new_revision,
      'approvalId', v_approval.id
    )
  );
  RETURN v_new_revision;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_transition_policy(
  p_organisation_scope_id UUID,
  p_client_id UUID,
  p_expected_revision BIGINT,
  p_next_lifecycle_state TEXT,
  p_active_schema_version TEXT,
  p_candidate_schema_version TEXT,
  p_approved_evaluation_run_id UUID,
  p_actor_id UUID,
  p_reason TEXT,
  p_teardown_cycle_id UUID,
  p_change_approval_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_control public.crm_search_global_control%ROWTYPE;
  v_policy public.crm_search_policies%ROWTYPE;
  v_schema public.crm_search_schema_versions%ROWTYPE;
  v_approval public.crm_search_change_approvals%ROWTYPE;
  v_eval public.crm_search_evaluation_runs%ROWTYPE;
  v_eval_approval public.crm_search_evaluation_approvals%ROWTYPE;
  v_required_approval_type TEXT;
  v_effective_mode TEXT;
  v_indexing_enabled BOOLEAN;
  v_new_revision BIGINT;
BEGIN
  IF p_actor_id IS NULL
     OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'CRM search policy transition requires actor and bounded reason';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    public.crm_search_client_advisory_lock_key(p_organisation_scope_id, p_client_id)
  );

  SELECT * INTO v_control
  FROM public.crm_search_global_control
  WHERE organisation_scope_id = p_organisation_scope_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search global control is missing';
  END IF;

  SELECT * INTO v_policy
  FROM public.crm_search_policies
  WHERE organisation_scope_id = p_organisation_scope_id AND client_id = p_client_id
  FOR UPDATE;
  IF NOT FOUND OR v_policy.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'CRM search policy revision changed';
  END IF;
  IF NOT public.crm_search_policy_transition_allowed(
    v_policy.lifecycle_state, p_next_lifecycle_state
  ) THEN
    RAISE EXCEPTION 'invalid CRM search policy transition';
  END IF;
  IF p_next_lifecycle_state = v_policy.lifecycle_state THEN
    RAISE EXCEPTION 'CRM search policy self-transition requires a dedicated governed operation';
  END IF;
  IF p_active_schema_version IS DISTINCT FROM v_policy.active_schema_version
     OR p_candidate_schema_version IS DISTINCT FROM v_policy.candidate_schema_version THEN
    RAISE EXCEPTION 'CRM search schema fields require the dedicated blue-green functions';
  END IF;

  IF v_policy.active_schema_version IS NOT NULL THEN
    SELECT schema_row.* INTO v_schema
    FROM public.crm_search_schema_versions schema_row
    WHERE schema_row.organisation_scope_id = p_organisation_scope_id
      AND schema_row.schema_version = v_policy.active_schema_version
    FOR KEY SHARE;
  END IF;
  IF p_next_lifecycle_state IN ('shadow', 'assist')
     AND (v_schema.id IS NULL
       OR v_schema.metadata_index_state <> 'ready'
       OR v_schema.sentinel_state <> 'confirmed_absent'
       OR v_schema.captured_source_high_watermark IS DISTINCT FROM
          v_schema.confirmed_source_high_watermark) THEN
    RAISE EXCEPTION 'CRM search active schema is not provider-confirmed ready';
  END IF;

  v_required_approval_type := CASE
    WHEN v_policy.lifecycle_state = 'off' AND p_next_lifecycle_state = 'indexing' THEN 'client_indexing'
    WHEN v_policy.lifecycle_state = 'indexing' AND p_next_lifecycle_state = 'shadow' THEN 'client_shadow'
    WHEN v_policy.lifecycle_state = 'shadow' AND p_next_lifecycle_state = 'assist' THEN 'client_assist'
    ELSE NULL
  END;

  IF v_required_approval_type IS NOT NULL THEN
    IF v_control.state <> 'enabled' OR NOT v_control.indexing_ready THEN
      RAISE EXCEPTION 'CRM search client rollout requires enabled indexing authority';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_change_approval_id::TEXT, 351)
    );
    SELECT approval.* INTO v_approval
    FROM public.crm_search_change_approvals approval
    LEFT JOIN public.crm_search_change_approval_revocations revocation
      ON revocation.approval_id = approval.id
    WHERE approval.id = p_change_approval_id
      AND approval.approval_type = v_required_approval_type
      AND approval.scope_kind = 'client'
      AND approval.organisation_scope_id = p_organisation_scope_id
      AND approval.client_id = p_client_id
      AND approval.expected_control_revision = v_control.revision
      AND approval.expected_policy_revision = p_expected_revision
      AND (
        v_required_approval_type <> 'client_indexing'
        OR (
          approval.requested_action = 'policy_indexing'
          AND EXISTS (
            SELECT 1 FROM public.crm_search_schema_versions target_schema
            WHERE target_schema.organisation_scope_id = p_organisation_scope_id
              AND target_schema.schema_version = approval.target_schema_version
              AND target_schema.provider_contract_digest = approval.provider_contract_digest
          )
        )
      )
      AND public.crm_search_approval_matches_active_deployment(approval, v_control)
      AND approval.maximum_cost_usd_micros >=
        v_policy.daily_query_budget_usd_micros + v_policy.daily_indexing_budget_usd_micros
      AND approval.rate_card_id = v_control.rate_card_id
      AND (v_schema.id IS NULL
        OR approval.provider_contract_digest = v_schema.provider_contract_digest)
      AND approval.approved_by <> p_actor_id
      AND approval.expires_at > NOW()
      AND revocation.id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.crm_search_rate_cards rate_card
        LEFT JOIN public.crm_search_rate_card_revocations rate_revocation
          ON rate_revocation.rate_card_id = rate_card.id
        WHERE rate_card.id = approval.rate_card_id
          AND rate_card.organisation_scope_id = p_organisation_scope_id
          AND (v_schema.id IS NULL OR rate_card.model_id = v_schema.model_id)
          AND rate_card.valid_from <= NOW() AND rate_card.valid_until > NOW()
          AND rate_revocation.id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_search_change_approval_consumptions consumption
        WHERE consumption.approval_id = approval.id
      )
    FOR UPDATE OF approval;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRM search policy promotion lacks exact approval';
    END IF;
  END IF;

  IF p_next_lifecycle_state = 'teardown_pending' THEN
    IF p_teardown_cycle_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.crm_search_client_teardowns teardown
      WHERE teardown.id = p_teardown_cycle_id
        AND teardown.organisation_scope_id = p_organisation_scope_id
        AND teardown.client_id = p_client_id
        AND teardown.policy_revision = p_expected_revision + 1
        AND teardown.state IN ('pending', 'deleting', 'provider_pending')
    ) THEN
      RAISE EXCEPTION 'CRM search teardown transition requires the new exact cycle';
    END IF;
  ELSIF v_policy.lifecycle_state <> 'teardown_pending' AND p_teardown_cycle_id IS NOT NULL THEN
    RAISE EXCEPTION 'CRM search teardown cycle is valid only for teardown transitions';
  END IF;

  IF v_policy.lifecycle_state = 'teardown_pending' AND p_next_lifecycle_state = 'off'
     AND (p_teardown_cycle_id IS DISTINCT FROM v_policy.active_teardown_id OR NOT EXISTS (
       SELECT 1
       FROM public.crm_search_client_teardowns teardown
       WHERE teardown.id = v_policy.active_teardown_id
         AND teardown.organisation_scope_id = p_organisation_scope_id
         AND teardown.client_id = p_client_id
         AND teardown.policy_revision = v_policy.revision
         AND teardown.state = 'confirmed'
         AND teardown.provider_deletion_state = 'confirmed_absent'
         AND teardown.completed_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.crm_search_teardown_vectors vector
           WHERE vector.teardown_id = teardown.id
             AND vector.deletion_state <> 'confirmed_absent'
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.crm_search_operations operation
           WHERE operation.organisation_scope_id = teardown.organisation_scope_id
             AND operation.client_id = teardown.client_id
             AND NOT public.crm_search_operation_converged(operation.id, TRUE)
         )
     )) THEN
    RAISE EXCEPTION 'CRM search teardown is not provider-confirmed absent';
  END IF;

  IF p_next_lifecycle_state = 'assist' THEN
    SELECT run.* INTO v_eval
    FROM public.crm_search_evaluation_runs run
    WHERE run.id = p_approved_evaluation_run_id
      AND run.organisation_scope_id = p_organisation_scope_id
      AND run.schema_version = p_active_schema_version
      AND run.gate_passed = TRUE
      AND run.expires_at > NOW()
      AND run.implementation_git_sha = v_approval.implementation_git_sha
      AND run.artifact_manifest_digest = v_approval.artifact_manifest_digest
      AND run.pages_bundle_digest = v_approval.pages_bundle_digest
      AND run.worker_bundle_digest = v_approval.worker_bundle_digest
      AND run.binding_manifest_digest = v_approval.binding_manifest_digest
      AND run.query_evidence_bundle_sha256 = v_approval.evidence_bundle_hash
      AND run.load_protocol_digest = v_approval.load_protocol_digest
      AND run.rate_card_id = v_approval.rate_card_id
      AND run.model_id = v_schema.model_id
      AND run.pooling = v_schema.pooling
      AND run.tokenizer_revision = v_schema.tokenizer_revision
      AND run.document_builder_revision = v_schema.document_builder_revision
      AND run.ranking_revision = v_schema.ranking_revision
      AND run.threshold_revision = v_schema.threshold_revision
      AND run.provider_contract_digest = v_schema.provider_contract_digest
      AND run.provider_contract_digest = v_approval.provider_contract_digest
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRM search assist evaluation does not match deployed evidence';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_eval.id::TEXT || ':' || p_actor_id::TEXT, 352)
    );
    SELECT evaluation_approval.* INTO v_eval_approval
    FROM public.crm_search_evaluation_approvals evaluation_approval
    LEFT JOIN public.crm_search_evaluation_approval_revocations revocation
      ON revocation.approval_id = evaluation_approval.id
    WHERE evaluation_approval.evaluation_run_id = v_eval.id
      AND evaluation_approval.planned_policy_updater = p_actor_id
      AND evaluation_approval.expires_at > NOW()
      AND evaluation_approval.approved_by <> v_approval.approved_by
      AND revocation.id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_search_evaluation_approval_consumptions consumption
        WHERE consumption.approval_id = evaluation_approval.id
      )
    ORDER BY evaluation_approval.approved_at DESC
    LIMIT 1
    FOR UPDATE OF evaluation_approval;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRM search assist requires independent evaluation approval';
    END IF;
  END IF;

  v_effective_mode := CASE p_next_lifecycle_state
    WHEN 'shadow' THEN 'shadow'
    WHEN 'assist' THEN 'assist'
    ELSE 'off'
  END;
  v_indexing_enabled := p_next_lifecycle_state IN ('indexing', 'shadow', 'assist');

  UPDATE public.crm_search_policies
  SET lifecycle_state = p_next_lifecycle_state,
      effective_mode = v_effective_mode,
      indexing_enabled = v_indexing_enabled,
      active_schema_version = p_active_schema_version,
      candidate_schema_version = p_candidate_schema_version,
      active_teardown_id = CASE
        WHEN p_next_lifecycle_state = 'teardown_pending' THEN p_teardown_cycle_id
        WHEN p_next_lifecycle_state = 'off' THEN NULL
        ELSE active_teardown_id
      END,
      approved_evaluation_run_id = CASE
        WHEN p_next_lifecycle_state = 'assist' THEN p_approved_evaluation_run_id
        ELSE NULL
      END,
      deployed_environment = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.environment
        ELSE deployed_environment
      END,
      deployed_git_sha = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.implementation_git_sha
        ELSE deployed_git_sha
      END,
      artifact_manifest_digest = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.artifact_manifest_digest
        ELSE artifact_manifest_digest
      END,
      pages_bundle_digest = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.pages_bundle_digest
        ELSE pages_bundle_digest
      END,
      worker_bundle_digest = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.worker_bundle_digest
        ELSE worker_bundle_digest
      END,
      binding_manifest_digest = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.binding_manifest_digest
        ELSE binding_manifest_digest
      END,
      evidence_bundle_hash = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.evidence_bundle_hash
        ELSE evidence_bundle_hash
      END,
      approved_control_revision = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.expected_control_revision
        ELSE approved_control_revision
      END,
      active_deployment_approval_id = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_control.active_deployment_approval_id
        ELSE active_deployment_approval_id
      END,
      maximum_cost_usd_micros = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.maximum_cost_usd_micros
        ELSE maximum_cost_usd_micros
      END,
      rate_card_id = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.rate_card_id
        ELSE rate_card_id
      END,
      transition_reason = btrim(p_reason),
      updated_by = p_actor_id,
      revision = revision + 1,
      updated_at = NOW()
  WHERE organisation_scope_id = p_organisation_scope_id
    AND client_id = p_client_id
    AND revision = p_expected_revision
  RETURNING revision INTO v_new_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM search policy transition CAS failed';
  END IF;

  IF v_approval.id IS NOT NULL THEN
    INSERT INTO public.crm_search_change_approval_consumptions (
      approval_id, consumed_by, consumption_kind
    ) VALUES (v_approval.id, p_actor_id, 'policy_transition');
  END IF;
  IF v_eval_approval.id IS NOT NULL THEN
    INSERT INTO public.crm_search_evaluation_approval_consumptions (
      approval_id, consumed_by, consumption_kind
    ) VALUES (v_eval_approval.id, p_actor_id, 'client_assist');
  END IF;

  INSERT INTO public.crm_search_audit_log (
    organisation_scope_id, client_id, event_type, actor_id, correlation_id,
    reason, evidence_hash, details
  ) VALUES (
    p_organisation_scope_id, p_client_id, 'policy.transition', p_actor_id,
    gen_random_uuid(), btrim(p_reason),
    CASE WHEN v_required_approval_type IS NULL THEN NULL ELSE v_approval.evidence_bundle_hash END,
    jsonb_build_object(
      'fromState', v_policy.lifecycle_state,
      'toState', p_next_lifecycle_state,
      'fromRevision', p_expected_revision,
      'toRevision', v_new_revision
    )
  );
  RETURN v_new_revision;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_reject_governed_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_authorized BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.crm_search_retention_delete_authorizations retention_auth
      WHERE retention_auth.backend_pid = pg_catalog.pg_backend_pid()
        AND retention_auth.transaction_id = pg_catalog.txid_current()
        AND retention_auth.partition_relation_oid = TG_RELID
        AND (
          retention_auth.target_relation_oid = TG_RELID
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_inherits inheritance
            WHERE inheritance.inhrelid = TG_RELID
              AND inheritance.inhparent = retention_auth.target_relation_oid
          )
        )
        AND (
          TG_LEVEL = 'STATEMENT'
          OR OLD.id = ANY(retention_auth.candidate_ids)
        )
        AND EXISTS (
          SELECT 1
          FROM public.crm_search_retention_attestations attestation
          WHERE attestation.id = retention_auth.attestation_id
            AND attestation.deletion_manifest_hash = retention_auth.computed_manifest_hash
        )
    ) INTO v_authorized;
    IF v_authorized THEN
      IF TG_LEVEL = 'ROW' THEN
        RETURN OLD;
      END IF;
      RETURN NULL;
    END IF;
  END IF;
  RAISE EXCEPTION 'CRM search governed evidence is immutable';
END;
$$;

DROP TRIGGER IF EXISTS crm_search_legal_holds_immutable ON crm_search_legal_holds;
CREATE TRIGGER crm_search_legal_holds_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_legal_holds
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_legal_hold_releases_immutable ON crm_search_legal_hold_releases;
CREATE TRIGGER crm_search_legal_hold_releases_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_legal_hold_releases
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_legal_hold_targets_immutable ON crm_search_legal_hold_targets;
CREATE TRIGGER crm_search_legal_hold_targets_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_legal_hold_targets
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_schema_versions_immutable ON crm_search_schema_versions;
CREATE TRIGGER crm_search_schema_versions_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_schema_versions
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_rate_cards_immutable ON crm_search_rate_cards;
CREATE TRIGGER crm_search_rate_cards_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_rate_cards
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_rate_card_revocations_immutable ON crm_search_rate_card_revocations;
CREATE TRIGGER crm_search_rate_card_revocations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_rate_card_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_events_immutable ON crm_search_events;
CREATE TRIGGER crm_search_events_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_events
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_evaluation_runs_immutable ON crm_search_evaluation_runs;
CREATE TRIGGER crm_search_evaluation_runs_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_evaluation_runs
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_evaluation_query_evidence_immutable
  ON crm_search_evaluation_query_evidence;
CREATE TRIGGER crm_search_evaluation_query_evidence_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_evaluation_query_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_evaluation_approvals_immutable
  ON crm_search_evaluation_approvals;
CREATE TRIGGER crm_search_evaluation_approvals_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_evaluation_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_evaluation_approval_revocations_immutable
  ON crm_search_evaluation_approval_revocations;
CREATE TRIGGER crm_search_evaluation_approval_revocations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_evaluation_approval_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_evaluation_approval_consumptions_immutable
  ON crm_search_evaluation_approval_consumptions;
CREATE TRIGGER crm_search_evaluation_approval_consumptions_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_evaluation_approval_consumptions
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_change_approvals_immutable ON crm_search_change_approvals;
CREATE TRIGGER crm_search_change_approvals_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_change_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_change_approval_revocations_immutable
  ON crm_search_change_approval_revocations;
CREATE TRIGGER crm_search_change_approval_revocations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_change_approval_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_change_approval_consumptions_immutable
  ON crm_search_change_approval_consumptions;
CREATE TRIGGER crm_search_change_approval_consumptions_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_change_approval_consumptions
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_audit_log_immutable ON crm_search_audit_log;
CREATE TRIGGER crm_search_audit_log_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_retention_attestations_immutable
  ON crm_search_retention_attestations;
CREATE TRIGGER crm_search_retention_attestations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_retention_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

-- PostgreSQL 14 does not fire a parent's statement trigger for direct child
-- statements. Each default partition therefore owns its own statement guard.
DROP TRIGGER IF EXISTS crm_search_events_default_immutable ON crm_search_events_default;
CREATE TRIGGER crm_search_events_default_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_events_default
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_audit_log_default_immutable ON crm_search_audit_log_default;
CREATE TRIGGER crm_search_audit_log_default_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_audit_log_default
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_retention_attestations_default_immutable
  ON crm_search_retention_attestations_default;
CREATE TRIGGER crm_search_retention_attestations_default_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_retention_attestations_default
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

-- Row guards bind every retention deletion to the exact authorized UUID set.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'crm_search_schema_versions', 'crm_search_rate_cards',
    'crm_search_rate_card_revocations', 'crm_search_operations',
    'crm_search_provider_attempts', 'crm_search_documents', 'crm_search_usage_daily',
    'crm_search_usage_reservations', 'crm_search_events',
    'crm_search_daily_events', 'crm_search_evaluation_runs',
    'crm_search_evaluation_query_evidence', 'crm_search_evaluation_approvals',
    'crm_search_evaluation_approval_revocations',
    'crm_search_evaluation_approval_consumptions', 'crm_search_change_approvals',
    'crm_search_change_approval_revocations',
    'crm_search_change_approval_consumptions', 'crm_search_audit_log',
    'crm_search_dead_letters', 'crm_search_client_teardowns',
    'crm_search_teardown_vectors', 'crm_search_retention_attestations'
  ]::TEXT[]
  LOOP
    EXECUTE pg_catalog.format(
      'DROP TRIGGER IF EXISTS crm_search_retention_delete_guard ON %I', v_table
    );
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER crm_search_retention_delete_guard BEFORE DELETE ON %I '
      || 'FOR EACH ROW EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation()',
      v_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE
  crm_search_organisation_scopes, crm_search_global_control,
  crm_search_legal_holds, crm_search_legal_hold_releases,
  crm_search_legal_hold_targets, crm_search_namespaces,
  crm_search_schema_versions, crm_search_rate_cards,
  crm_search_rate_card_revocations, crm_search_policies,
  crm_search_source_dirty, crm_search_operations, crm_search_provider_attempts,
  crm_search_documents,
  crm_search_usage_daily, crm_search_usage_reservations,
  crm_search_events, crm_search_events_default, crm_search_daily_events,
  crm_search_evaluation_runs, crm_search_evaluation_query_evidence,
  crm_search_evaluation_approvals, crm_search_evaluation_approval_revocations,
  crm_search_evaluation_approval_consumptions, crm_search_change_approvals,
  crm_search_change_approval_revocations, crm_search_change_approval_consumptions,
  crm_search_audit_log, crm_search_audit_log_default, crm_search_dead_letters,
  crm_search_client_teardowns, crm_search_teardown_vectors,
  crm_search_retention_high_watermarks, crm_search_retention_attestations,
  crm_search_retention_attestations_default,
  crm_search_retention_delete_authorizations,
  crm_search_operation_admission_authorizations,
  crm_search_terminal_replacement_authorizations
FROM PUBLIC, crm_search_runtime;

REVOKE ALL ON SEQUENCE crm_search_source_event_sequence
FROM PUBLIC, crm_search_runtime;

GRANT SELECT ON TABLE
  crm_search_organisation_scopes, crm_search_global_control,
  crm_search_legal_holds, crm_search_legal_hold_releases,
  crm_search_legal_hold_targets, crm_search_namespaces,
  crm_search_schema_versions, crm_search_rate_cards,
  crm_search_rate_card_revocations, crm_search_policies,
  crm_search_source_dirty, crm_search_operations, crm_search_provider_attempts,
  crm_search_documents,
  crm_search_usage_daily, crm_search_usage_reservations,
  crm_search_events, crm_search_daily_events, crm_search_evaluation_runs,
  crm_search_evaluation_query_evidence, crm_search_evaluation_approvals,
  crm_search_evaluation_approval_revocations,
  crm_search_evaluation_approval_consumptions, crm_search_change_approvals,
  crm_search_change_approval_revocations, crm_search_change_approval_consumptions,
  crm_search_audit_log, crm_search_dead_letters, crm_search_client_teardowns,
  crm_search_teardown_vectors, crm_search_retention_high_watermarks,
  crm_search_retention_attestations
TO crm_search_runtime;

GRANT INSERT, UPDATE ON TABLE
  crm_search_source_dirty, crm_search_operations, crm_search_provider_attempts,
  crm_search_documents,
  crm_search_usage_daily, crm_search_usage_reservations,
  crm_search_daily_events, crm_search_client_teardowns,
  crm_search_teardown_vectors, crm_search_namespaces
TO crm_search_runtime;
GRANT INSERT ON TABLE
  crm_search_events, crm_search_dead_letters, crm_search_audit_log,
  crm_search_evaluation_approvals, crm_search_evaluation_approval_revocations,
  crm_search_change_approvals, crm_search_change_approval_revocations
TO crm_search_runtime;
GRANT USAGE, SELECT ON SEQUENCE crm_search_source_event_sequence
TO crm_search_runtime;

REVOKE INSERT ON TABLE crm_search_evaluation_runs,
  crm_search_evaluation_query_evidence
FROM crm_search_runtime;

DO $$
DECLARE
  v_function REGPROCEDURE;
BEGIN
  FOR v_function IN
    SELECT procedure.oid::REGPROCEDURE
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = pg_catalog.current_schema()
      AND procedure.proname = ANY(ARRAY[
        'crm_search_place_legal_hold', 'crm_search_release_legal_hold',
        'crm_search_attach_legal_hold', 'crm_search_expire_governed_rows',
        'crm_search_record_evaluation_run', 'crm_search_record_dormant_deployment',
        'crm_search_complete_source_dirty_claim',
        'crm_search_admit_operation', 'crm_search_replace_terminal_operation',
        'crm_search_transition_global_control',
        'crm_search_transition_policy', 'crm_search_transition_dead_letter',
        'crm_search_configure_candidate_schema', 'crm_search_promote_candidate_schema',
        'crm_search_complete_retiring_schema'
      ]::TEXT[])
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_function);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO crm_search_runtime', v_function);
  END LOOP;
END;
$$;

-- GRANT EXECUTE ON FUNCTION crm_search_record_evaluation_run is resolved by
-- exact pg_proc identity above, avoiding overload ambiguity.

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
  crm_search_legal_holds,
  crm_search_legal_hold_releases,
  crm_search_legal_hold_targets,
  crm_search_schema_versions,
  crm_search_rate_cards,
  crm_search_rate_card_revocations,
  crm_search_events,
  crm_search_evaluation_runs,
  crm_search_evaluation_query_evidence,
  crm_search_evaluation_approvals,
  crm_search_evaluation_approval_revocations,
  crm_search_change_approvals,
  crm_search_change_approval_revocations,
  crm_search_audit_log,
  crm_search_retention_attestations
FROM PUBLIC;

REVOKE DELETE, TRUNCATE ON TABLE
  crm_search_organisation_scopes,
  crm_search_global_control,
  crm_search_namespaces,
  crm_search_policies,
  crm_search_source_dirty,
  crm_search_operations,
  crm_search_provider_attempts,
  crm_search_documents,
  crm_search_usage_daily,
  crm_search_usage_reservations,
  crm_search_daily_events,
  crm_search_dead_letters,
  crm_search_client_teardowns,
  crm_search_teardown_vectors,
  crm_search_retention_high_watermarks
FROM PUBLIC;

COMMENT ON TABLE crm_search_source_dirty IS
  'Schema-neutral, bounded latest-intent set. No client/source foreign key permits delete intent to survive source removal.';
COMMENT ON TABLE crm_search_operations IS
  'Per-schema durable provider intent with one pre-admission operation, one provider-pending mutation, and one coalesced successor.';
COMMENT ON TABLE crm_search_documents IS
  'No-content authoritative vector ledger; source identity is non-cascading and vector metadata is never response authority.';
COMMENT ON TABLE crm_search_events IS
  'Access-controlled privacy-safe retrieval telemetry. Raw query/source text and provider bodies are structurally absent.';
COMMENT ON TABLE crm_search_client_teardowns IS
  'Independent authorization and evidence for provider deletion after client/policy/source rows disappear.';
COMMENT ON FUNCTION crm_search_expire_governed_rows(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, INTEGER
) IS 'Narrow legal-hold-aware, high-watermark-CAS retention boundary that attests before bounded deletion.';

RESET ROLE;

DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE CREATE ON SCHEMA %I FROM crm_search_governor',
    pg_catalog.current_schema()
  );
  EXECUTE pg_catalog.format(
    'REVOKE crm_search_governor FROM %I',
    SESSION_USER
  );
END;
$$;

COMMIT;
