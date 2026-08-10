import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

const rawDatabaseUrl = process.env.CRM_SEARCH_TEST_DATABASE_URL?.trim()
const rawTargetAttestation = process.env.CRM_SEARCH_TEST_TARGET_ATTESTATION_JSON?.trim()
const schema = `crm_search_expand_test_${crypto.randomUUID().replaceAll('-', '')}`
const requiredApplicationName = 'crm-search-governance-test'
const requiredMigrationPaths = [
  'server/database/migrations/350_crm_search_expand.sql',
  'server/database/migrations/351_crm_search_validate_backfill.sql',
  'server/database/migrations/352_crm_search_activate_capture.sql'
]

interface CrmSearchTargetAttestation {
  version: 'crm-search-neon-target-attestation-v1'
  producer: 'scripts/crm-search/neon-lifecycle.mjs'
  sourceGitSha: string
  migrationPaths: string[]
  schemaOnly: boolean
  createdAt: string
  expiresAt: string
  neonApi: {
    project: { id: string }
    sourceBranch: { id: string }
    branch: {
      id: string
      projectId: string
      parentId: string
      name: string
      initSource: string
      createdAt: string
      expiresAt: string
    }
    endpoint: { id: string, branchId: string, host: string }
  }
  sharedEndpointDenyset: string[]
  apiResponseSha256: string
  attestationSha256: string
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digestJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function targetAttestationFixture(
  mutate?: (draft: Omit<CrmSearchTargetAttestation, 'apiResponseSha256' | 'attestationSha256'>) => void
): CrmSearchTargetAttestation {
  const createdAt = new Date(Date.now() - 60_000).toISOString()
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
  const sourceGitSha = 'a'.repeat(40)
  const draft: Omit<CrmSearchTargetAttestation, 'apiResponseSha256' | 'attestationSha256'> = {
    version: 'crm-search-neon-target-attestation-v1' as const,
    producer: 'scripts/crm-search/neon-lifecycle.mjs' as const,
    sourceGitSha,
    migrationPaths: [
      'server/database/migrations/350_crm_search_expand.sql',
      'server/database/migrations/351_crm_search_validate_backfill.sql',
      'server/database/migrations/352_crm_search_activate_capture.sql'
    ],
    schemaOnly: true,
    createdAt,
    expiresAt,
    neonApi: {
      project: { id: 'prj-crm-search-e2e' },
      sourceBranch: { id: 'br-source-shared' },
      branch: {
        id: 'br-crm-search-e2e',
        projectId: 'prj-crm-search-e2e',
        parentId: 'br-source-shared',
        name: `crm-search-e2e-${sourceGitSha.slice(0, 12)}`,
        initSource: 'schema-only',
        createdAt,
        expiresAt
      },
      endpoint: {
        id: 'ep-crm-search-e2e-a1b2c3d4',
        branchId: 'br-crm-search-e2e',
        host: 'ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech'
      }
    },
    sharedEndpointDenyset: ['ep-production-shared-a1b2c3d4']
  }
  mutate?.(draft)
  const withApiDigest = { ...draft, apiResponseSha256: digestJson(draft.neonApi) }
  return { ...withApiDigest, attestationSha256: digestJson(withApiDigest) }
}

function endpointFromHost(hostname: string): string {
  return hostname.split('.')[0]?.replace(/-pooler$/, '') || ''
}

function parseAndVerifyTargetAttestation(raw: string): CrmSearchTargetAttestation {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('CRM search target attestation is invalid JSON')
  }
  return verifyTargetAttestation(value)
}

function verifyTargetAttestation(value: unknown): CrmSearchTargetAttestation {
  if (!value || typeof value !== 'object') {
    throw new Error('CRM search target attestation is missing')
  }
  const attestation = value as CrmSearchTargetAttestation
  const { attestationSha256, ...unsignedAttestation } = attestation
  if (!/^[a-f0-9]{64}$/.test(attestationSha256 || '')
    || digestJson(unsignedAttestation) !== attestationSha256) {
    throw new Error('CRM search target attestation digest does not match')
  }
  if (attestation.version !== 'crm-search-neon-target-attestation-v1'
    || attestation.producer !== 'scripts/crm-search/neon-lifecycle.mjs') {
    throw new Error('CRM search target attestation producer is not Task18 lifecycle')
  }
  if (!attestation.neonApi || digestJson(attestation.neonApi) !== attestation.apiResponseSha256) {
    throw new Error('CRM search target attestation API response digest does not match')
  }
  if (!/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(attestation.sourceGitSha || '')) {
    throw new Error('CRM search target attestation source Git SHA is invalid')
  }
  if (canonicalJson(attestation.migrationPaths) !== canonicalJson(requiredMigrationPaths)) {
    throw new Error('CRM search target attestation migration set is not exact')
  }
  if (attestation.schemaOnly !== true || attestation.neonApi.branch.initSource !== 'schema-only') {
    throw new Error('CRM search target attestation must prove schema-only creation')
  }

  const createdAt = Date.parse(attestation.createdAt)
  const expiresAt = Date.parse(attestation.expiresAt)
  const now = Date.now()
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)
    || createdAt > now + 5 * 60_000 || expiresAt <= now
    || expiresAt > createdAt + 24 * 60 * 60_000) {
    throw new Error('CRM search target attestation is expired or has an invalid TTL')
  }
  if (attestation.neonApi.branch.createdAt !== attestation.createdAt
    || attestation.neonApi.branch.expiresAt !== attestation.expiresAt) {
    throw new Error('CRM search target attestation branch TTL does not match')
  }

  const { project, sourceBranch, branch, endpoint } = attestation.neonApi
  for (const [label, identity] of [
    ['project', project?.id], ['source branch', sourceBranch?.id],
    ['target branch', branch?.id], ['endpoint', endpoint?.id]
  ]) {
    if (!identity || !/^[a-z0-9][a-z0-9_-]{2,119}$/i.test(identity)) {
      throw new Error(`CRM search target attestation ${label} identity is invalid`)
    }
  }
  if (branch.projectId !== project.id || branch.parentId !== sourceBranch.id
    || branch.id === sourceBranch.id || endpoint.branchId !== branch.id) {
    throw new Error('CRM search target attestation project or branch binding does not match')
  }
  if (branch.name !== `crm-search-e2e-${attestation.sourceGitSha.slice(0, 12)}`) {
    throw new Error('CRM search target attestation branch name is not lifecycle-bound')
  }
  const endpointId = endpointFromHost(endpoint.host || '')
  if (endpointId !== endpoint.id || !endpoint.host.endsWith('.neon.tech')
    || !endpoint.host.startsWith('ep-') || endpoint.host.split('.')[0]?.endsWith('-pooler')) {
    throw new Error('CRM search target attestation endpoint binding is invalid')
  }
  if (!Array.isArray(attestation.sharedEndpointDenyset)
    || attestation.sharedEndpointDenyset.length === 0
    || new Set(attestation.sharedEndpointDenyset).size !== attestation.sharedEndpointDenyset.length
    || attestation.sharedEndpointDenyset.some(id => !/^ep-[a-z0-9-]{3,119}$/i.test(id))) {
    throw new Error('CRM search target attestation shared endpoint denyset is invalid')
  }
  if (attestation.sharedEndpointDenyset.includes(endpoint.id)) {
    throw new Error('CRM search target attestation identifies a shared endpoint')
  }
  const targetIdentity = `${project.id} ${branch.id} ${branch.name} ${endpoint.id}`.toLowerCase()
  if (/(^|[^a-z])(prod|production|main|primary|shared|default)([^a-z]|$)/.test(targetIdentity)) {
    throw new Error('CRM search target attestation identifies a production-like target')
  }
  return attestation
}

function assertGuardedCrmSearchTestDatabaseUrl(
  raw: string,
  attestation: CrmSearchTargetAttestation
): string {
  const verified = verifyTargetAttestation(attestation)
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

  if (endpointFromHost(url.hostname) !== verified.neonApi.endpoint.id
    || url.hostname !== verified.neonApi.endpoint.host) {
    throw new Error('CRM search test URL does not match the attested endpoint')
  }

  if (verified.sharedEndpointDenyset.includes(endpointFromHost(url.hostname))) {
    throw new Error('CRM search tests reject an attested shared endpoint')
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

async function assertEmptyIsolatedTargetPreflight(
  client: Client,
  disposableSchema: string
): Promise<void> {
  const result = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = $1
       ) AS disposable_schema_exists,
       EXISTS (
         SELECT 1
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public'
           AND relation.relname LIKE 'crm_search_%'
       ) AS public_search_domain_exists`,
    [disposableSchema]
  )
  const row = result.rows[0] as Record<string, boolean>
  if (row.disposable_schema_exists || row.public_search_domain_exists) {
    throw new Error('CRM search test target is not an empty isolated schema-only database')
  }

  for (const sourceTable of ['crm_people', 'crm_companies', 'crm_opportunities']) {
    const relation = await client.query(
      'SELECT pg_catalog.to_regclass($1) AS relation',
      [`public.${sourceTable}`]
    )
    if (relation.rows[0]?.relation) {
      const count = await client.query(`SELECT COUNT(*)::BIGINT AS count FROM public.${sourceTable}`)
      if (BigInt(count.rows[0].count as string) !== 0n) {
        throw new Error(`CRM search test target source ${sourceTable} is not empty`)
      }
    }
  }
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

async function withGuardedCrmSearchSchema(options: {
  client: Client
  schema: string
  attestation: CrmSearchTargetAttestation
  migrationSql: string
  bootstrapSql: string
  run: (connection: Client) => Promise<void>
  runConcurrency?: (connection: Client) => Promise<void>
}): Promise<void> {
  const {
    client, schema: disposableSchema, attestation, migrationSql, bootstrapSql,
    run, runConcurrency
  } = options
  let transactionOpen = false
  let disposableSchemaCreated = false
  await client.connect()
  try {
    await client.query('BEGIN')
    transactionOpen = true
    await client.query(
      'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 350))',
      [attestation.attestationSha256]
    )
    await assertEmptyIsolatedTargetPreflight(client, disposableSchema)
    const before = await client.query(
      `SELECT relation.relname, relation.relkind
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname LIKE 'crm_search_%'
        ORDER BY relation.relname, relation.relkind`
    )
    await client.query(`CREATE SCHEMA "${disposableSchema}"`)
    disposableSchemaCreated = true
    await client.query(`SET LOCAL search_path TO "${disposableSchema}", pg_catalog`)
    await client.query(bootstrapSql)
    await client.query(migrationSql)
    await client.query(migrationSql)
    await client.query('COMMIT')
    transactionOpen = false

    await client.query('BEGIN')
    transactionOpen = true
    await run(client)
    await client.query('ROLLBACK')
    transactionOpen = false
    await runConcurrency?.(client)

    const after = await client.query(
      `SELECT relation.relname, relation.relkind
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname LIKE 'crm_search_%'
        ORDER BY relation.relname, relation.relkind`
    )
    expect(after.rows).toEqual(before.rows)
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined)
    if (disposableSchemaCreated) {
      await client.query(`DROP SCHEMA IF EXISTS "${disposableSchema}" CASCADE`).catch(() => undefined)
    }
    await client.end()
  }
}

describe('CRM search governance database target guard', () => {
  it('accepts only a direct isolated Neon URL bound to a Task18 lifecycle attestation', () => {
    const safe = `postgresql://crm_search_test:secret@ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&application_name=${requiredApplicationName}`
    expect(assertGuardedCrmSearchTestDatabaseUrl(safe, targetAttestationFixture())).toBe(safe)
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
    expect(() => assertGuardedCrmSearchTestDatabaseUrl(unsafe, targetAttestationFixture((draft) => {
      draft.neonApi.endpoint.id = endpointFromHost(new URL(unsafe).hostname)
      draft.neonApi.endpoint.host = new URL(unsafe).hostname
    }))).toThrow()
  })

  it('rejects forged, expired, non-schema-only, mismatched, and shared target attestations', () => {
    const safe = `postgresql://crm_search_test:secret@ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&application_name=${requiredApplicationName}`
    const forged = targetAttestationFixture()
    forged.neonApi.branch.id = 'br-forged-after-signing'
    expect(() => assertGuardedCrmSearchTestDatabaseUrl(safe, forged)).toThrow(/attestation digest/i)
    expect(() => assertGuardedCrmSearchTestDatabaseUrl(safe, targetAttestationFixture((draft) => {
      draft.expiresAt = new Date(Date.now() - 1_000).toISOString()
      draft.neonApi.branch.expiresAt = draft.expiresAt
    }))).toThrow(/expired/i)
    expect(() => assertGuardedCrmSearchTestDatabaseUrl(safe, targetAttestationFixture((draft) => {
      Object.assign(draft, { schemaOnly: false })
    }))).toThrow(/schema-only/i)
    expect(() => assertGuardedCrmSearchTestDatabaseUrl(safe, targetAttestationFixture((draft) => {
      draft.neonApi.endpoint.branchId = 'br-other'
    }))).toThrow(/branch/i)
    expect(() => assertGuardedCrmSearchTestDatabaseUrl(safe, targetAttestationFixture((draft) => {
      draft.sharedEndpointDenyset.push(draft.neonApi.endpoint.id)
    }))).toThrow(/shared/i)
  })

  it('keeps attestation preflight and migration under one connection, transaction, and fence', () => {
    const source = readFileSync(new URL(import.meta.url), 'utf8')
    expect(source).not.toContain(['const preflight', 'Client ='].join(''))
    expect(source).not.toContain(['CRM_SEARCH_TEST', 'EXPECTED_PROJECT_ID'].join('_'))
    expect(source).not.toContain(['CRM_SEARCH_TEST', 'FORBIDDEN_DATABASE_URLS'].join('_'))
    expect(source).toMatch(
      /await client\.connect\(\)[\s\S]*await client\.query\('BEGIN'\)[\s\S]*pg_advisory_xact_lock[\s\S]*assertEmptyIsolatedTargetPreflight[\s\S]*await client\.query\(migrationSql\)/
    )
  })
})

const databaseDescribe = rawDatabaseUrl ? describe.sequential : describe.skip

databaseDescribe('CRM search expand migration disposable Postgres governance', () => {
  it('applies twice, stays schema-confined, and enforces state, projection, evidence, and retention contracts', async () => {
    if (!rawTargetAttestation) {
      throw new Error('CRM_SEARCH_TEST_TARGET_ATTESTATION_JSON is required with the guarded database URL')
    }
    const targetAttestation = parseAndVerifyTargetAttestation(rawTargetAttestation)
    const guardedDatabaseUrl = assertGuardedCrmSearchTestDatabaseUrl(rawDatabaseUrl!, targetAttestation)
    const clientOptions = {
      connectionString: guardedDatabaseUrl,
      connectionTimeoutMillis: 10_000,
      query_timeout: 30_000,
      statement_timeout: 30_000
    }
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

    const client = new Client(clientOptions)
    await withGuardedCrmSearchSchema({
      client,
      schema,
      attestation: targetAttestation,
      bootstrapSql: `
        CREATE TABLE "${schema}".crm_people (
          id UUID PRIMARY KEY, client_id UUID NOT NULL, deleted_at TIMESTAMPTZ
        );
        CREATE TABLE "${schema}".crm_companies (
          id UUID PRIMARY KEY, client_id UUID NOT NULL, deleted_at TIMESTAMPTZ
        );
        CREATE TABLE "${schema}".crm_opportunities (
          id UUID PRIMARY KEY, client_id UUID NOT NULL, deleted_at TIMESTAMPTZ
        );
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

        await connection.query(
          `UPDATE "${schema}".crm_search_global_control
              SET state = 'enabled', indexing_ready = TRUE, revision = 1
            WHERE organisation_scope_id = $1`,
          [scopeId]
        )

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
        const operation = await connection.query(
          `INSERT INTO "${schema}".crm_search_operations
             (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
              source_revision, source_event_sequence, desired_action, vector_id, namespace,
              content_hash, confirmation_tag, confirmation_key_version)
           VALUES ($1, $2, 'person', $3, $4, 1, 1, 'upsert', $5, $6, $7, $8, 'k1')
           RETURNING id`,
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

        const operationId = operation.rows[0]?.id as string | undefined
        expect(operationId).toBeTruthy()
        await connection.query(
          `UPDATE "${schema}".crm_search_operations SET state = 'queued' WHERE id = $1`,
          [operationId]
        )
        await connection.query(
          `UPDATE "${schema}".crm_search_operations SET state = 'processing' WHERE id = $1`,
          [operationId]
        )
        const admitted = await connection.query(
          `SELECT "${schema}".crm_search_admit_operation($1, 'processing', 1) AS state`,
          [operationId]
        )
        expect(admitted.rows).toEqual([{ state: 'admitted' }])
        expect((await connection.query(
          `SELECT state, provider_admitted_at IS NOT NULL AS admitted,
                  admission_identity_hash IS NOT NULL AS identity_frozen,
                  provider_mutation_id, provider_accepted_at
             FROM "${schema}".crm_search_operations WHERE id = $1`,
          [operationId]
        )).rows).toEqual([{
          state: 'admitted',
          admitted: true,
          identity_frozen: true,
          provider_mutation_id: null,
          provider_accepted_at: null
        }])
        await expectRejectedAtSavepoint(
          connection,
          'frozen_admission_identity',
          () => connection.query(
            `UPDATE "${schema}".crm_search_operations SET control_revision = 2 WHERE id = $1`,
            [operationId]
          ),
          /identity is immutable/i
        )
        await connection.query(
          `UPDATE "${schema}".crm_search_operations
              SET state = 'provider_pending', provider_mutation_id = 'mutation-1',
                  provider_accepted_at = NOW()
            WHERE id = $1`,
          [operationId]
        )
        const retryable = await connection.query(
          `UPDATE "${schema}".crm_search_operations
              SET state = 'retryable', error_class = 'provider_timeout'
            WHERE id = $1
            RETURNING state, provider_admitted_at IS NOT NULL AS admitted,
                      admission_identity_hash IS NOT NULL AS identity_frozen`,
          [operationId]
        )
        expect(retryable.rows).toEqual([{
          state: 'retryable',
          admitted: true,
          identity_frozen: true
        }])

        const rankSchemas = await connection.query(
          `SELECT
             "${schema}".crm_search_json_schema_is_safe(
               '{"keywordRanks":[{"entityType":"person","entityIdDigest":"${'e'.repeat(64)}","rank":1,"scoreBucket":80}]}'::jsonb,
               'rank_evidence'
             ) AS valid,
             "${schema}".crm_search_json_schema_is_safe(
               '{"keywordRanks":[{"entityType":"person","entityIdDigest":"${'e'.repeat(64)}","rank":1,"source":{"rawQuery":"secret@example.com"}}]}'::jsonb,
               'rank_evidence'
             ) AS nested_raw_rejected,
             "${schema}".crm_search_json_schema_is_safe(
               '{"keywordRanks":[{"entityType":"person","entityIdDigest":"${'e'.repeat(64)}","rank":1,"displayName":"Jane Person"}]}'::jsonb,
               'rank_evidence'
             ) AS renamed_pii_rejected`
        )
        expect(rankSchemas.rows).toEqual([{
          valid: true,
          nested_raw_rejected: false,
          renamed_pii_rejected: false
        }])

        const terminalOperation = await connection.query(
          `INSERT INTO "${schema}".crm_search_operations
             (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
              source_revision, source_event_sequence, desired_action, vector_id, namespace,
              content_hash, confirmation_tag, confirmation_key_version)
           VALUES ($1, $2, 'person', $3, 'crm-search-v1', 1, 10, 'upsert',
             'v_terminal', 'n_terminal', $4, $5, 'k1')
           RETURNING id`,
          [
            scopeId, clientId, '34343434-3434-4343-8343-343434343434',
            'a'.repeat(64), `hmac-sha256:${'b'.repeat(64)}`
          ]
        )
        const terminalOperationId = terminalOperation.rows[0].id as string
        await connection.query(
          `UPDATE "${schema}".crm_search_operations SET state = 'queued' WHERE id = $1`,
          [terminalOperationId]
        )
        await connection.query(
          `UPDATE "${schema}".crm_search_operations SET state = 'processing' WHERE id = $1`,
          [terminalOperationId]
        )
        await connection.query(
          `UPDATE "${schema}".crm_search_operations
              SET state = 'terminal_dead_letter', error_class = 'queue_delivery_exhausted'
            WHERE id = $1`,
          [terminalOperationId]
        )
        await connection.query(
          `INSERT INTO "${schema}".crm_search_dead_letters
             (organisation_scope_id, client_id, operation_id, origin, attempts, error_class)
           VALUES ($1, $2, $3, 'cloudflare_transport', 3, 'queue_delivery_exhausted')`,
          [scopeId, clientId, terminalOperationId]
        )
        const replacement = await connection.query(
          `SELECT "${schema}".crm_search_replace_terminal_operation(
             $1, 2, 11, 'upsert', 'v_terminal', 'n_terminal', $2, $3, 'k1',
             $4, 'Recover terminal transport failure exactly once'
           ) AS id`,
          [
            terminalOperationId, 'c'.repeat(64), `hmac-sha256:${'d'.repeat(64)}`,
            '45454545-4545-4545-8545-454545454545'
          ]
        )
        expect((await connection.query(
          `SELECT original.state AS original_state, successor.state AS successor_state,
                  successor.successor_of, dead_letter.resolution_state,
                  dead_letter.audit_log_id IS NOT NULL AS audited
             FROM "${schema}".crm_search_operations original
             JOIN "${schema}".crm_search_operations successor
               ON successor.successor_of = original.id
             JOIN "${schema}".crm_search_dead_letters dead_letter
               ON dead_letter.operation_id = original.id
            WHERE original.id = $1 AND successor.id = $2`,
          [terminalOperationId, replacement.rows[0].id]
        )).rows).toEqual([{
          original_state: 'terminal_dead_letter',
          successor_state: 'pending_transport',
          successor_of: terminalOperationId,
          resolution_state: 'transport_retry_requested',
          audited: true
        }])
        await expectRejectedAtSavepoint(
          connection,
          'second_terminal_replacement',
          () => connection.query(
            `SELECT "${schema}".crm_search_replace_terminal_operation(
               $1, 3, 12, 'upsert', 'v_terminal', 'n_terminal', $2, $3, 'k1',
               $4, 'Reject a second replacement for terminal evidence'
             )`,
            [
              terminalOperationId, 'e'.repeat(64), `hmac-sha256:${'f'.repeat(64)}`,
              '45454545-4545-4545-8545-454545454545'
            ]
          ),
          /already has recovery evidence/i
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

        const evaluationRateCard = await connection.query(
          `INSERT INTO "${schema}".crm_search_rate_cards
             (organisation_scope_id, provider, revision, model_id,
              model_input_usd_micros_per_million_tokens,
              queried_dimension_usd_micros_per_million,
              inserted_dimension_usd_micros_per_million,
              stored_dimension_usd_micros_per_million_month,
              source_revision_digest, valid_from, valid_until, created_by)
           VALUES ($1, 'cloudflare_workers_ai_vectorize', 'evaluation-rate-v1',
              '@cf/baai/bge-base-en-v1.5', 1, 1, 1, 1, $2,
              NOW() - INTERVAL '1 day', NOW() + INTERVAL '14 days', $3)
           RETURNING id`,
          [scopeId, 'f'.repeat(64), '56565656-5656-4565-8565-565656565656']
        )
        const immutableRun = await connection.query(
          `INSERT INTO "${schema}".crm_search_evaluation_runs
             (organisation_scope_id, schema_version, dataset_version, dataset_sha256,
              sealed_judgement_sha256, query_evidence_bundle_sha256,
              preregistration_sha256, adjudication_sha256, implementation_git_sha,
              artifact_manifest_digest, pages_bundle_digest, worker_bundle_digest,
              binding_manifest_digest,
              model_id, pooling, tokenizer_revision, document_builder_revision,
              ranking_revision, threshold_revision, provider_contract_digest,
              environment, load_protocol_digest, rate_card_id,
              metric_bundle, gate_passed, runner_id, development_query_count,
              expires_at, retention_expires_at)
           VALUES ($1, 'crm-search-v1', 'fixture-v1', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              '@cf/baai/bge-base-en-v1.5', 'cls', 'tokenizer-v1', 'builder-v1',
              'rrf-v1', 'threshold-v1', $12, 'preview', $13, $14,
              '{}'::jsonb, FALSE, $15, 180,
              NOW() + INTERVAL '14 days', NOW() + INTERVAL '2 years')
           RETURNING id`,
          [
            scopeId,
            '1'.repeat(64), '2'.repeat(64), '3'.repeat(64),
            'a'.repeat(64), 'b'.repeat(64), '4'.repeat(40),
            '5'.repeat(64), '6'.repeat(64), '7'.repeat(64), 'c'.repeat(64),
            'd'.repeat(64), '8'.repeat(64), evaluationRateCard.rows[0].id,
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
          `WITH request AS (
             SELECT NOW() - INTERVAL '2 seconds' AS cutoff
           ), candidates AS (
             SELECT COALESCE(
               array_agg(retained.id ORDER BY retained.retention_expires_at, retained.id),
               ARRAY[]::UUID[]
             ) AS ids
             FROM "${schema}".crm_search_rate_cards retained, request
             WHERE retained.retention_expires_at <= request.cutoff
               AND (retained.legal_hold_id IS NULL OR EXISTS (
                 SELECT 1 FROM "${schema}".crm_search_legal_hold_releases direct_release
                 WHERE direct_release.legal_hold_id = retained.legal_hold_id
               ))
               AND NOT EXISTS (
                 SELECT 1
                 FROM "${schema}".crm_search_legal_hold_targets held_target
                 LEFT JOIN "${schema}".crm_search_legal_hold_releases hold_release
                   ON hold_release.legal_hold_id = held_target.legal_hold_id
                 WHERE held_target.target_table = 'crm_search_rate_cards'
                   AND held_target.target_row_id = retained.id
                   AND hold_release.id IS NULL
               )
           )
           SELECT "${schema}".crm_search_expire_governed_rows(
             'crm_search_rate_cards', 'crm_search_rate_cards', request.cutoff, $1,
             "${schema}".crm_search_projection_hash(concat_ws(
               '|', 'crm_search_rate_cards', 'crm_search_rate_cards', request.cutoff::TEXT,
               COALESCE(array_to_string(candidates.ids, ','), '')
             )), $2, NULL, 100
           ) AS result
           FROM request, candidates`,
          [
            '0'.repeat(64),
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
          `WITH request AS (
             SELECT NOW() - INTERVAL '1 second' AS cutoff
           ), candidates AS (
             SELECT COALESCE(
               array_agg(retained.id ORDER BY retained.retention_expires_at, retained.id),
               ARRAY[]::UUID[]
             ) AS ids
             FROM "${schema}".crm_search_rate_cards retained, request
             WHERE retained.retention_expires_at <= request.cutoff
               AND (retained.legal_hold_id IS NULL OR EXISTS (
                 SELECT 1 FROM "${schema}".crm_search_legal_hold_releases direct_release
                 WHERE direct_release.legal_hold_id = retained.legal_hold_id
               ))
               AND NOT EXISTS (
                 SELECT 1
                 FROM "${schema}".crm_search_legal_hold_targets held_target
                 LEFT JOIN "${schema}".crm_search_legal_hold_releases hold_release
                   ON hold_release.legal_hold_id = held_target.legal_hold_id
                 WHERE held_target.target_table = 'crm_search_rate_cards'
                   AND held_target.target_row_id = retained.id
                   AND hold_release.id IS NULL
               )
           )
           SELECT "${schema}".crm_search_expire_governed_rows(
             'crm_search_rate_cards', 'crm_search_rate_cards', request.cutoff, $1,
             "${schema}".crm_search_projection_hash(concat_ws(
               '|', 'crm_search_rate_cards', 'crm_search_rate_cards', request.cutoff::TEXT,
               COALESCE(array_to_string(candidates.ids, ','), '')
             )), $2, NULL, 100
           ) AS result
           FROM request, candidates`,
          [
            heldExpiry.rows[0].result.highWatermarkHash,
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

        const roleSafety = await connection.query(
          `SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
                  rolreplication, rolbypassrls
             FROM pg_catalog.pg_roles
            WHERE rolname IN ('crm_search_governor', 'crm_search_runtime')
            ORDER BY rolname`
        )
        expect(roleSafety.rows).toEqual([
          {
            rolname: 'crm_search_governor',
            rolcanlogin: false,
            rolinherit: false,
            rolsuper: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolbypassrls: false
          },
          {
            rolname: 'crm_search_runtime',
            rolcanlogin: false,
            rolinherit: false,
            rolsuper: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolbypassrls: false
          }
        ])

        const searchOwners = await connection.query(
          `SELECT DISTINCT pg_catalog.pg_get_userbyid(relation.relowner) AS owner
             FROM pg_catalog.pg_class relation
             JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = $1
              AND relation.relname LIKE 'crm_search_%'
              AND relation.relkind IN ('r', 'p', 'S')`,
          [schema]
        )
        expect(searchOwners.rows).toEqual([{ owner: 'crm_search_governor' }])

        const runtimeEvaluationAccess = await connection.query(
          `SELECT
             has_table_privilege(
               'crm_search_runtime', format('%I.crm_search_evaluation_runs', $1), 'INSERT'
             ) AS can_insert_runs,
             has_table_privilege(
               'crm_search_runtime', format('%I.crm_search_evaluation_query_evidence', $1), 'INSERT'
             ) AS can_insert_evidence,
             has_function_privilege('crm_search_runtime', procedure.oid, 'EXECUTE') AS can_record
           FROM pg_catalog.pg_proc procedure
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
           WHERE namespace.nspname = $1
             AND procedure.proname = 'crm_search_record_evaluation_run'`,
          [schema]
        )
        expect(runtimeEvaluationAccess.rows).toEqual([{
          can_insert_runs: false,
          can_insert_evidence: false,
          can_record: true
        }])

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
      },
      runConcurrency: async (connection) => {
        const scopeId = '12121212-1212-4121-8121-121212121212'
        const clientId = '23232323-2323-4232-8232-232323232323'
        const entityId = '34343434-3434-4343-8343-343434343434'
        const actorId = '45454545-4545-4454-8545-454545454545'
        await connection.query(
          `INSERT INTO "${schema}".crm_search_organisation_scopes
             (id, scope_key, scope_kind, is_primary, is_active)
           VALUES ($1, 'concurrency-installation', 'installation', TRUE, TRUE)`,
          [scopeId]
        )
        await connection.query(
          `INSERT INTO "${schema}".crm_search_global_control
             (organisation_scope_id, state, indexing_ready, revision)
           VALUES ($1, 'enabled', TRUE, 1)`,
          [scopeId]
        )
        const terminal = await connection.query(
          `INSERT INTO "${schema}".crm_search_operations
             (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
              source_revision, source_event_sequence, desired_action, vector_id, namespace,
              content_hash, confirmation_tag, confirmation_key_version)
           VALUES ($1, $2, 'person', $3, 'crm-search-v1', 1, 1, 'upsert',
             'v_concurrent', 'n_concurrent', $4, $5, 'k1')
           RETURNING id`,
          [scopeId, clientId, entityId, 'a'.repeat(64), `hmac-sha256:${'b'.repeat(64)}`]
        )
        const terminalId = terminal.rows[0].id as string
        await connection.query(
          `UPDATE "${schema}".crm_search_operations SET state = 'queued' WHERE id = $1`,
          [terminalId]
        )
        await connection.query(
          `UPDATE "${schema}".crm_search_operations SET state = 'processing' WHERE id = $1`,
          [terminalId]
        )
        await connection.query(
          `UPDATE "${schema}".crm_search_operations
              SET state = 'terminal_dead_letter', error_class = 'queue_delivery_exhausted'
            WHERE id = $1`,
          [terminalId]
        )
        await connection.query(
          `INSERT INTO "${schema}".crm_search_dead_letters
             (organisation_scope_id, client_id, operation_id, origin, attempts, error_class)
           VALUES ($1, $2, $3, 'cloudflare_transport', 3, 'queue_delivery_exhausted')`,
          [scopeId, clientId, terminalId]
        )

        const peer = new Client(clientOptions)
        await peer.connect()
        try {
          await connection.query('BEGIN')
          await peer.query('BEGIN')
          await connection.query(
            `SELECT "${schema}".crm_search_replace_terminal_operation(
               $1, 2, 2, 'upsert', 'v_concurrent', 'n_concurrent', $2, $3, 'k1',
               $4, 'First concurrent terminal replacement request'
             )`,
            [terminalId, 'c'.repeat(64), `hmac-sha256:${'d'.repeat(64)}`, actorId]
          )
          let peerSettled = false
          const peerAttempt = peer.query(
            `SELECT "${schema}".crm_search_replace_terminal_operation(
               $1, 3, 3, 'upsert', 'v_concurrent', 'n_concurrent', $2, $3, 'k1',
               $4, 'Second concurrent terminal replacement request'
             )`,
            [terminalId, 'e'.repeat(64), `hmac-sha256:${'f'.repeat(64)}`, actorId]
          ).then(
            result => ({ result, error: undefined }),
            error => ({ result: undefined, error: error as Error })
          ).finally(() => { peerSettled = true })
          await new Promise(resolve => setTimeout(resolve, 50))
          expect(peerSettled).toBe(false)
          await connection.query('COMMIT')
          const peerOutcome = await peerAttempt
          expect(peerOutcome.result).toBeUndefined()
          expect(peerOutcome.error?.message).toMatch(/already has recovery evidence/i)
          await peer.query('ROLLBACK')
        } finally {
          await connection.query('ROLLBACK').catch(() => undefined)
          await peer.query('ROLLBACK').catch(() => undefined)
          await peer.end()
        }
        expect((await connection.query(
          `SELECT COUNT(*)::INTEGER AS count
             FROM "${schema}".crm_search_operations WHERE successor_of = $1`,
          [terminalId]
        )).rows).toEqual([{ count: 1 }])
      }
    })
  }, 60_000)
})
