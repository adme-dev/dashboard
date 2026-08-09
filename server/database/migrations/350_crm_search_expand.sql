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
      pg_catalog.lower(public.crm_search_normalize_text(p_domain, 253)) AS domain,
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
  evidence_bundle_hash TEXT CHECK (evidence_bundle_hash IS NULL OR evidence_bundle_hash ~ '^[a-f0-9]{64}$'),
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
  normalization_revision TEXT NOT NULL CHECK (char_length(normalization_revision) BETWEEN 1 AND 200),
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens = 512),
  canonical_max_code_points INTEGER NOT NULL CHECK (canonical_max_code_points = 1000),
  abstention_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.7500
    CHECK (abstention_threshold BETWEEN 0 AND 1),
  metadata_index_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (metadata_index_state IN ('pending', 'ready', 'failed')),
  sentinel_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (sentinel_state IN ('pending', 'upsert_pending', 'query_verified', 'delete_pending', 'confirmed_absent', 'failed')),
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
  deployed_environment TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK (deployed_environment IN ('unconfigured', 'test', 'preview', 'production')),
  deployed_git_sha TEXT CHECK (deployed_git_sha IS NULL OR deployed_git_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  artifact_manifest_digest TEXT CHECK (
    artifact_manifest_digest IS NULL OR artifact_manifest_digest ~ '^[a-f0-9]{64}$'
  ),
  evidence_bundle_hash TEXT CHECK (
    evidence_bundle_hash IS NULL OR evidence_bundle_hash ~ '^[a-f0-9]{64}$'
  ),
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
    WHEN 'processing' THEN p_to IN ('processing', 'provider_pending', 'retryable', 'superseded', 'terminal_dead_letter')
    WHEN 'retryable' THEN p_to IN ('retryable', 'pending_transport', 'queued', 'processing', 'superseded', 'terminal_dead_letter')
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
      'pending_transport', 'queued', 'processing', 'provider_pending', 'retryable',
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
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version,
    source_revision, source_event_sequence, desired_action
  ),
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
  CHECK (state <> 'confirmed' OR confirmed_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_pre_admission
  ON crm_search_operations (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version
  )
  WHERE successor_of IS NULL
    AND state IN ('pending_transport', 'queued', 'processing', 'retryable');

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_provider_pending
  ON crm_search_operations (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version
  )
  WHERE state = 'provider_pending';

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_successor
  ON crm_search_operations (
    organisation_scope_id, client_id, entity_type, entity_id, schema_version
  )
  WHERE successor_of IS NOT NULL
    AND state IN ('pending_transport', 'queued', 'processing', 'retryable');

CREATE INDEX IF NOT EXISTS crm_search_operations_claim
  ON crm_search_operations (next_attempt_at, created_at, id)
  WHERE state IN ('pending_transport', 'retryable') AND lease_token IS NULL;

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
  control_revision BIGINT NOT NULL CHECK (control_revision >= 0),
  policy_revision BIGINT NOT NULL CHECK (policy_revision >= 0),
  rate_card_id UUID NOT NULL REFERENCES crm_search_rate_cards(id) ON DELETE RESTRICT,
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
  UNIQUE (correlation_id, usage_kind, operation_id),
  CHECK (
    state = 'reserved'
    OR (settled_at IS NOT NULL AND provider_call_sent IS NOT NULL AND completion_class IS NOT NULL)
  ),
  CHECK (state <> 'released_no_call' OR provider_call_sent = FALSE),
  CHECK (state NOT IN ('charged', 'late_charged') OR provider_call_sent = TRUE)
);

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
    CHECK (jsonb_typeof(rank_evidence) = 'object' AND octet_length(rank_evidence::TEXT) <= 8192),
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
  CHECK (query_digest IS NULL = (query_digest_key_version IS NULL)),
  CHECK (
    NOT (rank_evidence ?| ARRAY[
      'rawQuery', 'query', 'sourceText', 'providerError', 'vectorValues', 'requestUrl'
    ])
  )
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
  preregistration_sha256 TEXT CHECK (preregistration_sha256 IS NULL OR preregistration_sha256 ~ '^[a-f0-9]{64}$'),
  adjudication_sha256 TEXT CHECK (adjudication_sha256 IS NULL OR adjudication_sha256 ~ '^[a-f0-9]{64}$'),
  implementation_git_sha TEXT NOT NULL
    CHECK (implementation_git_sha ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  artifact_manifest_digest TEXT NOT NULL CHECK (artifact_manifest_digest ~ '^[a-f0-9]{64}$'),
  pages_bundle_digest TEXT NOT NULL CHECK (pages_bundle_digest ~ '^[a-f0-9]{64}$'),
  worker_bundle_digest TEXT NOT NULL CHECK (worker_bundle_digest ~ '^[a-f0-9]{64}$'),
  binding_manifest_digest TEXT CHECK (binding_manifest_digest IS NULL OR binding_manifest_digest ~ '^[a-f0-9]{64}$'),
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
  environment TEXT NOT NULL CHECK (environment IN ('test', 'preview')),
  load_protocol_digest TEXT NOT NULL CHECK (load_protocol_digest ~ '^[a-f0-9]{64}$'),
  rate_card_id UUID REFERENCES crm_search_rate_cards(id) ON DELETE RESTRICT,
  implementation_author_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  fixture_author_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  judgement_author_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  domain_reviewer_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  adjudicator_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  runner_id UUID NOT NULL,
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
  concurrent_budget_safe BOOLEAN NOT NULL DEFAULT FALSE,
  capacity_headroom_safe BOOLEAN NOT NULL DEFAULT FALSE,
  shadow_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  shadow_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years'),
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (evaluation_run_id, query_key_digest),
  CHECK (shadow_eligible = FALSE OR shadow_observed_at IS NOT NULL)
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
  organisation_scope_id UUID NOT NULL
    REFERENCES crm_search_organisation_scopes(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('global', 'client')),
  client_id UUID,
  maximum_cost_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (maximum_cost_usd_micros >= 0),
  expected_control_revision BIGINT CHECK (expected_control_revision IS NULL OR expected_control_revision >= 0),
  expected_policy_revision BIGINT CHECK (expected_policy_revision IS NULL OR expected_policy_revision >= 0),
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
  CHECK (approval_type <> 'client_assist' OR scope_kind = 'client')
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_search_change_approvals_exact_authority
  ON crm_search_change_approvals (
    approval_type, environment, implementation_git_sha, artifact_manifest_digest,
    organisation_scope_id,
    COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::UUID),
    expected_control_revision,
    expected_policy_revision,
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
    AND NOT (details ?| ARRAY[
      'rawQuery', 'query', 'sourceText', 'providerError', 'providerBody',
      'vectorValues', 'requestBody', 'requestUrl'
    ])
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  UNIQUE (origin, operation_id),
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
  )
);

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
  last_attestation_hash TEXT NOT NULL DEFAULT repeat('0', 64)
    CHECK (last_attestation_hash ~ '^[a-f0-9]{64}$'),
  high_watermark_hash TEXT NOT NULL CHECK (high_watermark_hash ~ '^[a-f0-9]{64}$'),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_table, partition_name)
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

CREATE OR REPLACE FUNCTION crm_search_guard_operation_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT public.crm_search_operation_state_transition_allowed(OLD.state, NEW.state) THEN
    RAISE EXCEPTION 'invalid CRM search operation transition from % to %', OLD.state, NEW.state;
  END IF;

  IF OLD.state NOT IN ('pending_transport', 'queued', 'retryable')
     AND ROW(
       NEW.organisation_scope_id, NEW.client_id, NEW.entity_type, NEW.entity_id,
       NEW.schema_version, NEW.source_revision, NEW.source_event_sequence,
       NEW.desired_action, NEW.vector_id, NEW.namespace, NEW.content_hash,
       NEW.confirmation_tag, NEW.confirmation_key_version, NEW.successor_of
     ) IS DISTINCT FROM ROW(
       OLD.organisation_scope_id, OLD.client_id, OLD.entity_type, OLD.entity_id,
       OLD.schema_version, OLD.source_revision, OLD.source_event_sequence,
       OLD.desired_action, OLD.vector_id, OLD.namespace, OLD.content_hash,
       OLD.confirmation_tag, OLD.confirmation_key_version, OLD.successor_of
     ) THEN
    RAISE EXCEPTION 'admitted CRM search operation identity is immutable';
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
  p_reason TEXT,
  p_audit_log_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  current_row public.crm_search_dead_letters%ROWTYPE;
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

  UPDATE public.crm_search_dead_letters
  SET resolution_state = p_next_state,
      resolver_id = CASE WHEN p_next_state IN ('resolved', 'dismissed') THEN p_actor_id ELSE resolver_id END,
      resolution_reason = CASE WHEN p_next_state IN ('resolved', 'dismissed') THEN btrim(p_reason) ELSE resolution_reason END,
      audit_log_id = COALESCE(p_audit_log_id, audit_log_id)
  WHERE id = p_dead_letter_id;
  RETURN p_next_state;
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
  p_query_evidence_bundle_sha256 TEXT,
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
  p_environment TEXT,
  p_load_protocol_digest TEXT,
  p_rate_card_id UUID,
  p_implementation_author_ids UUID[],
  p_fixture_author_ids UUID[],
  p_judgement_author_ids UUID[],
  p_domain_reviewer_ids UUID[],
  p_adjudicator_ids UUID[],
  p_runner_id UUID,
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
  v_natural_delta_ci_lower NUMERIC;
  v_semantic_added_latency_p95 NUMERIC;
  v_assist_latency_p95 NUMERIC;
  v_keyword_latency_p95 NUMERIC;
  v_fallback_rate NUMERIC;
  v_late_completion_rate NUMERIC;
  v_budgets_safe BOOLEAN;
  v_capacity_safe BOOLEAN;
  v_shadow_clients BIGINT;
  v_shadow_min_per_client BIGINT;
  v_shadow_first TIMESTAMPTZ;
  v_shadow_last TIMESTAMPTZ;
  v_metric_bundle JSONB;
  v_gate_passed BOOLEAN;
BEGIN
  IF p_runner_id IS NULL
     OR jsonb_typeof(p_query_evidence) <> 'array'
     OR jsonb_array_length(p_query_evidence) = 0 THEN
    RAISE EXCEPTION 'CRM search evaluation requires query-level evidence and a runner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_query_evidence) AS evidence(item)
    WHERE jsonb_typeof(item) <> 'object'
       OR item - ARRAY[
         'queryKeyDigest', 'clientKeyDigest', 'strata',
         'keywordNdcg10', 'assistNdcg10', 'keywordMrr', 'assistMrr',
         'keywordFalsePositive', 'assistFalsePositive',
         'crossClientLeakageCount', 'unauthorizedLeakageCount',
         'deletedRecordLeakageCount', 'semanticAddedLatencyMs',
         'keywordLatencyMs', 'assistLatencyMs', 'fallback',
         'lateBilledCompletion', 'concurrentBudgetSafe',
         'capacityHeadroomSafe', 'shadowEligible', 'shadowObservedAt'
       ]::TEXT[] <> '{}'::JSONB
  ) THEN
    RAISE EXCEPTION 'CRM search evaluation contains unknown or aggregate-only evidence';
  END IF;

  IF NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_implementation_author_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_fixture_author_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_judgement_author_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]))
     OR NOT public.crm_search_uuid_array_is_distinct(COALESCE(p_adjudicator_ids, ARRAY[]::UUID[])) THEN
    RAISE EXCEPTION 'CRM search evaluation actor lists must be distinct and non-null';
  END IF;

  WITH evidence AS (
    SELECT
      item->>'clientKeyDigest' AS client_key_digest,
      ARRAY(
        SELECT stratum
        FROM jsonb_array_elements_text(COALESCE(item->'strata', '[]'::JSONB)) AS values(stratum)
      ) AS strata,
      (item->>'keywordNdcg10')::NUMERIC AS keyword_ndcg,
      (item->>'assistNdcg10')::NUMERIC AS assist_ndcg,
      (item->>'keywordMrr')::NUMERIC AS keyword_mrr,
      (item->>'assistMrr')::NUMERIC AS assist_mrr,
      (item->>'keywordFalsePositive')::BOOLEAN AS keyword_false_positive,
      (item->>'assistFalsePositive')::BOOLEAN AS assist_false_positive,
      COALESCE((item->>'crossClientLeakageCount')::BIGINT, 0) AS cross_client_leakage,
      COALESCE((item->>'unauthorizedLeakageCount')::BIGINT, 0) AS unauthorized_leakage,
      COALESCE((item->>'deletedRecordLeakageCount')::BIGINT, 0) AS deleted_leakage,
      COALESCE((item->>'semanticAddedLatencyMs')::NUMERIC, 0) AS semantic_added_latency,
      COALESCE((item->>'keywordLatencyMs')::NUMERIC, 0) AS keyword_latency,
      COALESCE((item->>'assistLatencyMs')::NUMERIC, 0) AS assist_latency,
      COALESCE((item->>'fallback')::BOOLEAN, FALSE) AS fallback,
      COALESCE((item->>'lateBilledCompletion')::BOOLEAN, FALSE) AS late_completion,
      COALESCE((item->>'concurrentBudgetSafe')::BOOLEAN, FALSE) AS budget_safe,
      COALESCE((item->>'capacityHeadroomSafe')::BOOLEAN, FALSE) AS capacity_safe,
      COALESCE((item->>'shadowEligible')::BOOLEAN, FALSE) AS shadow_eligible,
      NULLIF(item->>'shadowObservedAt', '')::TIMESTAMPTZ AS shadow_observed_at
    FROM jsonb_array_elements(p_query_evidence) AS query(item)
  )
  SELECT
    COUNT(*),
    COUNT(DISTINCT client_key_digest),
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
    COALESCE(
      AVG(assist_ndcg - keyword_ndcg) FILTER (WHERE 'natural_language' = ANY(strata))
      - 1.96 * COALESCE(
        STDDEV_SAMP(assist_ndcg - keyword_ndcg) FILTER (WHERE 'natural_language' = ANY(strata)),
        0
      ) / NULLIF(SQRT(COUNT(*) FILTER (WHERE 'natural_language' = ANY(strata))), 0),
      -1
    ),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY semantic_added_latency), 0),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY assist_latency), 0),
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY keyword_latency), 0),
    COALESCE(AVG(fallback::INT), 0),
    COALESCE(AVG(late_completion::INT), 0),
    COALESCE(BOOL_AND(budget_safe), FALSE),
    COALESCE(BOOL_AND(capacity_safe), FALSE),
    COUNT(DISTINCT client_key_digest) FILTER (WHERE shadow_eligible),
    MIN(shadow_observed_at) FILTER (WHERE shadow_eligible),
    MAX(shadow_observed_at) FILTER (WHERE shadow_eligible)
  INTO
    v_total, v_clients, v_natural, v_exact_identifier, v_no_result, v_cross_client,
    v_leakage, v_keyword_natural_ndcg, v_assist_natural_ndcg,
    v_keyword_natural_mrr, v_assist_natural_mrr,
    v_keyword_exact_ndcg, v_assist_exact_ndcg, v_keyword_exact_mrr, v_assist_exact_mrr,
    v_keyword_no_result_false_positives, v_assist_no_result_false_positives,
    v_natural_delta_ci_lower, v_semantic_added_latency_p95,
    v_assist_latency_p95, v_keyword_latency_p95, v_fallback_rate,
    v_late_completion_rate, v_budgets_safe, v_capacity_safe,
    v_shadow_clients, v_shadow_first, v_shadow_last
  FROM evidence;

  WITH evidence AS (
    SELECT
      item->>'clientKeyDigest' AS client_key_digest,
      COALESCE((item->>'shadowEligible')::BOOLEAN, FALSE) AS shadow_eligible
    FROM jsonb_array_elements(p_query_evidence) AS query(item)
  ), samples AS (
    SELECT client_key_digest, COUNT(*) AS sample_count
    FROM evidence
    WHERE shadow_eligible
    GROUP BY client_key_digest
  )
  SELECT COALESCE(MIN(sample_count), 0)
  INTO v_shadow_min_per_client
  FROM samples;

  v_gate_passed :=
    v_total >= 360
    AND v_clients >= 3
    AND v_natural >= 120
    AND v_exact_identifier >= 60
    AND v_no_result >= 60
    AND v_cross_client >= 60
    AND v_leakage = 0
    AND v_assist_exact_ndcg >= v_keyword_exact_ndcg
    AND v_assist_exact_mrr >= v_keyword_exact_mrr
    AND v_assist_natural_ndcg >= v_keyword_natural_ndcg * 1.10
    AND v_assist_natural_mrr >= v_keyword_natural_mrr
    AND v_assist_no_result_false_positives <= v_keyword_no_result_false_positives
    AND v_natural_delta_ci_lower > 0
    AND v_semantic_added_latency_p95 <= 500
    AND v_assist_latency_p95 <= v_keyword_latency_p95 + 500
    AND v_fallback_rate <= 0.05
    AND v_late_completion_rate <= 0.01
    AND v_budgets_safe
    AND v_capacity_safe
    AND v_shadow_clients >= 3
    AND v_shadow_min_per_client >= 200
    AND v_shadow_last - v_shadow_first >= INTERVAL '6 days'
    AND cardinality(COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[])) >= 2
    AND p_preregistration_sha256 IS NOT NULL
    AND p_adjudication_sha256 IS NOT NULL
    AND NOT (COALESCE(p_implementation_author_ids, ARRAY[]::UUID[]) && COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]))
    AND NOT (COALESCE(p_fixture_author_ids, ARRAY[]::UUID[]) && COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]))
    AND NOT (COALESCE(p_judgement_author_ids, ARRAY[]::UUID[]) && ARRAY[p_runner_id]::UUID[]);

  v_metric_bundle := jsonb_build_object(
    'queryCount', v_total,
    'clientCount', v_clients,
    'naturalLanguageCount', v_natural,
    'exactIdentifierCount', v_exact_identifier,
    'noResultCount', v_no_result,
    'crossClientCount', v_cross_client,
    'leakageCount', v_leakage,
    'keywordNaturalNdcg10', v_keyword_natural_ndcg,
    'assistNaturalNdcg10', v_assist_natural_ndcg,
    'keywordNaturalMrr', v_keyword_natural_mrr,
    'assistNaturalMrr', v_assist_natural_mrr,
    'naturalDeltaConfidenceLower', v_natural_delta_ci_lower,
    'semanticAddedLatencyP95Ms', v_semantic_added_latency_p95,
    'assistLatencyP95Ms', v_assist_latency_p95,
    'fallbackRate', v_fallback_rate,
    'lateCompletionRate', v_late_completion_rate,
    'shadowClientCount', v_shadow_clients,
    'shadowMinimumPerClient', v_shadow_min_per_client
  );

  INSERT INTO public.crm_search_evaluation_runs (
    id, organisation_scope_id, schema_version, dataset_version, dataset_sha256,
    sealed_judgement_sha256, query_evidence_bundle_sha256, preregistration_sha256,
    adjudication_sha256, implementation_git_sha, artifact_manifest_digest,
    pages_bundle_digest, worker_bundle_digest, binding_manifest_digest,
    preview_pages_deployment_id, preview_worker_deployment_id, model_id, pooling,
    tokenizer_revision, document_builder_revision, ranking_revision,
    threshold_revision, environment, load_protocol_digest, rate_card_id,
    implementation_author_ids, fixture_author_ids, judgement_author_ids,
    domain_reviewer_ids, adjudicator_ids, runner_id, metric_bundle, gate_passed,
    created_at, expires_at, retention_expires_at
  ) VALUES (
    v_run_id, p_organisation_scope_id, p_schema_version, p_dataset_version,
    p_dataset_sha256, p_sealed_judgement_sha256, p_query_evidence_bundle_sha256,
    p_preregistration_sha256, p_adjudication_sha256, p_implementation_git_sha,
    p_artifact_manifest_digest, p_pages_bundle_digest, p_worker_bundle_digest,
    p_binding_manifest_digest, p_preview_pages_deployment_id,
    p_preview_worker_deployment_id, p_model_id, p_pooling, p_tokenizer_revision,
    p_document_builder_revision, p_ranking_revision, p_threshold_revision,
    p_environment, p_load_protocol_digest, p_rate_card_id,
    COALESCE(p_implementation_author_ids, ARRAY[]::UUID[]),
    COALESCE(p_fixture_author_ids, ARRAY[]::UUID[]),
    COALESCE(p_judgement_author_ids, ARRAY[]::UUID[]),
    COALESCE(p_domain_reviewer_ids, ARRAY[]::UUID[]),
    COALESCE(p_adjudicator_ids, ARRAY[]::UUID[]), p_runner_id, v_metric_bundle,
    v_gate_passed, v_created_at, v_created_at + INTERVAL '14 days',
    v_created_at + INTERVAL '2 years'
  );

  INSERT INTO public.crm_search_evaluation_query_evidence (
    evaluation_run_id, query_key_digest, client_key_digest, strata,
    keyword_ndcg10, assist_ndcg10, keyword_mrr, assist_mrr,
    keyword_false_positive, assist_false_positive, cross_client_leakage_count,
    unauthorized_leakage_count, deleted_record_leakage_count,
    semantic_added_latency_ms, keyword_latency_ms, assist_latency_ms, fallback,
    late_billed_completion, concurrent_budget_safe, capacity_headroom_safe,
    shadow_eligible, shadow_observed_at, retention_expires_at
  )
  SELECT
    v_run_id,
    item->>'queryKeyDigest',
    item->>'clientKeyDigest',
    ARRAY(
      SELECT stratum
      FROM jsonb_array_elements_text(COALESCE(item->'strata', '[]'::JSONB)) AS values(stratum)
    ),
    (item->>'keywordNdcg10')::NUMERIC,
    (item->>'assistNdcg10')::NUMERIC,
    (item->>'keywordMrr')::NUMERIC,
    (item->>'assistMrr')::NUMERIC,
    (item->>'keywordFalsePositive')::BOOLEAN,
    (item->>'assistFalsePositive')::BOOLEAN,
    COALESCE((item->>'crossClientLeakageCount')::INTEGER, 0),
    COALESCE((item->>'unauthorizedLeakageCount')::INTEGER, 0),
    COALESCE((item->>'deletedRecordLeakageCount')::INTEGER, 0),
    COALESCE((item->>'semanticAddedLatencyMs')::INTEGER, 0),
    COALESCE((item->>'keywordLatencyMs')::INTEGER, 0),
    COALESCE((item->>'assistLatencyMs')::INTEGER, 0),
    COALESCE((item->>'fallback')::BOOLEAN, FALSE),
    COALESCE((item->>'lateBilledCompletion')::BOOLEAN, FALSE),
    COALESCE((item->>'concurrentBudgetSafe')::BOOLEAN, FALSE),
    COALESCE((item->>'capacityHeadroomSafe')::BOOLEAN, FALSE),
    COALESCE((item->>'shadowEligible')::BOOLEAN, FALSE),
    NULLIF(item->>'shadowObservedAt', '')::TIMESTAMPTZ,
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
    'crm_search_documents',
    'crm_search_usage_daily',
    'crm_search_usage_reservations',
    'crm_search_events',
    'crm_search_daily_events',
    'crm_search_evaluation_runs',
    'crm_search_evaluation_query_evidence',
    'crm_search_evaluation_approvals',
    'crm_search_evaluation_approval_revocations',
    'crm_search_change_approvals',
    'crm_search_change_approval_revocations',
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
  v_target_exists BOOLEAN;
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

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)',
    p_target_table
  ) INTO v_target_exists USING p_target_row_id;
  IF NOT v_target_exists THEN
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
  v_attestation_id UUID := gen_random_uuid();
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
    SELECT 1
    FROM pg_catalog.pg_inherits
    WHERE inhparent = v_target_oid AND inhrelid = v_partition_oid
  ) THEN
    RAISE EXCEPTION 'CRM search retention partition is not owned by the target table';
  END IF;

  INSERT INTO public.crm_search_retention_high_watermarks (
    target_table, partition_name, high_watermark_hash
  ) VALUES (
    p_target_table, p_partition_name, repeat('0', 64)
  )
  ON CONFLICT (target_table, partition_name) DO NOTHING;

  SELECT * INTO v_watermark
  FROM public.crm_search_retention_high_watermarks
  WHERE target_table = p_target_table AND partition_name = p_partition_name
  FOR UPDATE;

  IF v_watermark.high_watermark_hash IS DISTINCT FROM p_expected_high_watermark_hash THEN
    RAISE EXCEPTION 'CRM search retention high-watermark hash changed';
  END IF;
  IF p_expire_through <= v_watermark.last_expire_through THEN
    RAISE EXCEPTION 'CRM search retention high-watermark must move forward';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT COALESCE(pg_catalog.array_agg(candidate.id), ARRAY[]::UUID[])
       FROM (
         SELECT retained.id
         FROM public.%I retained
         WHERE retained.retention_expires_at <= $1
           AND (
             retained.legal_hold_id IS NULL
             OR EXISTS (
               SELECT 1
               FROM public.crm_search_legal_hold_releases direct_release
               WHERE direct_release.legal_hold_id = retained.legal_hold_id
             )
           )
           AND NOT EXISTS (
             SELECT 1
             FROM public.crm_search_legal_hold_targets held_target
             JOIN public.crm_search_legal_holds active_hold
               ON active_hold.id = held_target.legal_hold_id
             LEFT JOIN public.crm_search_legal_hold_releases hold_release
               ON hold_release.legal_hold_id = active_hold.id
             WHERE held_target.target_table = $2
               AND held_target.target_row_id = retained.id
               AND hold_release.id IS NULL
           )
         ORDER BY retained.retention_expires_at, retained.id
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       ) candidate',
    p_partition_name
  ) INTO v_candidate_ids USING p_expire_through, p_target_table, p_limit;

  v_row_count := COALESCE(pg_catalog.cardinality(v_candidate_ids), 0);
  v_attestation_hash := public.crm_search_projection_hash(
    pg_catalog.concat_ws(
      '|', p_target_table, p_partition_name,
      v_watermark.last_expire_through::TEXT, p_expire_through::TEXT,
      v_row_count::TEXT, v_watermark.last_attestation_hash,
      p_deletion_manifest_hash, p_executor_id::TEXT,
      COALESCE(p_secondary_approver_id::TEXT, '')
    )
  );

  INSERT INTO public.crm_search_retention_attestations (
    id, target_table, partition_name, range_start, range_end, row_count,
    prior_attestation_hash, deletion_manifest_hash, attestation_hash,
    executor_id, secondary_approver_id
  ) VALUES (
    v_attestation_id, p_target_table, p_partition_name,
    v_watermark.last_expire_through, p_expire_through, v_row_count,
    v_watermark.last_attestation_hash, p_deletion_manifest_hash,
    v_attestation_hash, p_executor_id, p_secondary_approver_id
  );

  PERFORM pg_catalog.set_config(
    'crm_search.retention_attestation_id', v_attestation_id::TEXT, TRUE
  );
  PERFORM pg_catalog.set_config(
    'crm_search.retention_target_table', p_target_table, TRUE
  );

  IF v_row_count > 0 THEN
    EXECUTE pg_catalog.format(
      'DELETE FROM public.%I WHERE id = ANY($1)',
      p_partition_name
    ) USING v_candidate_ids;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count <> v_row_count THEN
      RAISE EXCEPTION 'CRM search retention deletion count changed';
    END IF;
  END IF;

  v_next_high_watermark_hash := public.crm_search_projection_hash(
    pg_catalog.concat_ws(
      '|', p_target_table, p_partition_name, p_expire_through::TEXT,
      v_attestation_hash, (v_watermark.revision + 1)::TEXT
    )
  );

  UPDATE public.crm_search_retention_high_watermarks
  SET last_expire_through = p_expire_through,
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
    'attestationId', v_attestation_id,
    'rowCount', v_row_count,
    'attestationHash', v_attestation_hash,
    'highWatermarkHash', v_next_high_watermark_hash
  );
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
  v_new_revision BIGINT;
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

  IF p_next_state = 'enabled'
     AND (v_control.state <> 'enabled' OR p_next_maximum_mode <> v_control.maximum_mode) THEN
    SELECT approval.* INTO v_approval
    FROM public.crm_search_change_approvals approval
    LEFT JOIN public.crm_search_change_approval_revocations revocation
      ON revocation.approval_id = approval.id
    WHERE approval.id = p_change_approval_id
      AND approval.approval_type = 'production_deploy'
      AND approval.scope_kind = 'global'
      AND approval.organisation_scope_id = p_organisation_scope_id
      AND approval.expected_control_revision = p_expected_revision
      AND approval.approved_by <> p_actor_id
      AND approval.expires_at > NOW()
      AND revocation.id IS NULL
    FOR KEY SHARE OF approval;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRM search global-control promotion lacks exact approval';
    END IF;
  END IF;

  UPDATE public.crm_search_global_control
  SET state = p_next_state,
      maximum_mode = p_next_maximum_mode,
      indexing_ready = p_indexing_ready,
      revision = revision + 1,
      environment = CASE
        WHEN p_next_state = 'enabled' THEN COALESCE(v_approval.environment, environment)
        ELSE environment
      END,
      deployed_git_sha = CASE
        WHEN p_next_state = 'enabled' THEN COALESCE(v_approval.implementation_git_sha, deployed_git_sha)
        ELSE deployed_git_sha
      END,
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
  p_change_approval_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_policy public.crm_search_policies%ROWTYPE;
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

  v_required_approval_type := CASE
    WHEN v_policy.lifecycle_state = 'off' AND p_next_lifecycle_state = 'indexing' THEN 'client_indexing'
    WHEN v_policy.lifecycle_state = 'indexing' AND p_next_lifecycle_state = 'shadow' THEN 'client_shadow'
    WHEN v_policy.lifecycle_state = 'shadow' AND p_next_lifecycle_state = 'assist' THEN 'client_assist'
    ELSE NULL
  END;

  IF v_required_approval_type IS NOT NULL THEN
    SELECT approval.* INTO v_approval
    FROM public.crm_search_change_approvals approval
    LEFT JOIN public.crm_search_change_approval_revocations revocation
      ON revocation.approval_id = approval.id
    WHERE approval.id = p_change_approval_id
      AND approval.approval_type = v_required_approval_type
      AND approval.scope_kind = 'client'
      AND approval.organisation_scope_id = p_organisation_scope_id
      AND approval.client_id = p_client_id
      AND approval.expected_policy_revision = p_expected_revision
      AND approval.approved_by <> p_actor_id
      AND approval.expires_at > NOW()
      AND revocation.id IS NULL
    FOR KEY SHARE OF approval;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRM search policy promotion lacks exact approval';
    END IF;
  END IF;

  IF v_policy.lifecycle_state = 'teardown_pending' AND p_next_lifecycle_state = 'off'
     AND NOT EXISTS (
       SELECT 1
       FROM public.crm_search_client_teardowns teardown
       WHERE teardown.organisation_scope_id = p_organisation_scope_id
         AND teardown.client_id = p_client_id
         AND teardown.state = 'confirmed'
         AND teardown.provider_deletion_state = 'confirmed_absent'
     ) THEN
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
      AND run.query_evidence_bundle_sha256 = v_approval.evidence_bundle_hash
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRM search assist evaluation does not match deployed evidence';
    END IF;

    SELECT evaluation_approval.* INTO v_eval_approval
    FROM public.crm_search_evaluation_approvals evaluation_approval
    LEFT JOIN public.crm_search_evaluation_approval_revocations revocation
      ON revocation.approval_id = evaluation_approval.id
    WHERE evaluation_approval.evaluation_run_id = v_eval.id
      AND evaluation_approval.planned_policy_updater = p_actor_id
      AND evaluation_approval.expires_at > NOW()
      AND evaluation_approval.approved_by <> v_approval.approved_by
      AND revocation.id IS NULL
    ORDER BY evaluation_approval.approved_at DESC
    LIMIT 1
    FOR KEY SHARE OF evaluation_approval;
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
      evidence_bundle_hash = CASE
        WHEN v_required_approval_type IS NOT NULL THEN v_approval.evidence_bundle_hash
        ELSE evidence_bundle_hash
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
  v_attestation_id UUID;
  v_target_table TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    BEGIN
      v_attestation_id := NULLIF(
        pg_catalog.current_setting('crm_search.retention_attestation_id', TRUE),
        ''
      )::UUID;
      v_target_table := NULLIF(
        pg_catalog.current_setting('crm_search.retention_target_table', TRUE),
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      v_attestation_id := NULL;
      v_target_table := NULL;
    END;

    IF v_attestation_id IS NOT NULL
       AND v_target_table IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.crm_search_retention_attestations attestation
         WHERE attestation.id = v_attestation_id
           AND attestation.target_table = v_target_table
           AND attestation.created_at = NOW()
       ) THEN
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

DROP TRIGGER IF EXISTS crm_search_change_approvals_immutable ON crm_search_change_approvals;
CREATE TRIGGER crm_search_change_approvals_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_change_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

DROP TRIGGER IF EXISTS crm_search_change_approval_revocations_immutable
  ON crm_search_change_approval_revocations;
CREATE TRIGGER crm_search_change_approval_revocations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON crm_search_change_approval_revocations
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
  crm_search_documents,
  crm_search_usage_daily,
  crm_search_usage_reservations,
  crm_search_daily_events,
  crm_search_dead_letters,
  crm_search_client_teardowns,
  crm_search_teardown_vectors,
  crm_search_retention_high_watermarks
FROM PUBLIC;

REVOKE ALL ON FUNCTION crm_search_place_legal_hold(UUID, UUID, TEXT, TEXT, UUID, UUID)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_search_release_legal_hold(UUID, UUID, UUID, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_search_attach_legal_hold(UUID, TEXT, UUID, UUID)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_search_expire_governed_rows(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_search_record_evaluation_run(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID,
  UUID[], UUID[], UUID[], UUID[], UUID[], UUID, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_search_transition_global_control(
  UUID, BIGINT, TEXT, TEXT, BOOLEAN, UUID, TEXT, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_search_transition_policy(
  UUID, UUID, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION crm_search_transition_dead_letter(
  UUID, TEXT, TEXT, UUID, TEXT, UUID
) FROM PUBLIC;

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

COMMIT;
