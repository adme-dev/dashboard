BEGIN;

-- 351_crm_search_validate_backfill.sql
-- Install and validate the one fixed CRM-search installation contract while
-- every provider-facing path remains halted. Source capture is deliberately
-- deferred to migration 352 so this phase can be rolled back independently.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('crm-search-migration-351', 351)
);

LOCK TABLE agency_clients, crm_people, crm_companies, crm_opportunities
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger trigger_row
    WHERE trigger_row.tgrelid = ANY(ARRAY[
      'crm_people'::REGCLASS,
      'crm_companies'::REGCLASS,
      'crm_opportunities'::REGCLASS,
      'agency_clients'::REGCLASS
    ]::OID[])
      AND trigger_row.tgname LIKE 'crm_search_capture_%'
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'CRM search validation phase found capture triggers before activation';
  END IF;
END;
$$;

-- Existing rows predate trigger ownership. Only zero is rewritten; positive
-- revisions are already monotonic evidence and must never be renumbered.
UPDATE crm_people
SET search_revision = 1
WHERE search_revision = 0;

UPDATE crm_companies
SET search_revision = 1
WHERE search_revision = 0;

UPDATE crm_opportunities
SET search_revision = 1
WHERE search_revision = 0;

DO $$
DECLARE
  v_schema TEXT := pg_catalog.current_schema();
BEGIN
  EXECUTE pg_catalog.format('GRANT crm_search_governor TO %I', SESSION_USER);
  EXECUTE pg_catalog.format(
    'GRANT USAGE, CREATE ON SCHEMA %I TO crm_search_governor',
    v_schema
  );
END;
$$;

GRANT SELECT ON TABLE agency_clients TO crm_search_governor;

SET LOCAL ROLE crm_search_governor;

INSERT INTO crm_search_organisation_scopes (
  id,
  scope_key,
  scope_kind,
  is_primary,
  is_active,
  identity_locked_at
)
VALUES (
  '00000000-0000-4351-8351-000000000001',
  'xeroflow-agency-installation-v1',
  'installation',
  TRUE,
  TRUE,
  TIMESTAMPTZ '2026-08-09 00:00:00+00'
)
ON CONFLICT DO NOTHING;

INSERT INTO crm_search_schema_versions (
  id,
  organisation_scope_id,
  schema_version,
  model_id,
  dimensions,
  distance_metric,
  pooling,
  tokenizer_revision,
  document_builder_revision,
  ranking_revision,
  threshold_revision,
  normalization_revision,
  max_input_tokens,
  canonical_max_code_points,
  abstention_threshold,
  metadata_index_state,
  sentinel_state,
  captured_source_high_watermark,
  confirmed_source_high_watermark,
  provider_contract_digest,
  created_by,
  created_at,
  retention_expires_at
)
VALUES (
  '00000000-0000-4351-8351-000000000003',
  '00000000-0000-4351-8351-000000000001',
  'crm-search-v1',
  '@cf/baai/bge-base-en-v1.5',
  768,
  'cosine',
  'cls',
  'bge-base-en-v1.5-tokenizer-v1',
  'crm-search-document-v1',
  'rrf-v1',
  'cosine-0.75-v1',
  'nfkc-controls-whitespace-v1',
  512,
  1000,
  0.7500,
  'pending',
  'pending',
  0,
  0,
  '7f45694a470c77183c98961c4a5c0ae28cb0905bf47090020c6f7f600637904a',
  '00000000-0000-4351-8351-000000000002',
  TIMESTAMPTZ '2026-08-09 00:00:00+00',
  TIMESTAMPTZ '2028-08-09 00:00:00+00'
)
ON CONFLICT DO NOTHING;

INSERT INTO crm_search_rate_cards (
  id,
  organisation_scope_id,
  provider,
  revision,
  model_id,
  model_input_usd_micros_per_million_tokens,
  queried_dimension_usd_micros_per_million,
  inserted_dimension_usd_micros_per_million,
  stored_dimension_usd_micros_per_million_month,
  included_model_tokens,
  included_queried_dimensions,
  included_inserted_dimensions,
  included_stored_dimensions,
  source_revision_digest,
  valid_from,
  valid_until,
  created_by,
  created_at,
  retention_expires_at
)
VALUES (
  '00000000-0000-4351-8351-000000000004',
  '00000000-0000-4351-8351-000000000001',
  'cloudflare_workers_ai_vectorize',
  'cloudflare-2026-08-09',
  '@cf/baai/bge-base-en-v1.5',
  67000,
  10000,
  10000,
  500,
  0,
  0,
  0,
  0,
  'e482822982a288940ce78f9b996fdf82635bd91829d5ce029b6c2f52c26e8cdc',
  TIMESTAMPTZ '2026-08-09 00:00:00+00',
  TIMESTAMPTZ '2027-08-09 00:00:00+00',
  '00000000-0000-4351-8351-000000000002',
  TIMESTAMPTZ '2026-08-09 00:00:00+00',
  TIMESTAMPTZ '2027-09-13 00:00:00+00'
)
ON CONFLICT DO NOTHING;

INSERT INTO crm_search_global_control (
  organisation_scope_id,
  state,
  maximum_mode,
  indexing_ready,
  daily_query_budget_usd_micros,
  daily_indexing_budget_usd_micros,
  max_query_provider_calls,
  max_indexing_provider_calls,
  max_query_dimensions,
  max_inserted_dimensions,
  max_stored_dimensions,
  revision,
  environment,
  maximum_cost_usd_micros,
  rate_card_id,
  transition_reason,
  updated_by
)
VALUES (
  '00000000-0000-4351-8351-000000000001',
  'halted',
  'off',
  FALSE,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  'unconfigured',
  0,
  '00000000-0000-4351-8351-000000000004',
  'Fixed installation defaults remain provider halted',
  '00000000-0000-4351-8351-000000000002'
)
ON CONFLICT DO NOTHING;

INSERT INTO crm_search_policies (
  organisation_scope_id,
  client_id,
  lifecycle_state,
  effective_mode,
  indexing_enabled,
  shadow_sample_rate,
  active_schema_version,
  candidate_schema_version,
  retiring_schema_versions,
  daily_query_budget_usd_micros,
  daily_indexing_budget_usd_micros,
  max_query_provider_calls,
  max_indexing_provider_calls,
  max_query_dimensions,
  max_inserted_dimensions,
  max_stored_dimensions,
  semantic_deadline_ms,
  revision,
  deployed_environment,
  maximum_cost_usd_micros,
  rate_card_id,
  transition_reason,
  updated_by
)
SELECT
  '00000000-0000-4351-8351-000000000001',
  client.id,
  'off',
  'off',
  FALSE,
  0,
  NULL,
  NULL,
  ARRAY[]::TEXT[],
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  500,
  0,
  'unconfigured',
  0,
  '00000000-0000-4351-8351-000000000004',
  'Fixed installation client defaults remain provider off',
  '00000000-0000-4351-8351-000000000002'
FROM public.agency_clients client
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_provider_contract CONSTANT TEXT := $provider_contract$schema=crm-search-v1
model=@cf/baai/bge-base-en-v1.5
dimensions=768
distance=cosine
pooling=cls
tokenizer=bge-base-en-v1.5-tokenizer-v1
document_builder=crm-search-document-v1
ranking=rrf-v1
threshold=cosine-0.75-v1
normalization=nfkc-controls-whitespace-v1
max_input_tokens=512
canonical_max_code_points=1000
abstention_threshold=0.7500
person=first_name,last_name,job_title,department,lifecycle_stage
company=name,domain,lifecycle_stage
opportunity=name,status,source$provider_contract$;
  v_rate_card_contract CONSTANT TEXT := $rate_card_contract$provider=cloudflare_workers_ai_vectorize
revision=cloudflare-2026-08-09
model=@cf/baai/bge-base-en-v1.5
model_input_usd_micros_per_million_tokens=67000
queried_dimension_usd_micros_per_million=10000
inserted_dimension_usd_micros_per_million=10000
stored_dimension_usd_micros_per_million_month=500
included_model_tokens=0
included_queried_dimensions=0
included_inserted_dimensions=0
included_stored_dimensions=0$rate_card_contract$;
  v_actual TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_search_organisation_scopes scope_row
    WHERE scope_row.id = '00000000-0000-4351-8351-000000000001'
      AND scope_row.scope_key = 'xeroflow-agency-installation-v1'
      AND scope_row.scope_kind = 'installation'
      AND scope_row.is_primary IS TRUE
      AND scope_row.is_active IS TRUE
      AND scope_row.identity_locked_at = TIMESTAMPTZ '2026-08-09 00:00:00+00'
  ) THEN
    RAISE EXCEPTION 'fixed CRM search installation scope identity does not match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.crm_search_organisation_scopes scope_row
    WHERE scope_row.id <> '00000000-0000-4351-8351-000000000001'
      AND scope_row.is_primary IS TRUE
      AND scope_row.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'fixed CRM search installation scope primary identity mismatch';
  END IF;

  IF public.crm_search_projection_hash(v_provider_contract)
      <> '7f45694a470c77183c98961c4a5c0ae28cb0905bf47090020c6f7f600637904a' THEN
    RAISE EXCEPTION 'CRM search provider contract digest mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_search_schema_versions schema_row
    WHERE schema_row.id = '00000000-0000-4351-8351-000000000003'
      AND schema_row.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
      AND schema_row.schema_version = 'crm-search-v1'
      AND schema_row.model_id = '@cf/baai/bge-base-en-v1.5'
      AND schema_row.dimensions = 768
      AND schema_row.distance_metric = 'cosine'
      AND schema_row.pooling = 'cls'
      AND schema_row.tokenizer_revision = 'bge-base-en-v1.5-tokenizer-v1'
      AND schema_row.document_builder_revision = 'crm-search-document-v1'
      AND schema_row.ranking_revision = 'rrf-v1'
      AND schema_row.threshold_revision = 'cosine-0.75-v1'
      AND schema_row.normalization_revision = 'nfkc-controls-whitespace-v1'
      AND schema_row.max_input_tokens = 512
      AND schema_row.canonical_max_code_points = 1000
      AND schema_row.abstention_threshold = 0.7500
      AND schema_row.metadata_index_state = 'pending'
      AND schema_row.sentinel_state = 'pending'
      AND schema_row.captured_source_high_watermark = 0
      AND schema_row.confirmed_source_high_watermark = 0
      AND schema_row.provider_contract_digest =
        '7f45694a470c77183c98961c4a5c0ae28cb0905bf47090020c6f7f600637904a'
      AND schema_row.created_by = '00000000-0000-4351-8351-000000000002'
      AND schema_row.created_at = TIMESTAMPTZ '2026-08-09 00:00:00+00'
      AND schema_row.retired_at IS NULL
      AND schema_row.retention_expires_at = TIMESTAMPTZ '2028-08-09 00:00:00+00'
      AND schema_row.legal_hold_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CRM search immutable schema v1 contract mismatch';
  END IF;

  IF public.crm_search_projection_hash(v_rate_card_contract)
      <> 'e482822982a288940ce78f9b996fdf82635bd91829d5ce029b6c2f52c26e8cdc' THEN
    RAISE EXCEPTION 'CRM search rate-card source digest mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_search_rate_cards rate_card
    WHERE rate_card.id = '00000000-0000-4351-8351-000000000004'
      AND rate_card.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
      AND rate_card.provider = 'cloudflare_workers_ai_vectorize'
      AND rate_card.revision = 'cloudflare-2026-08-09'
      AND rate_card.model_id = '@cf/baai/bge-base-en-v1.5'
      AND rate_card.model_input_usd_micros_per_million_tokens = 67000
      AND rate_card.queried_dimension_usd_micros_per_million = 10000
      AND rate_card.inserted_dimension_usd_micros_per_million = 10000
      AND rate_card.stored_dimension_usd_micros_per_million_month = 500
      AND rate_card.included_model_tokens = 0
      AND rate_card.included_queried_dimensions = 0
      AND rate_card.included_inserted_dimensions = 0
      AND rate_card.included_stored_dimensions = 0
      AND rate_card.source_revision_digest =
        'e482822982a288940ce78f9b996fdf82635bd91829d5ce029b6c2f52c26e8cdc'
      AND rate_card.valid_from = TIMESTAMPTZ '2026-08-09 00:00:00+00'
      AND rate_card.valid_until = TIMESTAMPTZ '2027-08-09 00:00:00+00'
      AND rate_card.created_by = '00000000-0000-4351-8351-000000000002'
      AND rate_card.created_at = TIMESTAMPTZ '2026-08-09 00:00:00+00'
      AND rate_card.retention_expires_at = TIMESTAMPTZ '2027-09-13 00:00:00+00'
      AND rate_card.legal_hold_id IS NULL
  ) THEN
    RAISE EXCEPTION 'CRM search immutable rate-card contract mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_search_global_control control
    WHERE control.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
      AND control.state = 'halted'
      AND control.maximum_mode = 'off'
      AND control.indexing_ready IS FALSE
      AND control.daily_query_budget_usd_micros = 0
      AND control.daily_indexing_budget_usd_micros = 0
      AND control.max_query_provider_calls = 0
      AND control.max_indexing_provider_calls = 0
      AND control.max_query_dimensions = 0
      AND control.max_inserted_dimensions = 0
      AND control.max_stored_dimensions = 0
      AND control.revision = 0
      AND control.maximum_cost_usd_micros = 0
      AND control.environment = 'unconfigured'
      AND control.deployed_git_sha IS NULL
      AND control.artifact_manifest_digest IS NULL
      AND control.pages_bundle_digest IS NULL
      AND control.worker_bundle_digest IS NULL
      AND control.binding_manifest_digest IS NULL
      AND control.evidence_bundle_hash IS NULL
      AND control.active_deployment_approval_id IS NULL
      AND control.rate_card_id = '00000000-0000-4351-8351-000000000004'
      AND control.transition_reason = 'Fixed installation defaults remain provider halted'
      AND control.updated_by = '00000000-0000-4351-8351-000000000002'
  ) THEN
    RAISE EXCEPTION 'halted/off/zero CRM search control contract does not match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_clients client
    LEFT JOIN public.crm_search_policies policy
      ON policy.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
     AND policy.client_id = client.id
    WHERE policy.id IS NULL
       OR policy.lifecycle_state <> 'off'
       OR policy.effective_mode <> 'off'
       OR policy.indexing_enabled IS TRUE
       OR policy.shadow_sample_rate <> 0
       OR policy.active_schema_version IS NOT NULL
       OR policy.candidate_schema_version IS NOT NULL
       OR cardinality(policy.retiring_schema_versions) <> 0
       OR policy.daily_query_budget_usd_micros <> 0
       OR policy.daily_indexing_budget_usd_micros <> 0
       OR policy.max_query_provider_calls <> 0
       OR policy.max_indexing_provider_calls <> 0
       OR policy.max_query_dimensions <> 0
       OR policy.max_inserted_dimensions <> 0
       OR policy.max_stored_dimensions <> 0
       OR policy.semantic_deadline_ms <> 500
       OR policy.revision <> 0
       OR policy.approved_evaluation_run_id IS NOT NULL
       OR policy.active_teardown_id IS NOT NULL
       OR policy.maximum_cost_usd_micros <> 0
       OR policy.deployed_environment <> 'unconfigured'
       OR policy.deployed_git_sha IS NOT NULL
       OR policy.artifact_manifest_digest IS NOT NULL
       OR policy.pages_bundle_digest IS NOT NULL
       OR policy.worker_bundle_digest IS NOT NULL
       OR policy.binding_manifest_digest IS NOT NULL
       OR policy.evidence_bundle_hash IS NOT NULL
       OR policy.approved_control_revision IS NOT NULL
       OR policy.active_deployment_approval_id IS NOT NULL
       OR policy.rate_card_id IS DISTINCT FROM
          '00000000-0000-4351-8351-000000000004'::UUID
       OR policy.transition_reason IS DISTINCT FROM
          'Fixed installation client defaults remain provider off'
       OR policy.updated_by IS DISTINCT FROM
          '00000000-0000-4351-8351-000000000002'::UUID
  ) THEN
    RAISE EXCEPTION 'CRM search client policy off/zero contract mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.crm_search_policies policy
    LEFT JOIN public.agency_clients client ON client.id = policy.client_id
    WHERE policy.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
      AND client.id IS NULL
  ) THEN
    RAISE EXCEPTION 'CRM search installation contains an orphan client policy';
  END IF;

  IF EXISTS (SELECT 1 FROM public.crm_people WHERE search_revision < 1) THEN
    RAISE EXCEPTION 'crm_people revision backfill validation failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crm_companies WHERE search_revision < 1) THEN
    RAISE EXCEPTION 'crm_companies revision backfill validation failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.crm_opportunities WHERE search_revision < 1) THEN
    RAISE EXCEPTION 'crm_opportunities revision backfill validation failed';
  END IF;

  v_actual := public.crm_search_person_projection_v1(
    '  Ａｌｅｘ' || pg_catalog.chr(7) || ' ',
    '  O’Connor  ',
    E' Senior\t Strategist ',
    E'Growth\n & Media',
    ' customer '
  );
  IF v_actual <> $fixture_person$First name: Alex
Last name: O’Connor
Job title: Senior Strategist
Department: Growth & Media
Lifecycle stage: customer$fixture_person$ THEN
    RAISE EXCEPTION 'CRM search fixture canonical projection mismatch: person approved fields';
  END IF;
  IF public.crm_search_projection_hash(v_actual)
      <> 'b28565a101015f818827a747c82ff80e24fee5111b26e80c69beafb37579ea0d' THEN
    RAISE EXCEPTION 'CRM search fixture projection hash mismatch: person approved fields';
  END IF;

  v_actual := public.crm_search_company_projection_v1(
    '  Acme   Motors ',
    ' Example.COM ',
    'prospect'
  );
  IF v_actual <> $fixture_company$Name: Acme Motors
Domain: example.com
Lifecycle stage: prospect$fixture_company$ THEN
    RAISE EXCEPTION 'CRM search fixture canonical projection mismatch: company approved fields';
  END IF;
  IF public.crm_search_projection_hash(v_actual)
      <> '44e4ee8a5eac31b9a5c14202d64bdf4e493ee008d08e47b81d5eb70c4cfbe39c' THEN
    RAISE EXCEPTION 'CRM search fixture projection hash mismatch: company approved fields';
  END IF;

  v_actual := public.crm_search_opportunity_projection_v1(
    ' Fleet Renewal 2027 ',
    ' open ',
    'Web' || pg_catalog.chr(8238)
  );
  IF v_actual <> $fixture_opportunity$Name: Fleet Renewal 2027
Status: open
Source: Web$fixture_opportunity$ THEN
    RAISE EXCEPTION 'CRM search fixture canonical projection mismatch: opportunity approved fields';
  END IF;
  IF public.crm_search_projection_hash(v_actual)
      <> '9cee8e3f1b462e9feb50702486d03d5c19b04b45a289ee1c1117786ad009c125' THEN
    RAISE EXCEPTION 'CRM search fixture projection hash mismatch: opportunity approved fields';
  END IF;

  v_actual := public.crm_search_person_projection_v1(
    'Priya',
    '   ',
    NULL,
    NULL,
    ''
  );
  IF v_actual <> $fixture_blank$First name: Priya$fixture_blank$ THEN
    RAISE EXCEPTION 'CRM search fixture canonical projection mismatch: blank approved fields';
  END IF;
  IF public.crm_search_projection_hash(v_actual)
      <> '8b78f74f9d2c2f002690b0266fd1bb67f6751f547448e6b06b43862b9652396b' THEN
    RAISE EXCEPTION 'CRM search fixture projection hash mismatch: blank approved fields';
  END IF;
END;
$$;

RESET ROLE;

REVOKE SELECT ON TABLE agency_clients FROM crm_search_governor;

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
