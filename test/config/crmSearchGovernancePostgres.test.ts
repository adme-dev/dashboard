import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { withDisposablePostgresSchema } from '../utils/disposablePostgresSchema'

const rawDatabaseUrl = process.env.CRM_SEARCH_TEST_DATABASE_URL?.trim()
const schema = `crm_search_expand_test_${crypto.randomUUID().replaceAll('-', '')}`
const requiredApplicationName = 'crm-search-governance-test'

function endpointFromHost(hostname: string): string {
  return hostname.split('.')[0]?.replace(/-pooler$/, '') || ''
}

function assertGuardedCrmSearchTestDatabaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('CRM search test database URL is invalid')
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('CRM search test database must use PostgreSQL')
  }
  if (!url.hostname.endsWith('.neon.tech')) {
    throw new Error('CRM search test database must be a direct Neon endpoint')
  }
  if (!url.hostname.startsWith('ep-')) {
    throw new Error('CRM search test database must use a Neon endpoint hostname')
  }
  if (url.hostname.split('.')[0]?.endsWith('-pooler')) {
    throw new Error('CRM search governance tests require a direct, non-pooled Neon endpoint')
  }
  if (url.searchParams.getAll('application_name').length !== 1
    || url.searchParams.get('application_name') !== requiredApplicationName) {
    throw new Error(`CRM search test database requires application_name=${requiredApplicationName}`)
  }
  if (!['require', 'verify-full'].includes(url.searchParams.get('sslmode') || '')) {
    throw new Error('CRM search test database requires TLS')
  }

  const boundedIdentity = [endpointFromHost(url.hostname), url.username, url.pathname]
    .join(' ')
    .toLowerCase()
  if (/(^|[^a-z])(prod|production|main|primary|shared|default)([^a-z]|$)/.test(boundedIdentity)) {
    throw new Error('CRM search governance tests reject shared or production-like database identities')
  }
  return raw
}

function stripTransactionWrapper(sql: string): string {
  return sql
    .replace(/^\s*BEGIN;\s*/i, '')
    .replace(/\s*COMMIT;\s*$/i, '')
}

function migrationForSchema(schemaName: string): string {
  const quotedSchema = `"${schemaName}"`
  return stripTransactionWrapper(readFileSync(
    new URL('../../server/database/migrations/350_crm_search_expand.sql', import.meta.url),
    'utf8'
  )).replaceAll('public.', `${quotedSchema}.`)
}

async function expectRejectedAtSavepoint(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  name: string,
  operation: () => Promise<unknown>,
  message: RegExp
): Promise<void> {
  await client.query(`SAVEPOINT ${name}`)
  try {
    await expect(operation()).rejects.toThrow(message)
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`)
    await client.query(`RELEASE SAVEPOINT ${name}`)
  }
}

describe('CRM search governance database target guard', () => {
  it('accepts only an explicitly marked direct isolated Neon URL', () => {
    const safe = `postgresql://crm_search_test:secret@ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&application_name=${requiredApplicationName}`
    expect(assertGuardedCrmSearchTestDatabaseUrl(safe)).toBe(safe)
  })

  it.each([
    'postgresql://test:secret@localhost/test?application_name=crm-search-governance-test',
    'postgresql://test:secret@ep-crm-search-e2e-a1b2c3d4-pooler.ap-southeast-2.aws.neon.tech/test?application_name=crm-search-governance-test',
    'postgresql://prod:secret@ep-production-main-a1b2c3d4.ap-southeast-2.aws.neon.tech/neondb?application_name=crm-search-governance-test',
    'postgresql://test:secret@ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech/shared?application_name=crm-search-governance-test',
    'postgresql://test:secret@ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech/neondb',
    'postgresql://test:secret@ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech/neondb?sslmode=disable&application_name=crm-search-governance-test',
    'postgresql://test:secret@not-an-endpoint.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&application_name=crm-search-governance-test',
    'postgresql://test:secret@ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&application_name=crm-search-governance-test&application_name=other'
  ])('rejects an unguarded or production-like target before a connection can be made', (unsafe) => {
    expect(() => assertGuardedCrmSearchTestDatabaseUrl(unsafe)).toThrow()
  })
})

const databaseDescribe = rawDatabaseUrl ? describe.sequential : describe.skip

databaseDescribe('CRM search expand migration disposable Postgres governance', () => {
  it('applies twice, stays schema-confined, and enforces state, projection, evidence, and retention contracts', async () => {
    const guardedDatabaseUrl = assertGuardedCrmSearchTestDatabaseUrl(rawDatabaseUrl!)
    const client = new Client({
      connectionString: guardedDatabaseUrl,
      connectionTimeoutMillis: 10_000,
      query_timeout: 30_000,
      statement_timeout: 30_000
    })
    const migrationSql = migrationForSchema(schema)
    const fixture = JSON.parse(readFileSync(
      new URL('../fixtures/crm-search-documents.json', import.meta.url),
      'utf8'
    )) as {
      documents: Array<{
        entityType: 'person' | 'company' | 'opportunity'
        source: Record<string, string | number | null>
        expectedCanonicalText: string
        expectedContentHash: string
      }>
    }

    await withDisposablePostgresSchema({
      client,
      schema,
      snapshotSharedState: connection => connection.query(
        `SELECT relation.relname, relation.relkind
           FROM pg_catalog.pg_class relation
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname LIKE 'crm_search_%'
          ORDER BY relation.relname, relation.relkind`
      ),
      verifySharedState: async (connection, before) => {
        const after = await connection.query(
          `SELECT relation.relname, relation.relkind
             FROM pg_catalog.pg_class relation
             JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname LIKE 'crm_search_%'
            ORDER BY relation.relname, relation.relkind`
        )
        expect(after.rows).toEqual((before as { rows: unknown[] }).rows)
      },
      bootstrapSql: `
        CREATE TABLE "${schema}".crm_people (id UUID PRIMARY KEY);
        CREATE TABLE "${schema}".crm_companies (id UUID PRIMARY KEY);
        CREATE TABLE "${schema}".crm_opportunities (id UUID PRIMARY KEY);
      `,
      migrationSql,
      run: async (connection) => {
        const selected = await connection.query('SELECT current_schema() AS schema')
        expect(selected.rows).toEqual([{ schema }])

        const sourceColumns = await connection.query(
          `SELECT table_name, column_name, column_default, is_nullable
             FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name IN ('crm_people', 'crm_companies', 'crm_opportunities')
              AND column_name = 'search_revision'
            ORDER BY table_name`,
          [schema]
        )
        expect(sourceColumns.rows).toEqual([
          { table_name: 'crm_companies', column_name: 'search_revision', column_default: '0', is_nullable: 'NO' },
          { table_name: 'crm_opportunities', column_name: 'search_revision', column_default: '0', is_nullable: 'NO' },
          { table_name: 'crm_people', column_name: 'search_revision', column_default: '0', is_nullable: 'NO' }
        ])

        const sourceTriggers = await connection.query(
          `SELECT event_object_table
             FROM information_schema.triggers
            WHERE trigger_schema = $1
              AND event_object_table IN ('crm_people', 'crm_companies', 'crm_opportunities')`,
          [schema]
        )
        expect(sourceTriggers.rows).toEqual([])

        const scopeId = '11111111-1111-4111-8111-111111111111'
        const clientId = '22222222-2222-4222-8222-222222222222'
        await connection.query(
          `INSERT INTO "${schema}".crm_search_organisation_scopes
             (id, scope_key, scope_kind, is_primary, is_active)
           VALUES ($1, 'test-installation', 'installation', TRUE, TRUE)`,
          [scopeId]
        )
        await connection.query(
          `INSERT INTO "${schema}".crm_search_global_control (organisation_scope_id)
           VALUES ($1)`,
          [scopeId]
        )
        await connection.query(
          `INSERT INTO "${schema}".crm_search_policies (organisation_scope_id, client_id)
           VALUES ($1, $2)`,
          [scopeId, clientId]
        )
        const defaults = await connection.query(
          `SELECT control.state, control.maximum_mode, control.indexing_ready,
                  control.daily_query_budget_usd_micros AS global_daily_query_budget_usd_micros,
                  policy.lifecycle_state, policy.effective_mode, policy.indexing_enabled,
                  policy.daily_query_budget_usd_micros AS client_daily_query_budget_usd_micros,
                  policy.daily_indexing_budget_usd_micros
             FROM "${schema}".crm_search_global_control control
             JOIN "${schema}".crm_search_policies policy
               ON policy.organisation_scope_id = control.organisation_scope_id
            WHERE policy.client_id = $1`,
          [clientId]
        )
        expect(defaults.rows).toEqual([{
          state: 'halted',
          maximum_mode: 'off',
          indexing_ready: false,
          global_daily_query_budget_usd_micros: '0',
          lifecycle_state: 'off',
          effective_mode: 'off',
          indexing_enabled: false,
          daily_indexing_budget_usd_micros: '0',
          client_daily_query_budget_usd_micros: '0'
        }])

        for (const document of fixture.documents) {
          let result: { rows: Array<{ canonical: string, digest: string }> }
          if (document.entityType === 'person') {
            result = await connection.query(
              `SELECT "${schema}".crm_search_person_projection_v1($1, $2, $3, $4, $5) AS canonical,
                      "${schema}".crm_search_person_projection_hash_v1($1, $2, $3, $4, $5) AS digest`,
              [
                document.source.first_name,
                document.source.last_name,
                document.source.job_title,
                document.source.department,
                document.source.lifecycle_stage
              ]
            )
          } else if (document.entityType === 'company') {
            result = await connection.query(
              `SELECT "${schema}".crm_search_company_projection_v1($1, $2, $3) AS canonical,
                      "${schema}".crm_search_company_projection_hash_v1($1, $2, $3) AS digest`,
              [document.source.name, document.source.domain, document.source.lifecycle_stage]
            )
          } else {
            result = await connection.query(
              `SELECT "${schema}".crm_search_opportunity_projection_v1($1, $2, $3) AS canonical,
                      "${schema}".crm_search_opportunity_projection_hash_v1($1, $2, $3) AS digest`,
              [document.source.name, document.source.status, document.source.source]
            )
          }
          expect(result.rows).toEqual([{
            canonical: document.expectedCanonicalText,
            digest: document.expectedContentHash
          }])
        }

        const operationKey = [
          scopeId,
          clientId,
          '33333333-3333-4333-8333-333333333333',
          'crm-search-v1',
          'v_abc123',
          'n_abc123'
        ]
        await connection.query(
          `INSERT INTO "${schema}".crm_search_operations
             (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
              source_revision, source_event_sequence, desired_action, vector_id, namespace,
              content_hash, confirmation_tag, confirmation_key_version)
           VALUES ($1, $2, 'person', $3, $4, 1, 1, 'upsert', $5, $6, $7, $8, 'k1')`,
          [...operationKey, 'a'.repeat(64), `hmac-sha256:${'b'.repeat(64)}`]
        )
        await expectRejectedAtSavepoint(
          connection,
          'duplicate_pre_admission',
          () => connection.query(
            `INSERT INTO "${schema}".crm_search_operations
               (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
                source_revision, source_event_sequence, desired_action, vector_id, namespace,
                content_hash, confirmation_tag, confirmation_key_version)
             VALUES ($1, $2, 'person', $3, $4, 2, 2, 'upsert', $5, $6, $7, $8, 'k1')`,
            [...operationKey, 'c'.repeat(64), `hmac-sha256:${'d'.repeat(64)}`]
          ),
          /duplicate key/i
        )

        await connection.query(
          `INSERT INTO "${schema}".crm_search_dead_letters
             (organisation_scope_id, client_id, operation_id, origin, attempts, error_class)
           VALUES ($1, $2, $3, 'cloudflare_transport', 3, 'queue_delivery_exhausted')`,
          [scopeId, clientId, '44444444-4444-4444-8444-444444444444']
        )
        await expectRejectedAtSavepoint(
          connection,
          'disjoint_dead_letter_state',
          () => connection.query(
            `UPDATE "${schema}".crm_search_dead_letters
                SET resolution_state = 'confirmation_reconcile_requested'
              WHERE operation_id = $1`,
            ['44444444-4444-4444-8444-444444444444']
          ),
          /dead-letter|check constraint/i
        )

        const immutableRun = await connection.query(
          `INSERT INTO "${schema}".crm_search_evaluation_runs
             (organisation_scope_id, schema_version, dataset_version, dataset_sha256,
              sealed_judgement_sha256, query_evidence_bundle_sha256, implementation_git_sha,
              artifact_manifest_digest, pages_bundle_digest, worker_bundle_digest,
              model_id, pooling, tokenizer_revision, document_builder_revision,
              ranking_revision, threshold_revision, environment, load_protocol_digest,
              metric_bundle, gate_passed, runner_id, expires_at, retention_expires_at)
           VALUES ($1, 'crm-search-v1', 'fixture-v1', $2, $3, $4, $5, $6, $7, $8,
              '@cf/baai/bge-base-en-v1.5', 'cls', 'tokenizer-v1', 'builder-v1',
              'rrf-v1', 'threshold-v1', 'preview', $9, '{}'::jsonb, FALSE, $10,
              NOW() + INTERVAL '14 days', NOW() + INTERVAL '2 years')
           RETURNING id`,
          [
            scopeId,
            '1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(40),
            '5'.repeat(64), '6'.repeat(64), '7'.repeat(64), '8'.repeat(64),
            '55555555-5555-4555-8555-555555555555'
          ]
        )
        await expectRejectedAtSavepoint(
          connection,
          'immutable_evaluation',
          () => connection.query(
            `UPDATE "${schema}".crm_search_evaluation_runs SET gate_passed = TRUE WHERE id = $1`,
            [immutableRun.rows[0].id]
          ),
          /immutable/i
        )

        const rateCard = await connection.query(
          `INSERT INTO "${schema}".crm_search_rate_cards
             (organisation_scope_id, provider, revision, model_id,
              model_input_usd_micros_per_million_tokens,
              queried_dimension_usd_micros_per_million,
              inserted_dimension_usd_micros_per_million,
              stored_dimension_usd_micros_per_million_month,
              source_revision_digest, valid_from, valid_until, created_by,
              retention_expires_at)
           VALUES ($1, 'cloudflare_workers_ai_vectorize', 'test-rate-v1',
              '@cf/baai/bge-base-en-v1.5', 1, 1, 1, 1, $2,
              NOW() - INTERVAL '2 days', NOW() + INTERVAL '2 days', $3,
              NOW() - INTERVAL '1 day')
           RETURNING id`,
          [scopeId, '9'.repeat(64), '66666666-6666-4666-8666-666666666666']
        )
        const rateCardId = rateCard.rows[0].id as string
        const hold = await connection.query(
          `SELECT "${schema}".crm_search_place_legal_hold(
             $1, $2, 'retention-test', 'Validate bounded retention hold', $3, $4
           ) AS id`,
          [
            scopeId,
            clientId,
            '77777777-7777-4777-8777-777777777777',
            '88888888-8888-4888-8888-888888888888'
          ]
        )
        const holdId = hold.rows[0].id as string
        await connection.query(
          `SELECT "${schema}".crm_search_attach_legal_hold(
             $1, 'crm_search_rate_cards', $2, $3
           )`,
          [holdId, rateCardId, '77777777-7777-4777-8777-777777777777']
        )

        const heldExpiry = await connection.query(
          `SELECT "${schema}".crm_search_expire_governed_rows(
             'crm_search_rate_cards', 'crm_search_rate_cards',
             NOW() - INTERVAL '2 seconds', $1, $2, $3, NULL, 100
           ) AS result`,
          [
            '0'.repeat(64),
            'a'.repeat(64),
            '99999999-9999-4999-8999-999999999999'
          ]
        )
        expect(heldExpiry.rows[0].result.rowCount).toBe(0)
        await connection.query(
          `SELECT "${schema}".crm_search_release_legal_hold(
             $1, $2, $3, 'Release bounded retention test hold'
           )`,
          [
            holdId,
            '77777777-7777-4777-8777-777777777777',
            '88888888-8888-4888-8888-888888888888'
          ]
        )
        const releasedExpiry = await connection.query(
          `SELECT "${schema}".crm_search_expire_governed_rows(
             'crm_search_rate_cards', 'crm_search_rate_cards',
             NOW() - INTERVAL '1 second', $1, $2, $3, NULL, 100
           ) AS result`,
          [
            heldExpiry.rows[0].result.highWatermarkHash,
            'b'.repeat(64),
            '99999999-9999-4999-8999-999999999999'
          ]
        )
        expect(releasedExpiry.rows[0].result.rowCount).toBe(1)
        expect(await connection.query(
          `SELECT id FROM "${schema}".crm_search_rate_cards WHERE id = $1`,
          [rateCardId]
        )).toMatchObject({ rows: [] })

        const attestationChain = await connection.query(
          `SELECT prior_attestation_hash, attestation_hash
             FROM "${schema}".crm_search_retention_attestations
            WHERE target_table = 'crm_search_rate_cards'
            ORDER BY range_end, id`
        )
        expect(attestationChain.rows).toHaveLength(2)
        expect(attestationChain.rows[1].prior_attestation_hash)
          .toBe(attestationChain.rows[0].attestation_hash)

        await expectRejectedAtSavepoint(
          connection,
          'immutable_hold',
          () => connection.query(
            `UPDATE "${schema}".crm_search_legal_holds
                SET reason = 'Ordinary mutation must be rejected'
              WHERE id = $1`,
            [holdId]
          ),
          /immutable/i
        )

        const functionSecurity = await connection.query(
          `SELECT routine_name, security_type
             FROM information_schema.routines
            WHERE specific_schema = $1
              AND routine_name IN (
                'crm_search_place_legal_hold',
                'crm_search_release_legal_hold',
                'crm_search_attach_legal_hold',
                'crm_search_expire_governed_rows',
                'crm_search_record_evaluation_run'
              )
            ORDER BY routine_name`,
          [schema]
        )
        expect(functionSecurity.rows).toHaveLength(5)
        expect(functionSecurity.rows.every(row => row.security_type === 'DEFINER')).toBe(true)

        const publicFunctionGrants = await connection.query(
          `SELECT routine_name, privilege_type
             FROM information_schema.routine_privileges
            WHERE specific_schema = $1
              AND grantee = 'PUBLIC'
              AND routine_name IN (
                'crm_search_place_legal_hold',
                'crm_search_release_legal_hold',
                'crm_search_attach_legal_hold',
                'crm_search_expire_governed_rows',
                'crm_search_record_evaluation_run'
              )`,
          [schema]
        )
        expect(publicFunctionGrants.rows).toEqual([])

        const publicGovernedMutationGrants = await connection.query(
          `SELECT table_name, privilege_type
             FROM information_schema.table_privileges
            WHERE table_schema = $1
              AND grantee = 'PUBLIC'
              AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
              AND table_name IN (
                'crm_search_legal_holds', 'crm_search_rate_cards',
                'crm_search_events', 'crm_search_evaluation_runs',
                'crm_search_change_approvals', 'crm_search_audit_log',
                'crm_search_retention_attestations'
              )`,
          [schema]
        )
        expect(publicGovernedMutationGrants.rows).toEqual([])
      }
    })
  }, 60_000)
})
