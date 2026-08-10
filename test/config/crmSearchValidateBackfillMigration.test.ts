import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_CANONICAL_MAX_CODE_POINTS,
  CRM_SEARCH_DOCUMENT_BUILDER_REVISION,
  CRM_SEARCH_MAX_INPUT_TOKENS,
  CRM_SEARCH_MODEL_ID,
  CRM_SEARCH_NORMALIZATION_REVISION,
  CRM_SEARCH_POOLING,
  CRM_SEARCH_SCHEMA_VERSION,
  CRM_SEARCH_VECTOR_DIMENSIONS
} from '~~/server/utils/crm/searchIndex/contracts'
import { CRM_SEARCH_V1_FIELDS } from '~~/server/utils/crm/searchIndex/documents'

const migrationPath = new URL(
  '../../server/database/migrations/351_crm_search_validate_backfill.sql',
  import.meta.url
)
const fixturePath = new URL('../fixtures/crm-search-documents.json', import.meta.url)

export const CRM_SEARCH_INSTALLATION_SCOPE_ID = '00000000-0000-4351-8351-000000000001'
export const CRM_SEARCH_INSTALLATION_SCOPE_KEY = 'xeroflow-agency-installation-v1'
export const CRM_SEARCH_SYSTEM_ACTOR_ID = '00000000-0000-4351-8351-000000000002'
export const CRM_SEARCH_SCHEMA_ID = '00000000-0000-4351-8351-000000000003'
export const CRM_SEARCH_RATE_CARD_ID = '00000000-0000-4351-8351-000000000004'
export const CRM_SEARCH_TOKENIZER_REVISION = 'bge-base-en-v1.5-tokenizer-v1'
export const CRM_SEARCH_RATE_CARD_REVISION = 'cloudflare-2026-08-09'

export const CRM_SEARCH_PROVIDER_CONTRACT = [
  `schema=${CRM_SEARCH_SCHEMA_VERSION}`,
  `model=${CRM_SEARCH_MODEL_ID}`,
  `dimensions=${CRM_SEARCH_VECTOR_DIMENSIONS}`,
  'distance=cosine',
  `pooling=${CRM_SEARCH_POOLING}`,
  `tokenizer=${CRM_SEARCH_TOKENIZER_REVISION}`,
  `document_builder=${CRM_SEARCH_DOCUMENT_BUILDER_REVISION}`,
  'ranking=rrf-v1',
  'threshold=cosine-0.75-v1',
  `normalization=${CRM_SEARCH_NORMALIZATION_REVISION}`,
  `max_input_tokens=${CRM_SEARCH_MAX_INPUT_TOKENS}`,
  `canonical_max_code_points=${CRM_SEARCH_CANONICAL_MAX_CODE_POINTS}`,
  'abstention_threshold=0.7500',
  `person=${CRM_SEARCH_V1_FIELDS.person.join(',')}`,
  `company=${CRM_SEARCH_V1_FIELDS.company.join(',')}`,
  `opportunity=${CRM_SEARCH_V1_FIELDS.opportunity.join(',')}`
].join('\n')

export const CRM_SEARCH_RATE_CARD_CONTRACT = [
  'provider=cloudflare_workers_ai_vectorize',
  `revision=${CRM_SEARCH_RATE_CARD_REVISION}`,
  `model=${CRM_SEARCH_MODEL_ID}`,
  'model_input_usd_micros_per_million_tokens=67000',
  'queried_dimension_usd_micros_per_million=10000',
  'inserted_dimension_usd_micros_per_million=10000',
  'stored_dimension_usd_micros_per_million_month=500',
  'included_model_tokens=0',
  'included_queried_dimensions=0',
  'included_inserted_dimensions=0',
  'included_stored_dimensions=0'
].join('\n')

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function readMigration(): string {
  return readFileSync(migrationPath, 'utf8')
}

describe('CRM search validate/backfill migration 351', () => {
  it('is a separately transactional, fenced validation phase with finite waits and no capture trigger', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readMigration()

    expect(sql.trimStart()).toMatch(/^BEGIN;/)
    expect(sql.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql).toContain('SET LOCAL lock_timeout = \'5s\'')
    expect(sql).toContain('SET LOCAL statement_timeout = \'60s\'')
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]*crm-search-migration-351/i)
    expect(sql).toMatch(/LOCK TABLE[\s\S]*crm_people[\s\S]*crm_companies[\s\S]*crm_opportunities/i)
    expect(sql).not.toMatch(/CREATE\s+TRIGGER\s+crm_search_capture_/i)
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+crm_search_capture_/i)
  })

  it('pins one compile-time installation scope and validates identity instead of accepting caller scope', () => {
    const sql = readMigration()

    expect(sql).toContain(CRM_SEARCH_INSTALLATION_SCOPE_ID)
    expect(sql).toContain(CRM_SEARCH_INSTALLATION_SCOPE_KEY)
    expect(sql).toMatch(/INSERT INTO (public\.)?crm_search_organisation_scopes/i)
    expect(sql).toMatch(/scope_kind[\s\S]*'installation'[\s\S]*is_primary[\s\S]*TRUE[\s\S]*is_active[\s\S]*TRUE/i)
    expect(sql).toMatch(/ON CONFLICT DO NOTHING/i)
    expect(sql).toMatch(/fixed CRM search installation scope.*does not match|installation scope.*mismatch/i)
  })

  it('seeds the exact immutable v1 schema contract shared with the TypeScript builders', () => {
    const sql = readMigration()
    const providerDigest = sha256(CRM_SEARCH_PROVIDER_CONTRACT)

    for (const literal of [
      CRM_SEARCH_SCHEMA_ID,
      CRM_SEARCH_SCHEMA_VERSION,
      CRM_SEARCH_MODEL_ID,
      CRM_SEARCH_POOLING,
      CRM_SEARCH_TOKENIZER_REVISION,
      CRM_SEARCH_DOCUMENT_BUILDER_REVISION,
      CRM_SEARCH_NORMALIZATION_REVISION,
      providerDigest
    ]) {
      expect(sql).toContain(literal)
    }
    expect(sql).toMatch(/dimensions[\s\S]*768/)
    expect(sql).toMatch(/distance_metric[\s\S]*'cosine'/)
    expect(sql).toMatch(/max_input_tokens[\s\S]*512/)
    expect(sql).toMatch(/canonical_max_code_points[\s\S]*1000/)
    expect(sql).toMatch(/abstention_threshold[\s\S]*0\.7500/)
    expect(sql).toContain(CRM_SEARCH_PROVIDER_CONTRACT)
    expect(sql).toMatch(/crm_search_projection_hash[\s\S]*provider contract digest.*mismatch/i)
  })

  it('pins the conservative Cloudflare rate card and validates its source-revision digest', () => {
    const sql = readMigration()
    const rateCardDigest = sha256(CRM_SEARCH_RATE_CARD_CONTRACT)

    for (const literal of [
      CRM_SEARCH_RATE_CARD_ID,
      CRM_SEARCH_RATE_CARD_REVISION,
      CRM_SEARCH_MODEL_ID,
      rateCardDigest
    ]) {
      expect(sql).toContain(literal)
    }
    expect(sql).toMatch(/model_input_usd_micros_per_million_tokens[\s\S]*67000/)
    expect(sql).toMatch(/queried_dimension_usd_micros_per_million[\s\S]*10000/)
    expect(sql).toMatch(/inserted_dimension_usd_micros_per_million[\s\S]*10000/)
    expect(sql).toMatch(/stored_dimension_usd_micros_per_million_month[\s\S]*500/)
    expect(sql).toContain(CRM_SEARCH_RATE_CARD_CONTRACT)
    expect(sql).toMatch(/crm_search_projection_hash[\s\S]*rate-card.*digest.*mismatch/i)
  })

  it('leaves the global and per-client installation state halted, off, unready, and zero-budget', () => {
    const sql = readMigration()

    expect(sql).toMatch(/INSERT INTO (public\.)?crm_search_global_control[\s\S]*'halted'[\s\S]*'off'[\s\S]*FALSE/i)
    expect(sql).toMatch(/INSERT INTO (public\.)?crm_search_policies[\s\S]*'off'[\s\S]*'off'[\s\S]*FALSE/i)
    expect(sql).toMatch(/daily_query_budget_usd_micros[\s\S]*daily_indexing_budget_usd_micros[\s\S]*max_query_provider_calls[\s\S]*max_indexing_provider_calls/i)
    expect(sql).toMatch(/halted\/off\/zero CRM search control.*does not match|control.*halted.*zero.*mismatch/i)
    expect(sql).not.toMatch(/state\s*=\s*'enabled'|maximum_mode\s*=\s*'(shadow|assist)'|indexing_ready\s*=\s*TRUE/i)
  })

  it('backfills zero source revisions to one while preserving already-monotonic revisions', () => {
    const sql = readMigration()

    for (const table of ['crm_people', 'crm_companies', 'crm_opportunities']) {
      expect(sql).toMatch(new RegExp(
        `UPDATE (public\\.)?${table}[\\s\\S]*search_revision = 1[\\s\\S]*search_revision = 0`,
        'i'
      ))
      expect(sql).toMatch(new RegExp(
        `${table}[\\s\\S]*search_revision < 1[\\s\\S]*revision backfill`,
        'i'
      ))
    }
  })

  it('revalidates every checked SQL projection/hash against the shared Task 7 fixture', () => {
    const sql = readMigration()
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      schemaVersion: string
      normalizationRevision: string
      documents: Array<{ expectedCanonicalText: string, expectedContentHash: string }>
    }

    expect(fixture.schemaVersion).toBe(CRM_SEARCH_SCHEMA_VERSION)
    expect(fixture.normalizationRevision).toBe(CRM_SEARCH_NORMALIZATION_REVISION)
    for (const document of fixture.documents) {
      expect(sql).toContain(document.expectedCanonicalText)
      expect(sql).toContain(document.expectedContentHash)
    }
    expect(sql).toMatch(/fixture canonical projection mismatch/i)
    expect(sql).toMatch(/fixture projection hash mismatch/i)
  })

  it('performs no provider call, queue publication, rollout activation, or source-trigger installation', () => {
    const sql = readMigration()

    expect(sql).not.toMatch(/\b(fetch|http|vectorize|queue\.send|ai\.run)\s*\(/i)
    expect(sql).not.toMatch(/INSERT INTO (public\.)?crm_search_operations/i)
    expect(sql).not.toMatch(/CREATE\s+TRIGGER[\s\S]{0,120}\bON\s+(crm_people|crm_companies|crm_opportunities|agency_clients)/i)
  })
})
