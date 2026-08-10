BEGIN;

-- 352_crm_search_activate_capture.sql
-- Install durable source capture only after the fixed, halted contract from
-- migration 351 has been validated. The trigger functions record database
-- intent; they never invoke a provider or enable search.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('crm-search-migration-352', 352)
);

-- This lock closes the trigger-installation gap: source/client writes wait
-- until the current-row snapshot and all four triggers commit together.
LOCK TABLE agency_clients, crm_people, crm_companies, crm_opportunities
  IN SHARE ROW EXCLUSIVE MODE;

-- Rows inserted after 351 committed but before this transaction acquired its
-- table locks still receive a valid first revision before capture is exposed.
UPDATE crm_people SET search_revision = 1 WHERE search_revision = 0;
UPDATE crm_companies SET search_revision = 1 WHERE search_revision = 0;
UPDATE crm_opportunities SET search_revision = 1 WHERE search_revision = 0;

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

-- Acquire every current client fence before governed control/policy locks. This
-- preserves the canonical advisory-lock-before-row-lock order used by schema
-- promotion and prevents an activation decision from crossing installation.
DO $$
DECLARE
  v_client_id UUID;
BEGIN
  FOR v_client_id IN
    SELECT client.id
    FROM public.agency_clients client
    ORDER BY client.id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(
        '00000000-0000-4351-8351-000000000001',
        v_client_id
      )
    );
  END LOOP;
END;
$$;

LOCK TABLE crm_search_global_control, crm_search_policies
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM crm_search_organisation_scopes scope_row
    JOIN crm_search_global_control control
      ON control.organisation_scope_id = scope_row.id
    JOIN crm_search_schema_versions schema_row
      ON schema_row.organisation_scope_id = scope_row.id
     AND schema_row.id = '00000000-0000-4351-8351-000000000003'
     AND schema_row.schema_version = 'crm-search-v1'
     AND schema_row.provider_contract_digest =
       '7f45694a470c77183c98961c4a5c0ae28cb0905bf47090020c6f7f600637904a'
    JOIN crm_search_rate_cards rate_card
      ON rate_card.organisation_scope_id = scope_row.id
     AND rate_card.id = '00000000-0000-4351-8351-000000000004'
     AND rate_card.revision = 'cloudflare-2026-08-09'
     AND rate_card.source_revision_digest =
       'e482822982a288940ce78f9b996fdf82635bd91829d5ce029b6c2f52c26e8cdc'
    WHERE scope_row.id = '00000000-0000-4351-8351-000000000001'
      AND scope_row.scope_key = 'xeroflow-agency-installation-v1'
      AND scope_row.scope_kind = 'installation'
      AND scope_row.is_primary IS TRUE
      AND scope_row.is_active IS TRUE
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
  ) THEN
    RAISE EXCEPTION 'CRM search capture requires the fixed halted installation contract';
  END IF;
END;
$$;

-- Clients created in the bounded 351/352 gap receive the same off/zero policy
-- before any source intent for them becomes visible.
INSERT INTO crm_search_policies (
  organisation_scope_id,
  client_id,
  lifecycle_state,
  effective_mode,
  indexing_enabled,
  shadow_sample_rate,
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
  'Capture installation preserves provider-off client defaults',
  '00000000-0000-4351-8351-000000000002'
FROM public.agency_clients client
ON CONFLICT DO NOTHING;

DO $$
BEGIN
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
       OR pg_catalog.cardinality(policy.retiring_schema_versions) <> 0
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
       OR policy.approved_control_revision IS NOT NULL
       OR policy.active_deployment_approval_id IS NOT NULL
       OR policy.rate_card_id IS DISTINCT FROM
          '00000000-0000-4351-8351-000000000004'::UUID
  ) THEN
    RAISE EXCEPTION 'CRM search capture requires off/zero client policies';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_record_source_intent(
  p_organisation_scope_id UUID,
  p_client_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_source_revision BIGINT,
  p_desired_action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_event_sequence BIGINT;
BEGIN
  IF p_organisation_scope_id IS NULL
     OR p_client_id IS NULL
     OR p_entity_id IS NULL
     OR p_entity_type IS NULL
     OR p_entity_type NOT IN ('person', 'company', 'opportunity')
     OR p_source_revision IS NULL
     OR p_source_revision < 1
     OR p_desired_action IS NULL
     OR p_desired_action NOT IN ('upsert', 'delete') THEN
    RAISE EXCEPTION 'invalid CRM search source intent';
  END IF;

  v_event_sequence := pg_catalog.nextval(
    'public.crm_search_source_event_sequence'::REGCLASS
  );

  INSERT INTO public.crm_search_source_dirty (
    organisation_scope_id,
    client_id,
    entity_type,
    entity_id,
    source_revision,
    desired_action,
    event_sequence,
    claim_token,
    claim_generation,
    claim_lease_expires_at,
    attempt_count,
    next_attempt_at,
    error_class,
    updated_at
  )
  VALUES (
    p_organisation_scope_id,
    p_client_id,
    p_entity_type,
    p_entity_id,
    p_source_revision,
    p_desired_action,
    v_event_sequence,
    NULL,
    0,
    NULL,
    0,
    pg_catalog.statement_timestamp(),
    NULL,
    pg_catalog.statement_timestamp()
  )
  ON CONFLICT (organisation_scope_id, client_id, entity_type, entity_id)
  DO UPDATE SET
    source_revision = EXCLUDED.source_revision,
    desired_action = EXCLUDED.desired_action,
    event_sequence = EXCLUDED.event_sequence,
    claim_token = NULL,
    claim_generation = public.crm_search_source_dirty.claim_generation + 1,
    claim_lease_expires_at = NULL,
    attempt_count = 0,
    next_attempt_at = pg_catalog.statement_timestamp(),
    error_class = NULL,
    updated_at = pg_catalog.statement_timestamp()
  WHERE ROW(EXCLUDED.source_revision, EXCLUDED.event_sequence)
      > ROW(
          public.crm_search_source_dirty.source_revision,
          public.crm_search_source_dirty.event_sequence
        );
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_capture_person_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_scope_id CONSTANT UUID := '00000000-0000-4351-8351-000000000001';
  v_search_relevant BOOLEAN;
  v_first_client UUID;
  v_second_client UUID;
  v_revision BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, NEW.client_id)
    );
    NEW.search_revision := 1;
    PERFORM public.crm_search_record_source_intent(
      v_scope_id,
      NEW.client_id,
      'person',
      NEW.id,
      NEW.search_revision,
      CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, OLD.client_id)
    );
    v_revision := OLD.search_revision + 1;
    PERFORM public.crm_search_record_source_intent(
      v_scope_id, OLD.client_id, 'person', OLD.id, v_revision, 'delete'
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_search_relevant :=
      OLD.first_name IS DISTINCT FROM NEW.first_name
      OR OLD.last_name IS DISTINCT FROM NEW.last_name
      OR OLD.job_title IS DISTINCT FROM NEW.job_title
      OR OLD.department IS DISTINCT FROM NEW.department
      OR OLD.lifecycle_stage IS DISTINCT FROM NEW.lifecycle_stage
      OR OLD.client_id IS DISTINCT FROM NEW.client_id
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at;
  ELSE
    RAISE EXCEPTION 'unsupported crm_people capture operation: %', TG_OP;
  END IF;

  IF NOT v_search_relevant THEN
    NEW.search_revision := OLD.search_revision;
    RETURN NEW;
  END IF;

  NEW.search_revision := OLD.search_revision + 1;
  IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    v_first_client := LEAST(OLD.client_id, NEW.client_id);
    v_second_client := GREATEST(OLD.client_id, NEW.client_id);
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, v_first_client)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, v_second_client)
    );
    PERFORM public.crm_search_record_source_intent(
      v_scope_id, OLD.client_id, 'person', OLD.id, NEW.search_revision, 'delete'
    );
    IF NEW.deleted_at IS NULL THEN
      PERFORM public.crm_search_record_source_intent(
        v_scope_id, NEW.client_id, 'person', NEW.id, NEW.search_revision, 'upsert'
      );
    ELSE
      PERFORM public.crm_search_record_source_intent(
        v_scope_id, NEW.client_id, 'person', NEW.id, NEW.search_revision, 'delete'
      );
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, NEW.client_id)
    );
    PERFORM public.crm_search_record_source_intent(
      v_scope_id,
      NEW.client_id,
      'person',
      NEW.id,
      NEW.search_revision,
      CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_capture_company_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_scope_id CONSTANT UUID := '00000000-0000-4351-8351-000000000001';
  v_search_relevant BOOLEAN;
  v_first_client UUID;
  v_second_client UUID;
  v_revision BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, NEW.client_id)
    );
    NEW.search_revision := 1;
    PERFORM public.crm_search_record_source_intent(
      v_scope_id,
      NEW.client_id,
      'company',
      NEW.id,
      NEW.search_revision,
      CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, OLD.client_id)
    );
    v_revision := OLD.search_revision + 1;
    PERFORM public.crm_search_record_source_intent(
      v_scope_id, OLD.client_id, 'company', OLD.id, v_revision, 'delete'
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_search_relevant :=
      OLD.name IS DISTINCT FROM NEW.name
      OR OLD.domain IS DISTINCT FROM NEW.domain
      OR OLD.lifecycle_stage IS DISTINCT FROM NEW.lifecycle_stage
      OR OLD.client_id IS DISTINCT FROM NEW.client_id
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at;
  ELSE
    RAISE EXCEPTION 'unsupported crm_companies capture operation: %', TG_OP;
  END IF;

  IF NOT v_search_relevant THEN
    NEW.search_revision := OLD.search_revision;
    RETURN NEW;
  END IF;

  NEW.search_revision := OLD.search_revision + 1;
  IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    v_first_client := LEAST(OLD.client_id, NEW.client_id);
    v_second_client := GREATEST(OLD.client_id, NEW.client_id);
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, v_first_client)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, v_second_client)
    );
    PERFORM public.crm_search_record_source_intent(
      v_scope_id, OLD.client_id, 'company', OLD.id, NEW.search_revision, 'delete'
    );
    IF NEW.deleted_at IS NULL THEN
      PERFORM public.crm_search_record_source_intent(
        v_scope_id, NEW.client_id, 'company', NEW.id, NEW.search_revision, 'upsert'
      );
    ELSE
      PERFORM public.crm_search_record_source_intent(
        v_scope_id, NEW.client_id, 'company', NEW.id, NEW.search_revision, 'delete'
      );
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, NEW.client_id)
    );
    PERFORM public.crm_search_record_source_intent(
      v_scope_id,
      NEW.client_id,
      'company',
      NEW.id,
      NEW.search_revision,
      CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_capture_opportunity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_scope_id CONSTANT UUID := '00000000-0000-4351-8351-000000000001';
  v_search_relevant BOOLEAN;
  v_first_client UUID;
  v_second_client UUID;
  v_revision BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, NEW.client_id)
    );
    NEW.search_revision := 1;
    PERFORM public.crm_search_record_source_intent(
      v_scope_id,
      NEW.client_id,
      'opportunity',
      NEW.id,
      NEW.search_revision,
      CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, OLD.client_id)
    );
    v_revision := OLD.search_revision + 1;
    PERFORM public.crm_search_record_source_intent(
      v_scope_id, OLD.client_id, 'opportunity', OLD.id, v_revision, 'delete'
    );
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_search_relevant :=
      OLD.name IS DISTINCT FROM NEW.name
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.source IS DISTINCT FROM NEW.source
      OR OLD.client_id IS DISTINCT FROM NEW.client_id
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at;
  ELSE
    RAISE EXCEPTION 'unsupported crm_opportunities capture operation: %', TG_OP;
  END IF;

  IF NOT v_search_relevant THEN
    NEW.search_revision := OLD.search_revision;
    RETURN NEW;
  END IF;

  NEW.search_revision := OLD.search_revision + 1;
  IF OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    v_first_client := LEAST(OLD.client_id, NEW.client_id);
    v_second_client := GREATEST(OLD.client_id, NEW.client_id);
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, v_first_client)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, v_second_client)
    );
    PERFORM public.crm_search_record_source_intent(
      v_scope_id, OLD.client_id, 'opportunity', OLD.id, NEW.search_revision, 'delete'
    );
    IF NEW.deleted_at IS NULL THEN
      PERFORM public.crm_search_record_source_intent(
        v_scope_id, NEW.client_id, 'opportunity', NEW.id, NEW.search_revision, 'upsert'
      );
    ELSE
      PERFORM public.crm_search_record_source_intent(
        v_scope_id, NEW.client_id, 'opportunity', NEW.id, NEW.search_revision, 'delete'
      );
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      public.crm_search_client_advisory_lock_key(v_scope_id, NEW.client_id)
    );
    PERFORM public.crm_search_record_source_intent(
      v_scope_id,
      NEW.client_id,
      'opportunity',
      NEW.id,
      NEW.search_revision,
      CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION crm_search_capture_agency_client_teardown()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_scope_id CONSTANT UUID := '00000000-0000-4351-8351-000000000001';
  v_system_actor CONSTANT UUID := '00000000-0000-4351-8351-000000000002';
  v_client_id UUID;
  v_namespace TEXT;
  v_teardown public.crm_search_client_teardowns%ROWTYPE;
  v_policy public.crm_search_policies%ROWTYPE;
  v_policy_found BOOLEAN := FALSE;
  v_policy_requires_transition BOOLEAN := FALSE;
  v_target_policy_revision BIGINT;
  v_source_high_watermark BIGINT;
  v_ledger_manifest_hash TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NOT (OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_client_id := OLD.id;
  ELSE
    v_client_id := NEW.id;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    public.crm_search_client_advisory_lock_key(v_scope_id, v_client_id)
  );

  SELECT policy.*
  INTO v_policy
  FROM public.crm_search_policies policy
  WHERE policy.organisation_scope_id = v_scope_id
    AND policy.client_id = v_client_id
  FOR UPDATE;
  v_policy_found := FOUND;

  SELECT teardown.*
  INTO v_teardown
  FROM public.crm_search_client_teardowns teardown
  WHERE teardown.organisation_scope_id = v_scope_id
    AND teardown.client_id = v_client_id
    AND teardown.state IN ('pending', 'deleting', 'provider_pending', 'failed')
  ORDER BY teardown.created_at DESC, teardown.id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_namespace := v_teardown.namespace;
  ELSE
    SELECT candidate.namespace
    INTO v_namespace
    FROM (
      SELECT namespace.namespace, 1 AS precedence
      FROM public.crm_search_namespaces namespace
      WHERE namespace.organisation_scope_id = v_scope_id
        AND namespace.client_id = v_client_id
      UNION ALL
      SELECT document.namespace, 2
      FROM public.crm_search_documents document
      WHERE document.organisation_scope_id = v_scope_id
        AND document.client_id = v_client_id
      UNION ALL
      SELECT operation.namespace, 3
      FROM public.crm_search_operations operation
      WHERE operation.organisation_scope_id = v_scope_id
        AND operation.client_id = v_client_id
    ) candidate
    ORDER BY candidate.precedence, candidate.namespace
    LIMIT 1;

    IF v_namespace IS NULL THEN
      v_namespace := 'n_' || pg_catalog.left(
        public.crm_search_projection_hash(
          v_scope_id::TEXT || '|' || v_client_id::TEXT
        ),
        32
      );
    END IF;

    v_target_policy_revision := CASE
      WHEN v_policy_found THEN v_policy.revision + 1
      ELSE 0
    END;

    INSERT INTO public.crm_search_client_teardowns (
      organisation_scope_id,
      client_id,
      policy_revision,
      namespace,
      state,
      provider_deletion_state,
      requested_by,
      request_reason,
      requested_at,
      deletion_deadline_at,
      client_deactivated_at,
      client_deleted_at,
      source_high_watermark,
      ledger_manifest_hash,
      updated_at
    )
    VALUES (
      v_scope_id,
      v_client_id,
      v_target_policy_revision,
      v_namespace,
      'pending',
      'not_started',
      v_system_actor,
      'Agency client lifecycle requires durable vector teardown',
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp() + INTERVAL '15 minutes',
      CASE WHEN TG_OP = 'UPDATE' THEN pg_catalog.statement_timestamp() END,
      CASE WHEN TG_OP = 'DELETE' THEN pg_catalog.statement_timestamp() END,
      0,
      public.crm_search_projection_hash(
        'teardown-pending-v1|' || v_scope_id::TEXT || '|' || v_client_id::TEXT
      ),
      pg_catalog.statement_timestamp()
    )
    RETURNING * INTO v_teardown;
  END IF;

  IF v_policy_found THEN
    v_policy_requires_transition :=
      v_policy.lifecycle_state <> 'teardown_pending'
      OR v_policy.effective_mode <> 'off'
      OR v_policy.indexing_enabled IS TRUE
      OR v_policy.shadow_sample_rate <> 0
      OR v_policy.active_schema_version IS NOT NULL
      OR v_policy.candidate_schema_version IS NOT NULL
      OR pg_catalog.cardinality(v_policy.retiring_schema_versions) <> 0
      OR v_policy.daily_query_budget_usd_micros <> 0
      OR v_policy.daily_indexing_budget_usd_micros <> 0
      OR v_policy.max_query_provider_calls <> 0
      OR v_policy.max_indexing_provider_calls <> 0
      OR v_policy.max_query_dimensions <> 0
      OR v_policy.max_inserted_dimensions <> 0
      OR v_policy.max_stored_dimensions <> 0
      OR v_policy.approved_evaluation_run_id IS NOT NULL
      OR v_policy.approved_control_revision IS NOT NULL
      OR v_policy.active_deployment_approval_id IS NOT NULL
      OR v_policy.maximum_cost_usd_micros <> 0
      OR v_policy.active_teardown_id IS DISTINCT FROM v_teardown.id
      OR v_policy.revision IS DISTINCT FROM v_teardown.policy_revision;
    v_target_policy_revision := GREATEST(
      v_teardown.policy_revision,
      v_policy.revision + CASE WHEN v_policy_requires_transition THEN 1 ELSE 0 END
    );
  ELSE
    v_target_policy_revision := v_teardown.policy_revision;
  END IF;

  UPDATE public.crm_search_client_teardowns teardown
  SET policy_revision = v_target_policy_revision,
      client_deactivated_at = CASE
        WHEN TG_OP = 'UPDATE' THEN COALESCE(
          teardown.client_deactivated_at,
          pg_catalog.statement_timestamp()
        )
        ELSE teardown.client_deactivated_at
      END,
      client_deleted_at = CASE
        WHEN TG_OP = 'DELETE' THEN COALESCE(
          teardown.client_deleted_at,
          pg_catalog.statement_timestamp()
        )
        ELSE teardown.client_deleted_at
      END,
      updated_at = pg_catalog.statement_timestamp()
  WHERE teardown.id = v_teardown.id
  RETURNING * INTO v_teardown;

  INSERT INTO public.crm_search_teardown_vectors (
    teardown_id,
    organisation_scope_id,
    client_id,
    entity_type,
    entity_id,
    schema_version,
    vector_id,
    namespace,
    source_revision,
    deletion_state,
    provider_mutation_id,
    updated_at
  )
  SELECT DISTINCT ON (snapshot.schema_version, snapshot.vector_id)
    v_teardown.id,
    v_scope_id,
    v_client_id,
    snapshot.entity_type,
    snapshot.entity_id,
    snapshot.schema_version,
    snapshot.vector_id,
    snapshot.namespace,
    snapshot.source_revision,
    'pending',
    snapshot.provider_mutation_id,
    pg_catalog.statement_timestamp()
  FROM (
    SELECT
      document.entity_type,
      document.entity_id,
      document.schema_version,
      document.vector_id,
      document.namespace,
      document.source_revision,
      document.provider_mutation_id,
      1 AS precedence
    FROM public.crm_search_documents document
    WHERE document.organisation_scope_id = v_scope_id
      AND document.client_id = v_client_id
    UNION ALL
    SELECT
      operation.entity_type,
      operation.entity_id,
      operation.schema_version,
      operation.vector_id,
      operation.namespace,
      operation.source_revision,
      operation.provider_mutation_id,
      2 AS precedence
    FROM public.crm_search_operations operation
    WHERE operation.organisation_scope_id = v_scope_id
      AND operation.client_id = v_client_id
      AND operation.provider_admitted_at IS NOT NULL
  ) snapshot
  ORDER BY
    snapshot.schema_version,
    snapshot.vector_id,
    snapshot.source_revision DESC,
    snapshot.precedence
  ON CONFLICT (teardown_id, schema_version, vector_id)
  DO UPDATE SET
    source_revision = GREATEST(
      public.crm_search_teardown_vectors.source_revision,
      EXCLUDED.source_revision
    ),
    provider_mutation_id = COALESCE(
      public.crm_search_teardown_vectors.provider_mutation_id,
      EXCLUDED.provider_mutation_id
    ),
    updated_at = pg_catalog.statement_timestamp();

  SELECT COALESCE(MAX(watermark.event_sequence), 0)
  INTO v_source_high_watermark
  FROM (
    SELECT dirty.event_sequence
    FROM public.crm_search_source_dirty dirty
    WHERE dirty.organisation_scope_id = v_scope_id
      AND dirty.client_id = v_client_id
    UNION ALL
    SELECT document.source_event_sequence
    FROM public.crm_search_documents document
    WHERE document.organisation_scope_id = v_scope_id
      AND document.client_id = v_client_id
    UNION ALL
    SELECT operation.source_event_sequence
    FROM public.crm_search_operations operation
    WHERE operation.organisation_scope_id = v_scope_id
      AND operation.client_id = v_client_id
  ) watermark;

  SELECT public.crm_search_projection_hash(
    'teardown-ledger-v1|' || v_scope_id::TEXT || '|' || v_client_id::TEXT
    || E'\n' || COALESCE(
      pg_catalog.string_agg(
        pg_catalog.concat_ws(
          '|',
          vector.entity_type,
          vector.entity_id::TEXT,
          vector.schema_version,
          vector.vector_id,
          vector.namespace,
          vector.source_revision::TEXT
        ),
        E'\n' ORDER BY vector.schema_version, vector.vector_id
      ),
      'empty'
    )
  )
  INTO v_ledger_manifest_hash
  FROM public.crm_search_teardown_vectors vector
  WHERE vector.teardown_id = v_teardown.id;

  UPDATE public.crm_search_client_teardowns teardown
  SET source_high_watermark = GREATEST(
        teardown.source_high_watermark,
        v_source_high_watermark
      ),
      ledger_manifest_hash = v_ledger_manifest_hash,
      updated_at = pg_catalog.statement_timestamp()
  WHERE teardown.id = v_teardown.id;

  IF v_policy_found AND v_policy_requires_transition THEN
    UPDATE public.crm_search_policies policy
    SET lifecycle_state = 'teardown_pending',
        effective_mode = 'off',
        indexing_enabled = FALSE,
        shadow_sample_rate = 0,
        active_schema_version = NULL,
        candidate_schema_version = NULL,
        retiring_schema_versions = ARRAY[]::TEXT[],
        daily_query_budget_usd_micros = 0,
        daily_indexing_budget_usd_micros = 0,
        max_query_provider_calls = 0,
        max_indexing_provider_calls = 0,
        max_query_dimensions = 0,
        max_inserted_dimensions = 0,
        max_stored_dimensions = 0,
        approved_evaluation_run_id = NULL,
        approved_control_revision = NULL,
        active_deployment_approval_id = NULL,
        active_teardown_id = v_teardown.id,
        maximum_cost_usd_micros = 0,
        revision = v_target_policy_revision,
        transition_reason = 'Agency client lifecycle initiated durable teardown',
        updated_by = v_system_actor,
        updated_at = pg_catalog.statement_timestamp()
    WHERE policy.id = v_policy.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Reconcile the initial current-row snapshot after the canonical client fences
-- above have blocked every exclusivity decision for this installation.
DO $$
BEGIN
  PERFORM public.crm_search_record_source_intent(
    '00000000-0000-4351-8351-000000000001',
    person.client_id,
    'person',
    person.id,
    person.search_revision,
    CASE WHEN person.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
  )
  FROM public.crm_people person
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.crm_search_source_dirty dirty
    WHERE dirty.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
      AND dirty.client_id = person.client_id
      AND dirty.entity_type = 'person'
      AND dirty.entity_id = person.id
      AND dirty.source_revision >= person.search_revision
      AND dirty.desired_action = CASE
        WHEN person.deleted_at IS NULL THEN 'upsert'
        ELSE 'delete'
      END
  );

  PERFORM public.crm_search_record_source_intent(
    '00000000-0000-4351-8351-000000000001',
    company.client_id,
    'company',
    company.id,
    company.search_revision,
    CASE WHEN company.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
  )
  FROM public.crm_companies company
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.crm_search_source_dirty dirty
    WHERE dirty.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
      AND dirty.client_id = company.client_id
      AND dirty.entity_type = 'company'
      AND dirty.entity_id = company.id
      AND dirty.source_revision >= company.search_revision
      AND dirty.desired_action = CASE
        WHEN company.deleted_at IS NULL THEN 'upsert'
        ELSE 'delete'
      END
  );

  PERFORM public.crm_search_record_source_intent(
    '00000000-0000-4351-8351-000000000001',
    opportunity.client_id,
    'opportunity',
    opportunity.id,
    opportunity.search_revision,
    CASE WHEN opportunity.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END
  )
  FROM public.crm_opportunities opportunity
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.crm_search_source_dirty dirty
    WHERE dirty.organisation_scope_id = '00000000-0000-4351-8351-000000000001'
      AND dirty.client_id = opportunity.client_id
      AND dirty.entity_type = 'opportunity'
      AND dirty.entity_id = opportunity.id
      AND dirty.source_revision >= opportunity.search_revision
      AND dirty.desired_action = CASE
        WHEN opportunity.deleted_at IS NULL THEN 'upsert'
        ELSE 'delete'
      END
  );
END;
$$;

-- CREATE TRIGGER checks EXECUTE at install time. The source-table owner gets a
-- narrow temporary grant; all direct execution is revoked after installation.
DO $$
DECLARE
  v_schema TEXT := pg_catalog.current_schema();
  v_function TEXT;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'crm_search_capture_person_change()',
    'crm_search_capture_company_change()',
    'crm_search_capture_opportunity_change()',
    'crm_search_capture_agency_client_teardown()'
  ]::TEXT[]
  LOOP
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %I.%s TO %I',
      v_schema,
      v_function,
      SESSION_USER
    );
  END LOOP;
END;
$$;

RESET ROLE;

-- Trigger installation is intentionally last. Reapplication replaces the
-- exact same four definitions after the snapshot has been reconciled.
DROP TRIGGER IF EXISTS crm_search_capture_person_change ON crm_people;
CREATE TRIGGER crm_search_capture_person_change
  BEFORE INSERT OR UPDATE OR DELETE ON crm_people
  FOR EACH ROW EXECUTE FUNCTION crm_search_capture_person_change();

DROP TRIGGER IF EXISTS crm_search_capture_company_change ON crm_companies;
CREATE TRIGGER crm_search_capture_company_change
  BEFORE INSERT OR UPDATE OR DELETE ON crm_companies
  FOR EACH ROW EXECUTE FUNCTION crm_search_capture_company_change();

DROP TRIGGER IF EXISTS crm_search_capture_opportunity_change ON crm_opportunities;
CREATE TRIGGER crm_search_capture_opportunity_change
  BEFORE INSERT OR UPDATE OR DELETE ON crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION crm_search_capture_opportunity_change();

DROP TRIGGER IF EXISTS crm_search_capture_agency_client_teardown ON agency_clients;
CREATE TRIGGER crm_search_capture_agency_client_teardown
  BEFORE UPDATE OR DELETE ON agency_clients
  FOR EACH ROW EXECUTE FUNCTION crm_search_capture_agency_client_teardown();

DO $$
DECLARE
  v_schema TEXT := pg_catalog.current_schema();
  v_installed_count INTEGER;
  v_definitions TEXT;
BEGIN
  SELECT COUNT(*),
         pg_catalog.string_agg(
           pg_catalog.pg_get_triggerdef(trigger_row.oid, TRUE),
           E'\n' ORDER BY trigger_row.tgname
         )
  INTO v_installed_count, v_definitions
  FROM pg_catalog.pg_trigger trigger_row
  JOIN pg_catalog.pg_class relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = v_schema
    AND trigger_row.tgname LIKE 'crm_search_capture_%'
    AND NOT trigger_row.tgisinternal;

  IF v_installed_count <> 4
     OR v_definitions IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger trigger_row
       JOIN pg_catalog.pg_class relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       JOIN pg_catalog.pg_proc function_row ON function_row.oid = trigger_row.tgfoid
       JOIN pg_catalog.pg_namespace function_namespace
         ON function_namespace.oid = function_row.pronamespace
       WHERE namespace.nspname = v_schema
         AND trigger_row.tgname LIKE 'crm_search_capture_%'
         AND NOT trigger_row.tgisinternal
         AND (
           function_namespace.nspname <> v_schema
           OR NOT function_row.prosecdef
           OR NOT COALESCE(function_row.proconfig, ARRAY[]::TEXT[])
             @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[]
           OR ROW(
             trigger_row.tgname,
             relation.relname,
             function_row.proname,
             trigger_row.tgtype,
             trigger_row.tgenabled
           ) NOT IN (
             ROW(
               'crm_search_capture_person_change',
               'crm_people',
               'crm_search_capture_person_change',
               31::SMALLINT,
               'O'::"char"
             ),
             ROW(
               'crm_search_capture_company_change',
               'crm_companies',
               'crm_search_capture_company_change',
               31::SMALLINT,
               'O'::"char"
             ),
             ROW(
               'crm_search_capture_opportunity_change',
               'crm_opportunities',
               'crm_search_capture_opportunity_change',
               31::SMALLINT,
               'O'::"char"
             ),
             ROW(
               'crm_search_capture_agency_client_teardown',
               'agency_clients',
               'crm_search_capture_agency_client_teardown',
               27::SMALLINT,
               'O'::"char"
             )
           )
         )
     ) THEN
    RAISE EXCEPTION 'CRM search trigger installation definition mismatch';
  END IF;
END;
$$;

SET LOCAL ROLE crm_search_governor;

DO $$
DECLARE
  v_schema TEXT := pg_catalog.current_schema();
  v_function REGPROCEDURE;
BEGIN
  FOR v_function IN
    SELECT function_row.oid::REGPROCEDURE
    FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = v_schema
      AND function_row.proname = ANY(ARRAY[
        'crm_search_record_source_intent',
        'crm_search_capture_person_change',
        'crm_search_capture_company_change',
        'crm_search_capture_opportunity_change',
        'crm_search_capture_agency_client_teardown'
      ]::TEXT[])
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_function);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM crm_search_runtime', v_function);
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %s FROM %I',
      v_function,
      SESSION_USER
    );
  END LOOP;

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
