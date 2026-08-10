import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/350_crm_search_expand.sql',
  import.meta.url
)
const fixturePath = new URL('../fixtures/crm-search-documents.json', import.meta.url)

function readMigration(): string {
  return readFileSync(migrationPath, 'utf8')
}

function tableDefinition(sql: string, table: string): string {
  const match = sql.match(new RegExp(
    `CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`,
    'i'
  ))
  expect(match, `${table} definition is missing`).not.toBeNull()
  return match![0]
}

function functionDefinition(sql: string, fn: string): string {
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION ${fn}\\([\\s\\S]*?\\$\\$;`,
    'i'
  ))
  expect(match, `${fn} definition is missing`).not.toBeNull()
  return match![0]
}

describe('CRM search expand migration 350', () => {
  it('exists as one transactional expand phase and installs no source-capture triggers', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readMigration()

    expect(sql.trimStart()).toMatch(/^BEGIN;/)
    expect(sql.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql).not.toMatch(/CREATE\s+TRIGGER\s+crm_search_capture_/i)
    expect(sql).not.toMatch(/CREATE\s+TRIGGER[\s\S]{0,160}\bON\s+crm_(people|companies|opportunities)\b/i)
  })

  it('creates the complete search-domain control, indexing, telemetry, and governance model', () => {
    const sql = readMigration()
    const tables = [
      'crm_search_organisation_scopes',
      'crm_search_global_control',
      'crm_search_legal_holds',
      'crm_search_legal_hold_releases',
      'crm_search_legal_hold_targets',
      'crm_search_namespaces',
      'crm_search_schema_versions',
      'crm_search_rate_cards',
      'crm_search_rate_card_revocations',
      'crm_search_policies',
      'crm_search_source_dirty',
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
      'crm_search_evaluation_approval_consumptions',
      'crm_search_change_approvals',
      'crm_search_change_approval_revocations',
      'crm_search_change_approval_consumptions',
      'crm_search_audit_log',
      'crm_search_dead_letters',
      'crm_search_client_teardowns',
      'crm_search_teardown_vectors',
      'crm_search_retention_high_watermarks',
      'crm_search_retention_attestations',
      'crm_search_retention_delete_authorizations'
    ]

    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
    expect(sql).toContain('CREATE SEQUENCE IF NOT EXISTS crm_search_source_event_sequence')
  })

  it('defaults every provider control and budget to halted, off, disabled, or zero', () => {
    const sql = readMigration()
    const globalControl = tableDefinition(sql, 'crm_search_global_control')
    const policy = tableDefinition(sql, 'crm_search_policies')

    expect(globalControl).toMatch(/state TEXT NOT NULL DEFAULT 'halted'/)
    expect(globalControl).toMatch(/maximum_mode TEXT NOT NULL DEFAULT 'off'/)
    expect(globalControl).toMatch(/indexing_ready BOOLEAN NOT NULL DEFAULT FALSE/)
    expect(globalControl).toMatch(/daily_query_budget_usd_micros BIGINT NOT NULL DEFAULT 0/)
    expect(globalControl).toMatch(/daily_indexing_budget_usd_micros BIGINT NOT NULL DEFAULT 0/)
    expect(globalControl).toMatch(/max_query_provider_calls BIGINT NOT NULL DEFAULT 0/)
    expect(globalControl).toMatch(/max_indexing_provider_calls BIGINT NOT NULL DEFAULT 0/)

    expect(policy).toMatch(/lifecycle_state TEXT NOT NULL DEFAULT 'off'/)
    expect(policy).toMatch(/effective_mode TEXT NOT NULL DEFAULT 'off'/)
    expect(policy).toMatch(/indexing_enabled BOOLEAN NOT NULL DEFAULT FALSE/)
    expect(policy).toMatch(/shadow_sample_rate NUMERIC\([^)]*\) NOT NULL DEFAULT 0/)
    expect(policy).toMatch(/daily_query_budget_usd_micros BIGINT NOT NULL DEFAULT 0/)
    expect(policy).toMatch(/daily_indexing_budget_usd_micros BIGINT NOT NULL DEFAULT 0/)
    expect(policy).toMatch(/semantic_deadline_ms INTEGER NOT NULL DEFAULT 500/)
    expect(policy).toMatch(/semantic_deadline_ms BETWEEN 1 AND 750/)
  })

  it('adds monotonic revision storage to exactly the three v1 CRM source tables', () => {
    const sql = readMigration()
    for (const table of ['crm_people', 'crm_companies', 'crm_opportunities']) {
      expect(sql).toMatch(new RegExp(
        `ALTER TABLE ${table}[\\s\\S]{0,120}ADD COLUMN IF NOT EXISTS search_revision BIGINT NOT NULL DEFAULT 0`,
        'i'
      ))
    }
  })

  it('keeps source, client, operation, document, and teardown identity non-cascading', () => {
    const sql = readMigration()
    for (const table of [
      'crm_search_policies',
      'crm_search_source_dirty',
      'crm_search_operations',
      'crm_search_documents',
      'crm_search_client_teardowns'
    ]) {
      const definition = tableDefinition(sql, table)
      expect(definition).not.toMatch(/REFERENCES\s+agency_clients/i)
      expect(definition).not.toMatch(/ON DELETE CASCADE/i)
    }
    expect(sql).not.toMatch(
      /ON DELETE CASCADE[\s\S]{0,160}crm_search_(source_dirty|documents|client_teardowns)/i
    )
  })

  it('bounds replaceable operations to one pre-admission row, one provider mutation, and one successor', () => {
    const sql = readMigration()
    const operations = tableDefinition(sql, 'crm_search_operations')

    for (const state of [
      'pending_transport',
      'queued',
      'processing',
      'provider_pending',
      'retryable',
      'confirmed',
      'superseded',
      'terminal_dead_letter'
    ]) {
      expect(operations).toContain(`'${state}'`)
    }
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_pre_admission[\s\S]*?WHERE[\s\S]*?successor_of IS NULL/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_provider_inflight[\s\S]*?provider_admitted_at IS NOT NULL/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_successor[\s\S]*?WHERE successor_of IS NOT NULL/i)
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_operation_state_transition_allowed')
  })

  it('keeps dead-letter origins disjoint and gives each origin its own legal transitions', () => {
    const sql = readMigration()
    const deadLetters = tableDefinition(sql, 'crm_search_dead_letters')
    const transition = functionDefinition(sql, 'crm_search_dead_letter_transition_allowed')

    expect(deadLetters).toMatch(/origin IN \('cloudflare_transport', 'provider_confirmation'\)/)
    expect(deadLetters).toMatch(/origin = 'cloudflare_transport'[\s\S]*transport_retry_requested/)
    expect(deadLetters).toMatch(/origin = 'provider_confirmation'[\s\S]*confirmation_reconcile_requested/)
    expect(transition).toContain('p_origin = \'cloudflare_transport\'')
    expect(transition).toContain('p_origin = \'provider_confirmation\'')
  })

  it('defines versioned NFKC normalization and allowlisted v1 SQL projections', () => {
    const sql = readMigration()
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      schemaVersion: string
      documents: Array<{ entityType: string, expectedCanonicalText: string, expectedContentHash: string }>
    }

    expect(fixture.schemaVersion).toBe('crm-search-v1')
    expect(new Set(fixture.documents.map(document => document.entityType))).toEqual(
      new Set(['person', 'company', 'opportunity'])
    )
    for (const document of fixture.documents) {
      expect(document.expectedCanonicalText).not.toMatch(/notes-secret|@example|\+61|03 9000/)
      expect(document.expectedContentHash).toMatch(/^[a-f0-9]{64}$/)
    }

    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_normalize_text')
    expect(sql).toMatch(/normalize\([^;]*'NFKC'\)/i)
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_person_projection_v1')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_company_projection_v1')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_opportunity_projection_v1')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_person_projection_hash_v1')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_company_projection_hash_v1')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_opportunity_projection_hash_v1')
    expect(sql).not.toMatch(/\b(raw_query|source_text|vector_values|provider_error_body)\b/i)
  })

  it('bounds the company domain after Unicode lowercase expansion', () => {
    const companyProjection = functionDefinition(
      readMigration(),
      'crm_search_company_projection_v1'
    )

    expect(companyProjection).toMatch(
      /pg_catalog\.left\(\s*pg_catalog\.lower\(\s*public\.crm_search_normalize_text\(p_domain, 253\)\s*\),\s*253\s*\) AS domain/
    )
  })

  it('makes evaluation results server-recomputed and governance evidence immutable', () => {
    const sql = readMigration()
    const recordEvaluation = functionDefinition(sql, 'crm_search_record_evaluation_run')

    expect(recordEvaluation).toContain('SECURITY DEFINER')
    expect(recordEvaluation).toMatch(/jsonb_array_elements\(p_query_evidence\)/)
    expect(recordEvaluation).toMatch(/gate_passed/)
    expect(recordEvaluation).not.toMatch(/p_gate_passed|p_metrics_bundle/i)
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_reject_governed_evidence_mutation')
    expect(sql.match(/BEFORE UPDATE OR DELETE OR TRUNCATE/g)?.length).toBeGreaterThanOrEqual(10)
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON TABLE[\s\S]*crm_search_evaluation_runs[\s\S]*FROM PUBLIC/)
  })

  it('makes the evaluation recorder the only runtime insert path and derives its evidence digest', () => {
    const sql = readMigration()
    const recordEvaluation = functionDefinition(sql, 'crm_search_record_evaluation_run')

    expect(recordEvaluation).not.toMatch(/p_query_evidence_bundle_sha256/i)
    expect(recordEvaluation).toMatch(/crm_search_projection_hash\(p_query_evidence::TEXT\)/i)
    expect(recordEvaluation).toMatch(/v_query_evidence_bundle_sha256/)
    expect(sql).toMatch(/CREATE ROLE crm_search_governor[\s\S]*NOLOGIN/i)
    expect(sql).toMatch(/CREATE ROLE crm_search_runtime[\s\S]*NOLOGIN/i)
    expect(sql).toMatch(/rolcanlogin OR rolinherit OR rolsuper/i)
    expect(sql).toMatch(/REVOKE crm_search_governor FROM %I[\s\S]*SESSION_USER/i)
    expect(sql).toMatch(/REVOKE INSERT[\s\S]*crm_search_evaluation_runs[\s\S]*FROM crm_search_runtime/i)
    expect(sql).toMatch(/procedure\.proname = ANY[\s\S]*'crm_search_record_evaluation_run'[\s\S]*GRANT EXECUTE ON FUNCTION %s TO crm_search_runtime/i)
  })

  it('recomputes every evaluation gate from granular evidence, including paired bootstrap', () => {
    const sql = readMigration()
    const recordEvaluation = functionDefinition(sql, 'crm_search_record_evaluation_run')

    for (const contract of [
      'entityType',
      'offResultDigest',
      'shadowResultDigest',
      'loadStratum',
      'observedP95Concurrency',
      'loadConcurrency',
      'staleRecordCount',
      'orphanedRecordCount',
      'telemetryLeakageCount',
      'reservedQueryUsdMicros',
      'queryBudgetUsdMicros',
      'forecastVectorCount',
      'vectorCapacity'
    ]) {
      expect(recordEvaluation).toContain(`'${contract}'`)
    }
    expect(recordEvaluation).toMatch(/v_min_queries_per_client\s*>?=\s*80/i)
    expect(recordEvaluation).toMatch(/v_min_queries_per_entity\s*>?=\s*60/i)
    expect(recordEvaluation).toMatch(/v_max_client_entity_ndcg_regression\s*<=\s*0\.05/i)
    expect(recordEvaluation).toMatch(/v_max_client_entity_mrr_regression\s*<=\s*0\.05/i)
    expect(recordEvaluation).toMatch(/v_off_shadow_equal/)
    expect(recordEvaluation).toMatch(/v_load_strata_count\s*=\s*3/)
    expect(recordEvaluation).toMatch(/v_convergence_safe/)
    expect(recordEvaluation).toMatch(/v_telemetry_safe/)
    expect(recordEvaluation).toMatch(/v_shadow_days_consecutive/)
    expect(recordEvaluation).toMatch(/generate_series\(1,\s*1000\)/i)
    expect(recordEvaluation).toMatch(/percentile_cont\(0\.025\)/i)
    expect(recordEvaluation).not.toMatch(/STDDEV_SAMP|concurrentBudgetSafe|capacityHeadroomSafe/i)
  })

  it('freezes accepted operation identity and validates the single same-key successor', () => {
    const sql = readMigration()
    const operations = tableDefinition(sql, 'crm_search_operations')
    const guard = functionDefinition(sql, 'crm_search_guard_operation_transition')
    const admission = functionDefinition(sql, 'crm_search_guard_operation_admission')

    expect(operations).toMatch(/provider_admitted_at TIMESTAMPTZ/)
    expect(operations).toMatch(/admission_identity_hash TEXT/)
    expect(sql).toMatch(/crm_search_operations_one_provider_inflight[\s\S]*provider_admitted_at IS NOT NULL/i)
    expect(sql).toMatch(/crm_search_operations_one_pre_admission[\s\S]*provider_admitted_at IS NULL/i)
    expect(sql).toMatch(/crm_search_operations_one_successor[\s\S]*provider_admitted_at IS NULL/i)
    expect(admission).toMatch(/pg_advisory_xact_lock/i)
    expect(admission).toMatch(/successor_of/)
    expect(admission).toMatch(
      /NEW\.successor_of IS NULL[\s\S]*operation\.successor_of IS NOT NULL/i
    )
    expect(admission).toMatch(/organisation_scope_id[\s\S]*client_id[\s\S]*entity_type[\s\S]*entity_id[\s\S]*schema_version/i)
    expect(guard).toMatch(/provider_admitted_at/)
    expect(guard).toMatch(/admission_identity_hash/)
    expect(guard).not.toMatch(
      /NEW\.organisation_scope_id, NEW\.client_id, NEW\.entity_type, NEW\.entity_id,\s*NEW\.organisation_scope_id/i
    )
    expect(guard).toMatch(/OLD\.state IN \('confirmed', 'superseded', 'terminal_dead_letter'\)[\s\S]*NEW IS DISTINCT FROM OLD/i)
  })

  it('binds retention authority to the exact relation, partition, transaction, and candidate manifest', () => {
    const sql = readMigration()
    const attach = functionDefinition(sql, 'crm_search_attach_legal_hold')
    const expiry = functionDefinition(sql, 'crm_search_expire_governed_rows')
    const immutable = functionDefinition(sql, 'crm_search_reject_governed_evidence_mutation')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_search_retention_delete_authorizations')
    expect(attach).toMatch(/FOR UPDATE/)
    expect(expiry).not.toMatch(/SKIP LOCKED/i)
    expect(expiry).toMatch(/txid_current\(\)/i)
    expect(expiry).toMatch(/pg_backend_pid\(\)/i)
    expect(expiry).toMatch(/target_relation_oid/)
    expect(expiry).toMatch(/partition_relation_oid/)
    expect(expiry).toMatch(/candidate_ids/)
    expect(expiry).toMatch(/computed_manifest_hash/)
    expect(expiry).toMatch(/p_deletion_manifest_hash IS DISTINCT FROM/i)
    expect(expiry).toMatch(/pending_expire_through/)
    expect(expiry).toMatch(/v_has_remaining/)
    expect(functionDefinition(sql, 'crm_search_retention_target_allowed')).toMatch(
      /crm_search_evaluation_approval_consumptions[\s\S]*crm_search_change_approval_consumptions/i
    )
    expect(immutable).toMatch(/TG_RELID/)
    expect(immutable).toMatch(/retention_auth\.target_relation_oid = TG_RELID/)
    expect(immutable).toMatch(/inhparent = retention_auth\.target_relation_oid/)
    expect(immutable).toMatch(/OLD\.id = ANY\(retention_auth\.candidate_ids\)/)
    expect(sql).toMatch(/crm_search_events_default_immutable/)
    expect(sql).toMatch(/crm_search_audit_log_default_immutable/)
    expect(sql).toMatch(/crm_search_retention_attestations_default_immutable/)
    expect(sql).toMatch(
      /crm_search_evaluation_approval_consumptions[\s\S]*crm_search_change_approval_consumptions[\s\S]*crm_search_retention_delete_guard/i
    )
  })

  it('requires a current teardown cycle and explicit blue-green schema promotion', () => {
    const sql = readMigration()
    const policy = tableDefinition(sql, 'crm_search_policies')
    const transition = functionDefinition(sql, 'crm_search_transition_policy')
    const configure = functionDefinition(sql, 'crm_search_configure_candidate_schema')
    const promote = functionDefinition(sql, 'crm_search_promote_candidate_schema')
    const completeRetiring = functionDefinition(sql, 'crm_search_complete_retiring_schema')

    expect(policy).toMatch(/active_teardown_id UUID/)
    expect(transition).toMatch(/teardown\.id = v_policy\.active_teardown_id/)
    expect(transition).toMatch(/teardown\.policy_revision = v_policy\.revision/)
    expect(transition).toMatch(/crm_search_teardown_vectors/)
    expect(transition).toMatch(/crm_search_operations/)
    expect(transition).toMatch(/p_active_schema_version IS DISTINCT FROM v_policy\.active_schema_version/)
    expect(configure).toMatch(/pg_advisory_xact_lock/)
    expect(configure).toMatch(/metadata_index_state = 'ready'/)
    expect(configure).toMatch(/sentinel_state = 'confirmed_absent'/)
    expect(configure).toMatch(/lifecycle_state NOT IN \('indexing', 'shadow', 'assist'\)/)
    expect(promote).toMatch(/captured_source_high_watermark/)
    expect(promote).toMatch(/confirmed_source_high_watermark/)
    expect(promote).toMatch(/retiring_schema_versions/)
    expect(promote).toMatch(/lifecycle_state = 'indexing'/)
    expect(promote).toMatch(/approved_evaluation_run_id = NULL/)
    expect(promote).toMatch(/crm_search_change_approval_consumptions/)
    expect(completeRetiring).toMatch(/pg_advisory_xact_lock/)
    expect(completeRetiring).toMatch(/retiring_schema_versions/)
    expect(completeRetiring).toMatch(/confirmation_state <> 'deleted'/)
    expect(completeRetiring).toMatch(/crm_search_operation_converged\(operation\.id, TRUE\)/)
    expect(completeRetiring).toMatch(/crm_search_change_approval_consumptions/)
  })

  it('serializes revocation with promotion and fills PostgreSQL 14 NULL uniqueness gaps', () => {
    const sql = readMigration()
    const globalTransition = functionDefinition(sql, 'crm_search_transition_global_control')
    const policyTransition = functionDefinition(sql, 'crm_search_transition_policy')
    const revocationGuard = functionDefinition(sql, 'crm_search_guard_change_approval_revocation')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_search_change_approval_consumptions')
    expect(globalTransition).toMatch(/FOR UPDATE OF approval/)
    expect(policyTransition).toMatch(/FOR UPDATE OF approval/)
    expect(revocationGuard).toMatch(/FOR UPDATE/)
    expect(revocationGuard).toMatch(/crm_search_change_approval_consumptions/)
    expect(sql).toMatch(/crm_search_usage_reservations_query_identity[\s\S]*operation_id IS NULL/i)
    expect(sql).toMatch(/crm_search_daily_events_global_identity[\s\S]*client_id IS NULL/i)
  })

  it('creates auditable dead-letter actions and recursive privacy-safe JSON contracts', () => {
    const sql = readMigration()
    const deadLetters = tableDefinition(sql, 'crm_search_dead_letters')
    const transition = functionDefinition(sql, 'crm_search_transition_dead_letter')

    expect(deadLetters).toMatch(/audit_log_created_at TIMESTAMPTZ/)
    expect(deadLetters).toMatch(/FOREIGN KEY \(audit_log_created_at, audit_log_id\)/)
    expect(transition).not.toMatch(/p_audit_log_id/)
    expect(transition).toMatch(/INSERT INTO public\.crm_search_audit_log/)
    expect(transition).toMatch(/audit_log_created_at/)
    expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_json_schema_is_safe')
    const jsonSchema = functionDefinition(sql, 'crm_search_json_schema_is_safe')
    expect(jsonSchema).toContain('\'retiringschemaversion\'')
    expect(jsonSchema).toMatch(/v_normalized_key = ANY\(ARRAY\[\s*'fromstate'/i)
    expect(jsonSchema).toMatch(/v_child #>> '\{\}'[\s\S]*\^\[a-z\]\[a-z0-9_.:-\]/i)
    expect(tableDefinition(sql, 'crm_search_events')).toMatch(/crm_search_json_schema_is_safe\(rank_evidence, 'rank_evidence'\)/)
    expect(tableDefinition(sql, 'crm_search_audit_log')).toMatch(/crm_search_json_schema_is_safe\(details, 'audit_details'\)/)
  })

  it('uses narrow legal-hold and high-watermark retention functions with chained attestations', () => {
    const sql = readMigration()
    for (const fn of [
      'crm_search_place_legal_hold',
      'crm_search_release_legal_hold',
      'crm_search_attach_legal_hold',
      'crm_search_expire_governed_rows'
    ]) {
      const definition = functionDefinition(sql, fn)
      expect(definition).toContain('SECURITY DEFINER')
      expect(definition).toMatch(/SET search_path = pg_catalog, pg_temp/)
    }

    const expiry = functionDefinition(sql, 'crm_search_expire_governed_rows')
    expect(expiry).toMatch(/p_expected_high_watermark_hash/)
    expect(expiry).toMatch(/prior_attestation_hash/)
    expect(expiry).toMatch(/deletion_manifest_hash/)
    expect(expiry).toMatch(/crm_search_retention_attestations/)
    expect(expiry).toMatch(/crm_search_legal_hold_(targets|releases)/)
    expect(sql).toMatch(
      /procedure\.proname = ANY\([\s\S]*'crm_search_expire_governed_rows'[\s\S]*REVOKE ALL ON FUNCTION %s FROM PUBLIC/i
    )
  })

  it('admits provider work durably before any provider acceptance and freezes the control revision', () => {
    const sql = readMigration()
    const operations = tableDefinition(sql, 'crm_search_operations')
    const admit = functionDefinition(sql, 'crm_search_admit_operation')
    const identity = functionDefinition(sql, 'crm_search_operation_identity_hash')
    const guard = functionDefinition(sql, 'crm_search_guard_operation_transition')
    const insertGuard = functionDefinition(sql, 'crm_search_guard_operation_admission')

    expect(operations).toContain('\'admitted\'')
    expect(identity).toMatch(/p_operation\.control_revision::TEXT/)
    expect(admit).toContain('SECURITY DEFINER')
    expect(admit).toMatch(/crm_search_global_control[\s\S]*FOR (KEY )?SHARE/i)
    expect(admit).toMatch(/provider_admitted_at[\s\S]*admission_identity_hash/)
    expect(admit).toMatch(
      /provider_mutation_id IS NOT NULL[\s\S]*provider_accepted_at IS NOT NULL/i
    )
    expect(guard).toMatch(/NEW\.control_revision[\s\S]*OLD\.control_revision/)
    expect(guard).toMatch(
      /OLD\.provider_admitted_at IS NULL[\s\S]*NEW\.provider_mutation_id[\s\S]*NEW\.provider_accepted_at[\s\S]*server controlled/i
    )
    expect(operations).toMatch(
      /provider_admitted_at IS NOT NULL[\s\S]*provider_mutation_id IS NULL[\s\S]*provider_accepted_at IS NULL/
    )
    expect(insertGuard).toMatch(
      /v_parent\.state IN \('confirmed', 'superseded'\)[\s\S]*NEW\.provider_admitted_at[\s\S]*NEW\.provider_mutation_id[\s\S]*server controlled/i
    )
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_search_operation_admission_authorizations')
  })

  it('keeps terminal dead-letter evidence immutable while allowing one audited same-key replacement', () => {
    const sql = readMigration()
    const replace = functionDefinition(sql, 'crm_search_replace_terminal_operation')
    const replacementSatisfied = functionDefinition(sql, 'crm_search_terminal_replacement_satisfied')
    const operationConverged = functionDefinition(sql, 'crm_search_operation_converged')
    const guard = functionDefinition(sql, 'crm_search_guard_operation_admission')
    const retire = functionDefinition(sql, 'crm_search_complete_retiring_schema')
    const transition = functionDefinition(sql, 'crm_search_transition_policy')
    const deadLetters = tableDefinition(sql, 'crm_search_dead_letters')

    expect(replace).toContain('SECURITY DEFINER')
    expect(replace).toMatch(/state <> 'terminal_dead_letter'/)
    expect(replace).toMatch(/successor_of/)
    expect(replace).toMatch(/INSERT INTO public\.crm_search_audit_log/)
    expect(replace).toMatch(/crm_search_dead_letters/)
    expect(replace).toMatch(
      /v_dead_letter\.origin = 'provider_confirmation'[\s\S]*'provider_pending'/
    )
    expect(replace).toMatch(
      /provider_mutation_id[\s\S]*v_terminal\.provider_mutation_id[\s\S]*provider_accepted_at[\s\S]*v_terminal\.provider_accepted_at/
    )
    expect(replace).toMatch(/crm_search_operation_identity_hash\(v_replacement\)/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_direct_successor[\s\S]*ON crm_search_operations \(successor_of\)[\s\S]*WHERE successor_of IS NOT NULL/)
    expect(deadLetters).toMatch(/UNIQUE \(operation_id\)/)
    expect(sql).toMatch(
      /crm_search_dead_letters_one_origin[\s\S]*ON crm_search_dead_letters \(operation_id\)/
    )
    expect(replacementSatisfied).toMatch(/WITH RECURSIVE/i)
    expect(replacementSatisfied).toMatch(/state = 'confirmed'/)
    expect(guard).toMatch(/provider_confirmation[\s\S]*provider_pending/i)
    expect(operationConverged).toMatch(/state = 'superseded'/)
    expect(operationConverged).toMatch(/crm_search_terminal_replacement_satisfied/)
    expect(operationConverged).toMatch(
      /desired_action = 'delete'[\s\S]*state = 'confirmed'[\s\S]*source_event_sequence > operation_row\.source_event_sequence/
    )
    expect(retire).toMatch(/crm_search_operation_converged/)
    expect(transition).toMatch(/crm_search_operation_converged/)
  })

  it('separates dormant deployment from per-client rollout and binds exact deployment authority', () => {
    const sql = readMigration()
    const globalControl = tableDefinition(sql, 'crm_search_global_control')
    const approvals = tableDefinition(sql, 'crm_search_change_approvals')
    const recordDeployment = functionDefinition(sql, 'crm_search_record_dormant_deployment')
    const matchDeployment = functionDefinition(sql, 'crm_search_approval_matches_active_deployment')
    const globalTransition = functionDefinition(sql, 'crm_search_transition_global_control')
    const configure = functionDefinition(sql, 'crm_search_configure_candidate_schema')
    const promote = functionDefinition(sql, 'crm_search_promote_candidate_schema')
    const policy = functionDefinition(sql, 'crm_search_transition_policy')

    for (const field of [
      'artifact_manifest_digest', 'pages_bundle_digest', 'worker_bundle_digest',
      'binding_manifest_digest', 'active_deployment_approval_id', 'rate_card_id'
    ]) {
      expect(globalControl).toContain(field)
    }
    expect(approvals).toMatch(/rate_card_id UUID/)
    expect(approvals).toMatch(/load_protocol_digest TEXT/)
    expect(approvals).toMatch(/provider_contract_digest TEXT/)
    expect(approvals).toMatch(/expected_deployment_approval_id UUID/)
    expect(approvals).toMatch(/target_schema_version TEXT/)
    expect(approvals).toMatch(/requested_action TEXT/)
    expect(approvals).toMatch(
      /approval_type <> 'client_indexing'[\s\S]*target_schema_version IS NOT NULL[\s\S]*requested_action IS NOT NULL/
    )
    expect(approvals).toMatch(/approval_type NOT IN \('client_indexing', 'client_shadow', 'client_assist'\)[\s\S]*rate_card_id IS NOT NULL/)
    expect(approvals).toMatch(
      /active_vector_count[\s\S]*candidate_vector_count[\s\S]*retiring_vector_count[\s\S]*sentinel_vector_count[\s\S]*deletion_pending_vector_count[\s\S]*forecast_vector_count = active_vector_count\s*\+\s*candidate_vector_count\s*\+\s*retiring_vector_count\s*\+\s*sentinel_vector_count\s*\+\s*deletion_pending_vector_count/
    )
    expect(approvals).toMatch(
      /active_namespace_count[\s\S]*candidate_namespace_count[\s\S]*retiring_namespace_count[\s\S]*sentinel_namespace_count[\s\S]*deletion_pending_namespace_count[\s\S]*forecast_namespace_count = active_namespace_count\s*\+\s*candidate_namespace_count\s*\+\s*retiring_namespace_count\s*\+\s*sentinel_namespace_count\s*\+\s*deletion_pending_namespace_count[\s\S]*forecast_vector_count \* 5 < vector_capacity \* 4[\s\S]*forecast_namespace_count \* 5 < namespace_capacity \* 4/
    )
    expect(recordDeployment).toMatch(/approval_type = 'production_deploy'/)
    expect(recordDeployment).toMatch(/v_control\.state <> 'halted'/)
    expect(globalTransition).toMatch(/approval_type = 'client_indexing'/)
    expect(globalTransition).toMatch(
      /p_indexing_ready AND NOT v_control\.indexing_ready/
    )
    expect(globalTransition).not.toMatch(/approval_type = 'production_deploy'/)
    expect(matchDeployment).toMatch(/expected_deployment_approval_id = p_control\.active_deployment_approval_id/)
    expect(globalTransition).toMatch(/requested_action = v_requested_action/)
    expect(configure).toMatch(/requested_action = 'configure_candidate'/)
    expect(configure).toMatch(/target_schema_version = p_candidate_schema_version/)
    expect(promote).toMatch(/requested_action = 'promote_candidate'/)
    expect(promote).toMatch(/target_schema_version = v_policy\.candidate_schema_version/)
    expect(functionDefinition(sql, 'crm_search_complete_retiring_schema')).toMatch(
      /requested_action = 'retire_schema'[\s\S]*target_schema_version = p_retiring_schema_version/
    )
    expect(policy).toMatch(/requested_action = 'policy_indexing'/)

    for (const fn of [globalTransition, configure, promote, policy]) {
      expect(fn).toMatch(/expected_control_revision/)
      expect(fn).toMatch(/maximum_cost_usd_micros/)
      expect(fn).toMatch(/rate_card_id/)
      expect(fn).toMatch(/crm_search_approval_matches_active_deployment/)
    }
  })

  it('evaluates the complete client/entity/load matrix and independent capacity headroom', () => {
    const sql = readMigration()
    const evidence = tableDefinition(sql, 'crm_search_evaluation_query_evidence')
    const record = functionDefinition(sql, 'crm_search_record_evaluation_run')

    expect(evidence).toMatch(/forecast_namespace_count BIGINT NOT NULL/)
    expect(evidence).toMatch(/namespace_capacity BIGINT NOT NULL/)
    expect(evidence).toMatch(/active_vector_count BIGINT NOT NULL[\s\S]*candidate_vector_count BIGINT NOT NULL[\s\S]*retiring_vector_count BIGINT NOT NULL[\s\S]*sentinel_vector_count BIGINT NOT NULL[\s\S]*deletion_pending_vector_count BIGINT NOT NULL/)
    expect(evidence).toMatch(/active_namespace_count BIGINT NOT NULL[\s\S]*candidate_namespace_count BIGINT NOT NULL[\s\S]*retiring_namespace_count BIGINT NOT NULL[\s\S]*sentinel_namespace_count BIGINT NOT NULL[\s\S]*deletion_pending_namespace_count BIGINT NOT NULL/)
    expect(record).toMatch(/v_client_entity_load_cells/)
    expect(record).toMatch(/v_clients \* 3 \* 3/)
    expect(record).toMatch(/GROUP BY client_key_digest, entity_type/)
    expect(record).toMatch(/v_min_client_entity_queries\s*>?=\s*1/)
    expect(record).toMatch(/GROUP BY load_stratum/)
    expect(record).toMatch(/v_max_load_semantic_latency_p95\s*<=\s*500/)
    expect(record).toMatch(/v_max_load_fallback_rate\s*<=\s*0\.05/)
    expect(record).toMatch(/v_max_load_late_completion_rate\s*<=\s*0\.01/)
    expect(record).toMatch(/forecast_vector_count \* 5 < vector_capacity \* 4/)
    expect(record).toMatch(/forecast_namespace_count \* 5 < namespace_capacity \* 4/)
    expect(record).toMatch(/forecast_vector_count = active_vector_count\s*\+\s*candidate_vector_count\s*\+\s*retiring_vector_count\s*\+\s*sentinel_vector_count\s*\+\s*deletion_pending_vector_count/)
    expect(record).toMatch(/forecast_namespace_count = active_namespace_count\s*\+\s*candidate_namespace_count\s*\+\s*retiring_namespace_count\s*\+\s*sentinel_namespace_count\s*\+\s*deletion_pending_namespace_count/)
    expect(record).toMatch(/day_count = 7/)
    expect(record).toMatch(/last_day - first_day = 6/)
    expect(record).toMatch(/first_observed_at >= v_created_at - INTERVAL '7 days'/)
    expect(record).toMatch(/last_observed_at <= v_created_at/)
    expect(record).toMatch(/approval\.issued_at <= per_client\.first_observed_at/)
    expect(record).toMatch(/approval\.expires_at > per_client\.last_observed_at/)
    expect(record).not.toMatch(/approval\.(issued_at|expires_at)::DATE/)
    expect(record).toMatch(/shadowSamplingDigest/)
    expect(record).toMatch(/shadowSampleBucket/)
    expect(record).toMatch(/generate_series\(1,\s*1000\)/)
  })

  it('matches assist evaluation to the full active schema, deployment, and provider contract', () => {
    const sql = readMigration()
    const schema = tableDefinition(sql, 'crm_search_schema_versions')
    const runs = tableDefinition(sql, 'crm_search_evaluation_runs')
    const transition = functionDefinition(sql, 'crm_search_transition_policy')

    expect(schema).toMatch(/ranking_revision TEXT NOT NULL/)
    expect(schema).toMatch(/threshold_revision TEXT NOT NULL/)
    expect(runs).toMatch(/provider_contract_digest TEXT NOT NULL/)
    expect(runs).toMatch(/rate_card_id UUID NOT NULL/)
    for (const contract of [
      'model_id', 'pooling', 'tokenizer_revision', 'document_builder_revision',
      'ranking_revision', 'threshold_revision', 'provider_contract_digest',
      'pages_bundle_digest', 'worker_bundle_digest', 'binding_manifest_digest',
      'load_protocol_digest', 'rate_card_id'
    ]) {
      expect(transition).toMatch(new RegExp(`run\\.${contract}`))
    }
  })

  it('uses a strict structured rank-evidence schema rather than generic recursive JSON', () => {
    const sql = readMigration()
    const jsonSchema = functionDefinition(sql, 'crm_search_json_schema_is_safe')

    expect(jsonSchema).toMatch(/p_schema = 'rank_evidence'[\s\S]*jsonb_typeof\(p_value\) <> 'object'/)
    expect(jsonSchema).toMatch(/rank_entry/)
    expect(jsonSchema).toMatch(/p_schema = 'rank_entry'[\s\S]*jsonb_object_keys\(p_value\)[\s\S]*entitytype[\s\S]*entityiddigest[\s\S]*rank/)
    expect(jsonSchema).toMatch(/v_rank BETWEEN 1 AND 50/)
    expect(jsonSchema).toMatch(/v_score_bucket BETWEEN 0 AND 100/)
    expect(jsonSchema).toMatch(
      /COUNT\(DISTINCT lower\(regexp_replace\(key, '\[\^a-zA-Z0-9\]', '', 'g'\)\)\)/
    )
    expect(jsonSchema.match(/COUNT\(DISTINCT lower\(regexp_replace/g)?.length)
      .toBeGreaterThanOrEqual(3)
    expect(jsonSchema).not.toMatch(/WHEN 'string' THEN\s*RETURN octet_length\(p_value #>> '\{\}'\) <= 512/)
  })

  it('normalizes nullable approval revisions and rejects reverse-orphan candidate ledgers', () => {
    const sql = readMigration()
    const promote = functionDefinition(sql, 'crm_search_promote_candidate_schema')

    expect(sql).toMatch(/crm_search_change_approvals_exact_authority[\s\S]*COALESCE\(expected_control_revision, -1\)[\s\S]*COALESCE\(expected_policy_revision, -1\)/i)
    expect(promote).toMatch(/candidate_document[\s\S]*current_source/)
    expect(promote).toMatch(/confirmation_state = 'deleted'[\s\S]*tombstoned = TRUE/)
    expect(promote).toMatch(/candidate document has no current source or completed delete|reverse-orphan/i)
    expect(promote).toMatch(/crm_search_operation_converged\(operation\.id, FALSE\)/)
    expect(promote).not.toMatch(
      /candidate_operation\.source_revision = current_source\.search_revision/
    )
  })
})
