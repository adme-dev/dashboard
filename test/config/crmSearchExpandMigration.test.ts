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
      'crm_search_change_approvals',
      'crm_search_change_approval_revocations',
      'crm_search_audit_log',
      'crm_search_dead_letters',
      'crm_search_client_teardowns',
      'crm_search_teardown_vectors',
      'crm_search_retention_high_watermarks',
      'crm_search_retention_attestations'
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
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crm_search_operations_one_provider_pending[\s\S]*?WHERE state = 'provider_pending'/i)
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
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION crm_search_expire_governed_rows[\s\S]*FROM PUBLIC/)
  })
})
