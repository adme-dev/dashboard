import { existsSync, readFileSync } from 'node:fs'
import { Client, type ClientConfig } from 'pg'
import { describe, expect, it } from 'vitest'

import { verifyReleaseApprovalFinalization } from '../helpers/crmSearchReleaseApprovalPostgres'

const localDsn = process.env.CRM_SEARCH_TASK6_TEST_DSN?.trim()
const requiredApplicationName = 'crm-search-task6-test'
const fixedScopeId = '00000000-0000-4351-8351-000000000001'
const migrationPaths = [
  'server/database/migrations/350_crm_search_expand.sql',
  'server/database/migrations/351_crm_search_validate_backfill.sql',
  'server/database/migrations/352_crm_search_activate_capture.sql',
  'server/database/migrations/353_crm_search_malformed_transport_dead_letters.sql'
] as const

function guardedLocalPostgresConfig(raw: string): ClientConfig {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('CRM search Task 6 test DSN is invalid')
  }
  const socketDirectory = url.searchParams.get('host') ?? ''
  const database = url.pathname.replace(/^\//, '')
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('CRM search Task 6 tests require PostgreSQL')
  }
  if (url.hostname !== 'localhost' || url.port !== '') {
    throw new Error('CRM search Task 6 tests reject TCP and remote database targets')
  }
  if (!socketDirectory.startsWith('/private/tmp/crm-search-task6-pg-')
    || socketDirectory.includes('..')) {
    throw new Error('CRM search Task 6 tests require an isolated private Unix socket')
  }
  if (!/^crm_search_task6_[a-z0-9_]{4,80}$/.test(database)
    || /(prod|production|main|primary|shared|default)/i.test(database)) {
    throw new Error('CRM search Task 6 tests require an isolated test database name')
  }
  if (url.password || url.searchParams.get('sslmode') === 'require') {
    throw new Error('CRM search Task 6 local tests reject credentials and remote TLS targets')
  }
  if (url.searchParams.getAll('application_name').length !== 1
    || url.searchParams.get('application_name') !== requiredApplicationName) {
    throw new Error(`CRM search Task 6 tests require application_name=${requiredApplicationName}`)
  }
  return {
    host: socketDirectory,
    database,
    user: url.username || undefined,
    application_name: requiredApplicationName,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    statement_timeout: 10_000
  }
}

function stripTransactionWrapper(sql: string): string {
  return sql
    .replace(/^\s*BEGIN;\s*/i, '')
    .replace(/\s*COMMIT;\s*$/i, '')
}

function migrationForSchema(path: typeof migrationPaths[number], schema: string): string {
  const file = new URL(`../../${path}`, import.meta.url)
  if (!existsSync(file)) throw new Error(`Missing Task 6 migration: ${path}`)
  return stripTransactionWrapper(readFileSync(file, 'utf8'))
    .replaceAll('public.', `"${schema}".`)
}

async function setSchema(client: Client, schema: string): Promise<void> {
  await client.query(`SET search_path TO "${schema}", pg_catalog`)
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function openPeer(config: ClientConfig, schema: string): Promise<Client> {
  const peer = new Client(config)
  await peer.connect()
  await setSchema(peer, schema)
  return peer
}

async function waitForBackendLock(observer: Client, processId: number): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const activity = await observer.query(
      `SELECT wait_event_type
         FROM pg_catalog.pg_stat_activity
        WHERE pid = $1`,
      [processId]
    )
    if (activity.rows[0]?.wait_event_type === 'Lock') return
    await delay(10)
  }
  throw new Error(`PostgreSQL backend ${processId} did not wait for a lock`)
}

describe('CRM search Task 6 database target guard', () => {
  it('accepts only a credential-free isolated local Unix-socket database', () => {
    const safe = 'postgresql://postgres@localhost/crm_search_task6_a1b2?host=%2Fprivate%2Ftmp%2Fcrm-search-task6-pg-a1b2&application_name=crm-search-task6-test'
    expect(guardedLocalPostgresConfig(safe)).toMatchObject({
      host: '/private/tmp/crm-search-task6-pg-a1b2',
      database: 'crm_search_task6_a1b2',
      application_name: requiredApplicationName
    })
  })

  it.each([
    'postgresql://postgres@db.example.invalid/crm_search_task6_a1b2?host=%2Fprivate%2Ftmp%2Fcrm-search-task6-pg-a1b2&application_name=crm-search-task6-test',
    'postgresql://postgres@localhost:5432/crm_search_task6_a1b2?application_name=crm-search-task6-test',
    'postgresql://postgres:secret@localhost/crm_search_task6_a1b2?host=%2Fprivate%2Ftmp%2Fcrm-search-task6-pg-a1b2&application_name=crm-search-task6-test',
    'postgresql://postgres@localhost/production?host=%2Fprivate%2Ftmp%2Fcrm-search-task6-pg-a1b2&application_name=crm-search-task6-test',
    'postgresql://postgres@localhost/crm_search_task6_a1b2?host=%2Ftmp%2Fshared&application_name=crm-search-task6-test',
    'postgresql://postgres@localhost/crm_search_task6_a1b2?host=%2Fprivate%2Ftmp%2Fcrm-search-task6-pg-a1b2'
  ])('rejects non-isolated, credentialed, shared-like, or remote targets', (unsafe) => {
    expect(() => guardedLocalPostgresConfig(unsafe)).toThrow()
  })

  it('does not read the generic application database URL or create a network/resource fallback', () => {
    const source = readFileSync(new URL(import.meta.url), 'utf8')
    const forbiddenNetworkOrResourceFragments = [
      ['neon', '.tech'],
      ['fe', 'tch('],
      ['wran', 'gler'],
      ['de', 'ploy'],
      ['pro', 'vision']
    ].map(parts => parts.join(''))

    expect(source).not.toContain(['process.env.', 'DATABASE_URL'].join(''))
    for (const fragment of forbiddenNetworkOrResourceFragments) {
      expect(source.toLowerCase()).not.toContain(fragment)
    }
  })
})

const databaseDescribe = localDsn ? describe.sequential : describe.skip

databaseDescribe('CRM search migrations 350-353 on isolated local PostgreSQL 14', () => {
  it('activates durable capture transactionally, idempotently, and without deadlocks', async () => {
    const config = guardedLocalPostgresConfig(localDsn!)
    const schema = `crm_search_task6_${crypto.randomUUID().replaceAll('-', '')}`
    const clientA = '11111111-1111-4111-8111-111111111111'
    const clientB = '22222222-2222-4222-8222-222222222222'
    const teardownClient = '33333333-3333-4333-8333-333333333333'
    const hardDeleteClient = '44444444-4444-4444-8444-444444444444'
    const migratorRole = `crm_search_task6_owner_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
    const administrator = new Client(config)
    const sourceConfig = { ...config, user: migratorRole }
    const connection = new Client(sourceConfig)
    let connectionOpened = false
    let schemaCreated = false

    await administrator.connect()
    try {
      await administrator.query(
        `CREATE ROLE "${migratorRole}"
          LOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS`
      )
      await administrator.query(
        `GRANT CONNECT, CREATE ON DATABASE crm_search_task6_a1b2 TO "${migratorRole}"`
      )
      await connection.connect()
      connectionOpened = true
      await connection.query(`CREATE SCHEMA "${schema}"`)
      schemaCreated = true
      await setSchema(connection, schema)
      await setSchema(administrator, schema)
      await connection.query(`
        CREATE TABLE agency_clients (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE
        );
        CREATE TABLE crm_companies (
          id UUID PRIMARY KEY,
          client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          domain TEXT,
          lifecycle_stage TEXT,
          email TEXT,
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE crm_people (
          id UUID PRIMARY KEY,
          client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
          first_name TEXT NOT NULL,
          last_name TEXT,
          job_title TEXT,
          department TEXT,
          lifecycle_stage TEXT,
          email TEXT,
          deleted_at TIMESTAMPTZ
        );
        CREATE TABLE crm_opportunities (
          id UUID PRIMARY KEY,
          client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          source TEXT,
          email TEXT,
          deleted_at TIMESTAMPTZ
        );
      `)
      await connection.query(
        `INSERT INTO agency_clients (id, name) VALUES
           ($1, 'Client A'), ($2, 'Client B'), ($3, 'Teardown Client'),
           ($4, 'Concurrent Hard Delete Client')`,
        [clientA, clientB, teardownClient, hardDeleteClient]
      )
      const initialPerson = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      const initialCompany = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      const initialOpportunity = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      await connection.query(
        `INSERT INTO crm_people (id, client_id, first_name) VALUES ($1, $2, 'Initial')`,
        [initialPerson, clientA]
      )
      await connection.query(
        `INSERT INTO crm_companies (id, client_id, name) VALUES ($1, $2, 'Initial Co')`,
        [initialCompany, clientA]
      )
      await connection.query(
        `INSERT INTO crm_opportunities (id, client_id, name) VALUES ($1, $2, 'Initial Opp')`,
        [initialOpportunity, clientA]
      )

      const expand = migrationForSchema(migrationPaths[0], schema)
      const validate = migrationForSchema(migrationPaths[1], schema)
      const activate = migrationForSchema(migrationPaths[2], schema)
      const malformedTransport = migrationForSchema(migrationPaths[3], schema)

      await connection.query('BEGIN')
      await connection.query(expand)
      await connection.query(expand)
      await connection.query(validate)
      await connection.query(validate)
      await connection.query('COMMIT')

      const retentionParent = '71000000-0000-4000-8000-000000000001'
      const retentionHeldChild = '71000000-0000-4000-8000-000000000002'
      const retentionIndependent = '71000000-0000-4000-8000-000000000003'
      const hold = await administrator.query(
        `SELECT crm_search_place_legal_hold(
           $1, $2, 'retention-successor-hold', 'Hold successor during dependency retention test.',
           $3, $4
         ) AS id`,
        [fixedScopeId, clientA,
          '71000000-0000-4000-8000-000000000010',
          '71000000-0000-4000-8000-000000000011']
      )
      await administrator.query(
        `INSERT INTO crm_search_operations (
           id, organisation_scope_id, client_id, entity_type, entity_id, schema_version,
           source_revision, source_event_sequence, desired_action, vector_id, namespace,
           state, successor_of, retention_expires_at
         ) VALUES
           ($1, $4, $5, 'person', $6, 'crm-search-v1', 1, 901, 'delete',
             'v_retention_parent', 'n_retention_dependency', 'terminal_dead_letter', NULL,
             NOW() - INTERVAL '2 days'),
           ($2, $4, $5, 'person', $6, 'crm-search-v1', 2, 902, 'delete',
             'v_retention_child', 'n_retention_dependency', 'terminal_dead_letter', $1,
             NOW() - INTERVAL '2 days'),
           ($3, $4, $5, 'company', $7, 'crm-search-v1', 1, 903, 'delete',
             'v_retention_independent', 'n_retention_dependency', 'terminal_dead_letter', NULL,
             NOW() - INTERVAL '2 days')`,
        [retentionParent, retentionHeldChild, retentionIndependent, fixedScopeId, clientA,
          initialPerson, initialCompany]
      )
      await administrator.query(
        `SELECT crm_search_attach_legal_hold($1, 'crm_search_operations', $2, $3)`,
        [hold.rows[0].id, retentionHeldChild, '71000000-0000-4000-8000-000000000012']
      )
      const retentionCutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()
      const retentionManifest = await administrator.query(
        `SELECT crm_search_projection_hash(concat_ws(
           '|', 'crm_search_operations', 'crm_search_operations', $1::TIMESTAMPTZ::TEXT,
           COALESCE(array_to_string(array_agg(operation.id ORDER BY operation.retention_expires_at, operation.id), ','), '')
         )) AS hash
         FROM crm_search_operations operation
         WHERE operation.retention_expires_at <= $1::TIMESTAMPTZ
           AND operation.legal_hold_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM crm_search_legal_hold_targets held
             LEFT JOIN crm_search_legal_hold_releases released
               ON released.legal_hold_id = held.legal_hold_id
             WHERE held.target_table = 'crm_search_operations'
               AND held.target_row_id = operation.id AND released.id IS NULL
           )
           AND NOT crm_search_retention_row_has_dependents('crm_search_operations', operation.id)`,
        [retentionCutoff]
      )
      const retentionResult = await administrator.query(
        `SELECT crm_search_expire_governed_rows(
           'crm_search_operations', 'crm_search_operations', $1::TIMESTAMPTZ,
           repeat('0', 64), $2, $3, NULL, 1000
         ) AS result`,
        [retentionCutoff, retentionManifest.rows[0].hash,
          '71000000-0000-4000-8000-000000000013']
      )
      expect(retentionResult.rows[0].result).toMatchObject({
        rowCount: 1,
        complete: false,
        legalHoldBlockedCount: 1,
        dependencyBlockedCount: 1
      })
      expect((await administrator.query(
        `SELECT id FROM crm_search_operations WHERE id = ANY($1::UUID[]) ORDER BY id`,
        [[retentionParent, retentionHeldChild, retentionIndependent]]
      )).rows).toEqual([{ id: retentionParent }, { id: retentionHeldChild }])
      expect((await administrator.query(
        `SELECT legal_hold_blocked_count, dependency_blocked_count
           FROM crm_search_retention_attestations
          WHERE target_table = 'crm_search_operations'
          ORDER BY created_at DESC, id DESC LIMIT 1`
      )).rows).toEqual([{ legal_hold_blocked_count: '1', dependency_blocked_count: '1' }])

      const phaseTwoTriggers = await connection.query(
        `SELECT trigger_name FROM information_schema.triggers
          WHERE trigger_schema = $1 AND trigger_name LIKE 'crm_search_capture_%'`,
        [schema]
      )
      expect(phaseTwoTriggers.rows).toEqual([])
      expect((await administrator.query(
        `SELECT state, maximum_mode, indexing_ready,
                daily_query_budget_usd_micros, daily_indexing_budget_usd_micros,
                max_query_provider_calls, max_indexing_provider_calls
           FROM crm_search_global_control WHERE organisation_scope_id = $1`,
        [fixedScopeId]
      )).rows).toEqual([{
        state: 'halted',
        maximum_mode: 'off',
        indexing_ready: false,
        daily_query_budget_usd_micros: '0',
        daily_indexing_budget_usd_micros: '0',
        max_query_provider_calls: '0',
        max_indexing_provider_calls: '0'
      }])

      await verifyReleaseApprovalFinalization(administrator, fixedScopeId)

      expect((await connection.query(
        `SELECT search_revision FROM crm_people WHERE id = $1`,
        [initialPerson]
      )).rows).toEqual([{ search_revision: '1' }])

      await connection.query('BEGIN')
      await connection.query(activate)
      await connection.query(activate)
      await connection.query(malformedTransport)
      await connection.query(malformedTransport)
      await connection.query('COMMIT')

      const installedTriggers = await connection.query(
        `SELECT trigger_name, event_object_table, action_timing,
                array_agg(event_manipulation::TEXT ORDER BY event_manipulation) AS events
           FROM information_schema.triggers
          WHERE trigger_schema = $1 AND trigger_name LIKE 'crm_search_capture_%'
          GROUP BY trigger_name, event_object_table, action_timing
          ORDER BY trigger_name`,
        [schema]
      )
      expect(installedTriggers.rows).toEqual([
        { trigger_name: 'crm_search_capture_agency_client_teardown', event_object_table: 'agency_clients', action_timing: 'BEFORE', events: ['DELETE', 'UPDATE'] },
        { trigger_name: 'crm_search_capture_company_change', event_object_table: 'crm_companies', action_timing: 'BEFORE', events: ['DELETE', 'INSERT', 'UPDATE'] },
        { trigger_name: 'crm_search_capture_opportunity_change', event_object_table: 'crm_opportunities', action_timing: 'BEFORE', events: ['DELETE', 'INSERT', 'UPDATE'] },
        { trigger_name: 'crm_search_capture_person_change', event_object_table: 'crm_people', action_timing: 'BEFORE', events: ['DELETE', 'INSERT', 'UPDATE'] }
      ])
      const securedFunctions = await administrator.query(
        `SELECT function_row.proname,
                owner.rolname AS owner,
                function_row.prosecdef,
                COALESCE(function_row.proconfig, ARRAY[]::TEXT[])
                  @> ARRAY['search_path=pg_catalog, pg_temp']::TEXT[] AS pinned_search_path,
                pg_catalog.has_function_privilege($2, function_row.oid, 'EXECUTE') AS migrator_can_execute,
                pg_catalog.has_function_privilege('crm_search_runtime', function_row.oid, 'EXECUTE') AS runtime_can_execute
           FROM pg_catalog.pg_proc function_row
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
           JOIN pg_catalog.pg_roles owner ON owner.oid = function_row.proowner
          WHERE namespace.nspname = $1
            AND function_row.proname = ANY($3::TEXT[])
          ORDER BY function_row.proname`,
        [schema, migratorRole, [
          'crm_search_record_source_intent',
          'crm_search_capture_person_change',
          'crm_search_capture_company_change',
          'crm_search_capture_opportunity_change',
          'crm_search_capture_agency_client_teardown'
        ]]
      )
      expect(securedFunctions.rows).toHaveLength(5)
      for (const functionRow of securedFunctions.rows) {
        expect(functionRow).toMatchObject({
          owner: 'crm_search_governor',
          prosecdef: true,
          pinned_search_path: true,
          migrator_can_execute: false,
          runtime_can_execute: false
        })
      }
      expect((await administrator.query(
        `SELECT pg_catalog.pg_has_role($1, 'crm_search_governor', 'MEMBER') AS leaked_membership,
                pg_catalog.has_table_privilege(
                  'crm_search_governor',
                  pg_catalog.format('%I.agency_clients', $2::TEXT),
                  'SELECT'
                ) AS leaked_client_read`,
        [migratorRole, schema]
      )).rows).toEqual([{ leaked_membership: false, leaked_client_read: false }])
      expect((await administrator.query(
        `SELECT entity_type, entity_id, source_revision, desired_action
           FROM crm_search_source_dirty
          WHERE entity_id IN ($1, $2, $3)
          ORDER BY entity_type`,
        [initialPerson, initialCompany, initialOpportunity]
      )).rows).toEqual([
        { entity_type: 'company', entity_id: initialCompany, source_revision: '1', desired_action: 'upsert' },
        { entity_type: 'opportunity', entity_id: initialOpportunity, source_revision: '1', desired_action: 'upsert' },
        { entity_type: 'person', entity_id: initialPerson, source_revision: '1', desired_action: 'upsert' }
      ])

      const rolledBackPerson = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      await connection.query('BEGIN')
      await connection.query(
        `INSERT INTO crm_people (id, client_id, first_name, search_revision)
         VALUES ($1, $2, 'Rollback', 999)`,
        [rolledBackPerson, clientA]
      )
      await connection.query('ROLLBACK')
      expect((await connection.query(
        `SELECT id FROM crm_people WHERE id = $1`,
        [rolledBackPerson]
      )).rows).toEqual([])
      expect((await administrator.query(
        `SELECT entity_id FROM crm_search_source_dirty WHERE entity_id = $1`,
        [rolledBackPerson]
      )).rows).toEqual([])

      const lifecyclePerson = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      await connection.query(
        `INSERT INTO crm_people (id, client_id, first_name, email, search_revision)
         VALUES ($1, $2, 'Lifecycle', 'one@example.invalid', 777)`,
        [lifecyclePerson, clientA]
      )
      expect((await connection.query(
        `SELECT search_revision FROM crm_people WHERE id = $1`, [lifecyclePerson]
      )).rows).toEqual([{ search_revision: '1' }])
      const beforeIrrelevant = (await administrator.query(
        `SELECT event_sequence FROM crm_search_source_dirty WHERE entity_id = $1`,
        [lifecyclePerson]
      )).rows[0].event_sequence
      await connection.query(
        `UPDATE crm_people SET email = 'two@example.invalid', search_revision = 999 WHERE id = $1`,
        [lifecyclePerson]
      )
      expect((await connection.query(
        `SELECT search_revision FROM crm_people WHERE id = $1`, [lifecyclePerson]
      )).rows).toEqual([{ search_revision: '1' }])
      expect((await administrator.query(
        `SELECT event_sequence FROM crm_search_source_dirty WHERE entity_id = $1`,
        [lifecyclePerson]
      )).rows[0].event_sequence).toBe(beforeIrrelevant)

      await administrator.query(
        `UPDATE crm_search_source_dirty
            SET claim_token = '99999999-9999-4999-8999-999999999999',
                claim_generation = 7,
                claim_lease_expires_at = NOW() + INTERVAL '5 minutes',
                attempt_count = 5,
                error_class = 'transient_failure'
          WHERE entity_id = $1`,
        [lifecyclePerson]
      )
      const lifecycleSteps = [
        [`UPDATE crm_people SET job_title = 'Director' WHERE id = $1`, '2', 'upsert'],
        [`UPDATE crm_people SET deleted_at = NOW() WHERE id = $1`, '3', 'delete'],
        [`UPDATE crm_people SET deleted_at = NULL WHERE id = $1`, '4', 'upsert']
      ] as const
      for (const [statement, revision, action] of lifecycleSteps) {
        await connection.query(statement, [lifecyclePerson])
        expect((await administrator.query(
          `SELECT source_revision, desired_action FROM crm_search_source_dirty WHERE entity_id = $1`,
          [lifecyclePerson]
        )).rows).toEqual([{ source_revision: revision, desired_action: action }])
        if (revision === '2') {
          expect((await administrator.query(
            `SELECT claim_token, claim_generation, claim_lease_expires_at,
                    attempt_count, error_class
               FROM crm_search_source_dirty WHERE entity_id = $1`,
            [lifecyclePerson]
          )).rows).toEqual([{
            claim_token: null,
            claim_generation: '8',
            claim_lease_expires_at: null,
            attempt_count: 0,
            error_class: null
          }])
        }
      }
      await connection.query(`DELETE FROM crm_people WHERE id = $1`, [lifecyclePerson])
      const physicalDeleteIntent = (await administrator.query(
        `SELECT source_revision, desired_action, event_sequence
           FROM crm_search_source_dirty WHERE entity_id = $1`,
        [lifecyclePerson]
      )).rows
      expect(physicalDeleteIntent).toMatchObject([{
        source_revision: '5', desired_action: 'delete'
      }])
      await administrator.query(
        `SELECT crm_search_record_source_intent($1, $2, 'person', $3, 4, 'upsert')`,
        [fixedScopeId, clientA, lifecyclePerson]
      )
      expect((await administrator.query(
        `SELECT source_revision, desired_action, event_sequence
           FROM crm_search_source_dirty WHERE entity_id = $1`,
        [lifecyclePerson]
      )).rows).toEqual(physicalDeleteIntent)

      const movedCompany = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
      await connection.query(
        `INSERT INTO crm_companies (id, client_id, name) VALUES ($1, $2, 'Moved Co')`,
        [movedCompany, clientA]
      )
      await connection.query(
        `UPDATE crm_companies SET client_id = $2, search_revision = 999 WHERE id = $1`,
        [movedCompany, clientB]
      )
      const moveIntent = await administrator.query(
        `SELECT client_id, source_revision, desired_action, event_sequence
           FROM crm_search_source_dirty WHERE entity_id = $1 ORDER BY client_id`,
        [movedCompany]
      )
      expect(moveIntent.rows.map(row => ({
        client_id: row.client_id,
        source_revision: row.source_revision,
        desired_action: row.desired_action
      }))).toEqual([
        { client_id: clientA, source_revision: '2', desired_action: 'delete' },
        { client_id: clientB, source_revision: '2', desired_action: 'upsert' }
      ])
      expect(new Set(moveIntent.rows.map(row => row.event_sequence)).size).toBe(2)

      await administrator.query(
        `UPDATE crm_search_policies SET candidate_schema_version = 'crm-search-v1'
          WHERE organisation_scope_id = $1 AND client_id = $2`,
        [fixedScopeId, clientB]
      )
      const fencePeer = await openPeer(sourceConfig, schema)
      try {
        await administrator.query('BEGIN')
        await administrator.query(
          `SELECT pg_catalog.pg_advisory_xact_lock(
             crm_search_client_advisory_lock_key($1, $2)
           )`,
          [fixedScopeId, clientB]
        )
        expect((await administrator.query(
          `SELECT candidate_schema_version FROM crm_search_policies
            WHERE organisation_scope_id = $1 AND client_id = $2 FOR UPDATE`,
          [fixedScopeId, clientB]
        )).rows).toEqual([{ candidate_schema_version: 'crm-search-v1' }])
        await fencePeer.query('BEGIN')
        let sourceWriteSettled = false
        const sourceWrite = fencePeer.query(
          `UPDATE crm_companies SET lifecycle_stage = 'customer' WHERE id = $1`,
          [movedCompany]
        ).finally(() => { sourceWriteSettled = true })
        await delay(100)
        expect(sourceWriteSettled).toBe(false)
        await administrator.query(
          `UPDATE crm_search_policies
              SET active_schema_version = candidate_schema_version,
                  candidate_schema_version = NULL
            WHERE organisation_scope_id = $1 AND client_id = $2`,
          [fixedScopeId, clientB]
        )
        await administrator.query('COMMIT')
        await sourceWrite
        await fencePeer.query('COMMIT')
        expect((await administrator.query(
          `SELECT source_revision, desired_action
             FROM crm_search_source_dirty
            WHERE organisation_scope_id = $1 AND client_id = $2
              AND entity_type = 'company' AND entity_id = $3`,
          [fixedScopeId, clientB, movedCompany]
        )).rows).toEqual([{ source_revision: '3', desired_action: 'upsert' }])
      } finally {
        await administrator.query('ROLLBACK').catch(() => undefined)
        await fencePeer.query('ROLLBACK').catch(() => undefined)
        await fencePeer.end()
      }

      const oppositeOne = '01010101-0101-4101-8101-010101010101'
      const oppositeTwo = '02020202-0202-4202-8202-020202020202'
      await connection.query(
        `INSERT INTO crm_companies (id, client_id, name) VALUES
           ($1, $3, 'Opposite One'), ($2, $4, 'Opposite Two')`,
        [oppositeOne, oppositeTwo, clientA, clientB]
      )
      const moveOne = await openPeer(sourceConfig, schema)
      const moveTwo = await openPeer(sourceConfig, schema)
      try {
        await moveOne.query('BEGIN')
        await moveTwo.query('BEGIN')
        const first = moveOne.query(
          `UPDATE crm_companies SET client_id = $2 WHERE id = $1`,
          [oppositeOne, clientB]
        ).then(() => ({ peer: moveOne, other: moveTwo, error: null as Error | null }))
          .catch(error => ({ peer: moveOne, other: moveTwo, error: error as Error }))
        const second = moveTwo.query(
          `UPDATE crm_companies SET client_id = $2 WHERE id = $1`,
          [oppositeTwo, clientA]
        ).then(() => ({ peer: moveTwo, other: moveOne, error: null as Error | null }))
          .catch(error => ({ peer: moveTwo, other: moveOne, error: error as Error }))
        const winner = await Promise.race([first, second])
        expect(winner.error).toBeNull()
        await winner.peer.query('COMMIT')
        const outcomes = await Promise.all([first, second])
        expect(outcomes.every(outcome => outcome.error === null)).toBe(true)
        await winner.other.query('COMMIT')
      } finally {
        await moveOne.query('ROLLBACK').catch(() => undefined)
        await moveTwo.query('ROLLBACK').catch(() => undefined)
        await moveOne.end()
        await moveTwo.end()
      }
      expect((await connection.query(
        `SELECT id, client_id FROM crm_companies WHERE id IN ($1, $2) ORDER BY id`,
        [oppositeOne, oppositeTwo]
      )).rows).toEqual([
        { id: oppositeOne, client_id: clientB },
        { id: oppositeTwo, client_id: clientA }
      ])

      const hardDeletePerson = '04040404-0404-4404-8404-040404040404'
      await connection.query(
        `INSERT INTO crm_people (id, client_id, first_name) VALUES ($1, $2, 'Concurrent Delete')`,
        [hardDeletePerson, hardDeleteClient]
      )
      await administrator.query(
        `INSERT INTO crm_search_namespaces
           (organisation_scope_id, client_id, namespace, source_tuple_digest)
         VALUES ($1, $2, 'n_hard_delete_client', $3)`,
        [fixedScopeId, hardDeleteClient, 'e'.repeat(64)]
      )
      await administrator.query(
        `INSERT INTO crm_search_documents
           (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
            vector_id, namespace, source_revision, source_event_sequence, content_hash,
            confirmation_state, tombstoned)
         VALUES ($1, $2, 'person', $3, 'crm-search-v1', 'v_hard_delete_document',
           'n_hard_delete_client', 1, 900, $4, 'indexed', FALSE)`,
        [fixedScopeId, hardDeleteClient, hardDeletePerson, 'f'.repeat(64)]
      )
      const hardDeleteSource = await openPeer(sourceConfig, schema)
      const hardDeletePeer = await openPeer(sourceConfig, schema)
      try {
        const hardDeletePid = Number((await hardDeletePeer.query(
          `SELECT pg_catalog.pg_backend_pid() AS pid`
        )).rows[0].pid)
        await hardDeleteSource.query('BEGIN')
        await hardDeleteSource.query(
          `SELECT id FROM crm_people WHERE id = $1 FOR UPDATE`,
          [hardDeletePerson]
        )
        await hardDeletePeer.query('BEGIN')
        const hardDelete = hardDeletePeer.query(
          `DELETE FROM agency_clients WHERE id = $1`,
          [hardDeleteClient]
        ).then(() => null as Error | null).catch(error => error as Error)
        await waitForBackendLock(administrator, hardDeletePid)

        const relevantUpdateError = await hardDeleteSource.query(
          `UPDATE crm_people SET first_name = 'Concurrent Updated' WHERE id = $1`,
          [hardDeletePerson]
        ).then(() => null as Error | null).catch(error => error as Error)
        expect(relevantUpdateError).toBeNull()
        await hardDeleteSource.query('COMMIT')

        const hardDeleteError = await hardDelete
        expect(hardDeleteError).toBeNull()
        await hardDeletePeer.query('COMMIT')
      } finally {
        await hardDeleteSource.query('ROLLBACK').catch(() => undefined)
        await hardDeletePeer.query('ROLLBACK').catch(() => undefined)
        await hardDeleteSource.end()
        await hardDeletePeer.end()
      }
      expect((await administrator.query(
        `SELECT teardown.client_deleted_at IS NOT NULL AS deleted,
                pg_catalog.array_agg(vector.vector_id ORDER BY vector.vector_id) AS vectors
           FROM crm_search_client_teardowns teardown
           LEFT JOIN crm_search_teardown_vectors vector ON vector.teardown_id = teardown.id
          WHERE teardown.organisation_scope_id = $1 AND teardown.client_id = $2
          GROUP BY teardown.id`,
        [fixedScopeId, hardDeleteClient]
      )).rows).toEqual([{
        deleted: true,
        vectors: ['v_hard_delete_document']
      }])
      expect((await administrator.query(
        `SELECT source_revision, desired_action
           FROM crm_search_source_dirty
          WHERE organisation_scope_id = $1 AND client_id = $2
            AND entity_type = 'person' AND entity_id = $3`,
        [fixedScopeId, hardDeleteClient, hardDeletePerson]
      )).rows).toEqual([{ source_revision: '3', desired_action: 'delete' }])

      const teardownPerson = '03030303-0303-4303-8303-030303030303'
      await connection.query(
        `INSERT INTO crm_people (id, client_id, first_name) VALUES ($1, $2, 'Erase Me')`,
        [teardownPerson, teardownClient]
      )
      await administrator.query(
        `INSERT INTO crm_search_namespaces
           (organisation_scope_id, client_id, namespace, source_tuple_digest)
         VALUES ($1, $2, 'n_teardown_client_01', $3)`,
        [fixedScopeId, teardownClient, 'a'.repeat(64)]
      )
      await administrator.query(
        `INSERT INTO crm_search_documents
           (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
            vector_id, namespace, source_revision, source_event_sequence, content_hash,
            confirmation_state, tombstoned)
         VALUES ($1, $2, 'person', $3, 'crm-search-v1', 'v_teardown_document',
           'n_teardown_client_01', 1, 800, $4, 'indexed', FALSE)`,
        [fixedScopeId, teardownClient, teardownPerson, 'b'.repeat(64)]
      )
      const pendingOperation = await administrator.query(
        `INSERT INTO crm_search_operations
           (organisation_scope_id, client_id, entity_type, entity_id, schema_version,
            source_revision, source_event_sequence, desired_action, vector_id, namespace,
            content_hash, confirmation_tag, confirmation_key_version)
         VALUES ($1, $2, 'person', $3, 'crm-search-v1', 1, 801, 'upsert',
           'v_teardown_pending', 'n_teardown_client_01', $4, $5, 'k1')
         RETURNING id`,
        [fixedScopeId, teardownClient, teardownPerson, 'c'.repeat(64), `hmac-sha256:${'d'.repeat(64)}`]
      )
      const operationId = pendingOperation.rows[0].id as string
      await administrator.query(
        `UPDATE crm_search_global_control SET state = 'enabled', revision = 1
          WHERE organisation_scope_id = $1`,
        [fixedScopeId]
      )
      await administrator.query(`UPDATE crm_search_operations SET state = 'queued' WHERE id = $1`, [operationId])
      await administrator.query(`UPDATE crm_search_operations SET state = 'processing' WHERE id = $1`, [operationId])
      await administrator.query(`SELECT crm_search_admit_operation($1, 'processing', 1)`, [operationId])
      await administrator.query(
        `UPDATE crm_search_operations SET state = 'provider_pending',
          provider_mutation_id = 'pending-before-teardown', provider_accepted_at = NOW()
          WHERE id = $1`,
        [operationId]
      )
      await administrator.query(
        `UPDATE crm_search_global_control SET state = 'halted', indexing_ready = FALSE, revision = 2
          WHERE organisation_scope_id = $1`,
        [fixedScopeId]
      )

      await connection.query(`UPDATE agency_clients SET is_active = FALSE WHERE id = $1`, [teardownClient])
      const activeTeardown = await administrator.query(
        `SELECT id, state, provider_deletion_state, client_deactivated_at IS NOT NULL AS deactivated,
                ledger_manifest_hash
           FROM crm_search_client_teardowns
          WHERE organisation_scope_id = $1 AND client_id = $2`,
        [fixedScopeId, teardownClient]
      )
      expect(activeTeardown.rows).toHaveLength(1)
      expect(activeTeardown.rows[0]).toMatchObject({
        state: 'pending', provider_deletion_state: 'not_started', deactivated: true
      })
      expect(activeTeardown.rows[0].ledger_manifest_hash).toMatch(/^[a-f0-9]{64}$/)
      expect((await administrator.query(
        `SELECT lifecycle_state, effective_mode, indexing_enabled,
                active_schema_version, candidate_schema_version,
                active_teardown_id, daily_query_budget_usd_micros,
                daily_indexing_budget_usd_micros
           FROM crm_search_policies
          WHERE organisation_scope_id = $1 AND client_id = $2`,
        [fixedScopeId, teardownClient]
      )).rows).toEqual([{
        lifecycle_state: 'teardown_pending',
        effective_mode: 'off',
        indexing_enabled: false,
        active_schema_version: null,
        candidate_schema_version: null,
        active_teardown_id: activeTeardown.rows[0].id,
        daily_query_budget_usd_micros: '0',
        daily_indexing_budget_usd_micros: '0'
      }])
      expect((await administrator.query(
        `SELECT vector_id FROM crm_search_teardown_vectors
          WHERE teardown_id = $1 ORDER BY vector_id`,
        [activeTeardown.rows[0].id]
      )).rows).toEqual([
        { vector_id: 'v_teardown_document' },
        { vector_id: 'v_teardown_pending' }
      ])

      await administrator.query(
        `DELETE FROM crm_search_policies WHERE organisation_scope_id = $1 AND client_id = $2`,
        [fixedScopeId, teardownClient]
      )
      await connection.query(`DELETE FROM agency_clients WHERE id = $1`, [teardownClient])
      expect((await administrator.query(
        `SELECT teardown.client_deleted_at IS NOT NULL AS deleted,
                COUNT(vector.id)::INTEGER AS vector_count
           FROM crm_search_client_teardowns teardown
           LEFT JOIN crm_search_teardown_vectors vector ON vector.teardown_id = teardown.id
          WHERE teardown.id = $1
          GROUP BY teardown.id`,
        [activeTeardown.rows[0].id]
      )).rows).toEqual([{ deleted: true, vector_count: 2 }])
      expect((await administrator.query(
        `SELECT desired_action FROM crm_search_source_dirty
          WHERE client_id = $1 AND entity_id = $2`,
        [teardownClient, teardownPerson]
      )).rows).toEqual([{ desired_action: 'delete' }])
    } finally {
      await administrator.query('ROLLBACK').catch(() => undefined)
      await administrator.query('RESET search_path').catch(() => undefined)
      if (connectionOpened) {
        await connection.query('ROLLBACK').catch(() => undefined)
        if (schemaCreated) {
          await connection.query('RESET search_path').catch(() => undefined)
          await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined)
        }
        await connection.end()
      }
      await administrator.query(
        `REVOKE ALL PRIVILEGES ON DATABASE crm_search_task6_a1b2 FROM "${migratorRole}"`
      ).catch(() => undefined)
      await administrator.query(`DROP ROLE IF EXISTS "${migratorRole}"`).catch(() => undefined)
      await administrator.end()
    }
  }, 60_000)
})
