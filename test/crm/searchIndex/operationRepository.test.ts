import { existsSync, readFileSync } from 'node:fs'
import { Client, type ClientConfig } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import {
  admitCrmSearchOperation,
  claimCrmSearchOperations,
  completeCrmSearchOperationClaim,
  upsertCrmSearchOperation
} from '~~/server/utils/crm/searchIndex/operationRepository'
import {
  completeCrmSearchDocumentClaim,
  upsertCrmSearchDocumentCas
} from '~~/server/utils/crm/searchIndex/documentRepository'
import { requireCrmSearchProviderAuthority } from '~~/server/utils/crm/searchIndex/policyRepository'
import { completeCrmSearchDirtySourceClaim } from '~~/server/utils/crm/searchIndex/sourceRepository'

const base = {
  organisationScopeId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  entityType: 'company' as const,
  entityId: '33333333-3333-4333-8333-333333333333',
  schemaVersion: 'crm-search-v1',
  desiredAction: 'upsert' as const,
  vectorId: 'vector-id',
  namespace: 'namespace-id',
  contentHash: 'a'.repeat(64),
  confirmationTag: `hmac-sha256:${'b'.repeat(64)}`,
  confirmationKeyVersion: 'k1'
}

const operationRow = {
  id: '44444444-4444-4444-8444-444444444444',
  organisation_scope_id: base.organisationScopeId,
  client_id: base.clientId,
  entity_type: base.entityType,
  entity_id: base.entityId,
  schema_version: base.schemaVersion,
  source_revision: '3',
  source_event_sequence: '13',
  desired_action: base.desiredAction,
  vector_id: base.vectorId,
  namespace: base.namespace,
  content_hash: base.contentHash,
  confirmation_tag: base.confirmationTag,
  confirmation_key_version: base.confirmationKeyVersion,
  control_revision: '0',
  state: 'pending_transport',
  successor_of: null,
  lease_token: null,
  lease_generation: '0',
  lease_expires_at: null,
  provider_admitted_at: null,
  provider_mutation_id: null,
  provider_accepted_at: null
}

describe('CRM search operation repository', () => {
  it('keeps one admitted provider operation and replaces only its one coalesced successor', async () => {
    const pending = {
      ...operationRow,
      id: '55555555-5555-4555-8555-555555555555',
      state: 'provider_pending',
      provider_admitted_at: '2026-08-10T00:00:00.000Z',
      provider_mutation_id: 'mutation-1',
      provider_accepted_at: '2026-08-10T00:00:01.000Z'
    }
    const successor = {
      ...operationRow,
      id: '66666666-6666-4666-8666-666666666666',
      source_revision: '4',
      source_event_sequence: '14',
      successor_of: pending.id
    }
    const updated = { ...successor, source_revision: '5', source_event_sequence: '15' }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [pending, successor] })
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 })

    const result = await upsertCrmSearchOperation({
      ...base,
      sourceRevision: 5,
      sourceEventSequence: 15
    }, { query } as never)

    expect(result).toMatchObject({
      id: successor.id,
      sourceRevision: 5,
      sourceEventSequence: 15,
      successorOf: pending.id
    })
    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE')
    expect(query.mock.calls[1]?.[0]).toContain('UPDATE crm_search_operations')
    expect(query.mock.calls[1]?.[0]).toContain('successor_of = $')
  })

  it('coalesces repeated pre-admission intent into one replaceable root', async () => {
    const updated = { ...operationRow, source_revision: '4', source_event_sequence: '14' }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [operationRow] })
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 })

    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 14
    }, { query } as never)).resolves.toMatchObject({ sourceRevision: 4 })
    expect(query.mock.calls[1]?.[0]).toContain('successor_of IS NULL')
  })

  it('does not replace newer intent with an older revision/event pair', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [operationRow] })
    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 2,
      sourceEventSequence: 12
    }, { query } as never)).resolves.toMatchObject({ sourceRevision: 3 })
    expect(query).toHaveBeenCalledOnce()
  })

  it('does not accept a higher revision carrying an older global event sequence', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [operationRow] })
    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 12
    }, { query } as never)).resolves.toMatchObject({
      sourceRevision: 3,
      sourceEventSequence: 13
    })
    expect(query).toHaveBeenCalledOnce()
  })

  it('returns an exact terminal operation idempotently instead of inserting a duplicate root', async () => {
    const confirmed = {
      ...operationRow,
      state: 'confirmed',
      provider_admitted_at: '2026-08-10T00:00:00.000Z',
      provider_mutation_id: 'mutation-1',
      provider_accepted_at: '2026-08-10T00:00:01.000Z'
    }
    const query = vi.fn().mockResolvedValueOnce({ rows: [confirmed] })
    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 3,
      sourceEventSequence: 13
    }, { query } as never)).resolves.toMatchObject({ id: confirmed.id, state: 'confirmed' })
    expect(query).toHaveBeenCalledOnce()
  })

  it('claims bounded operations with SKIP LOCKED and completes only by lease CAS', async () => {
    const claimed = {
      ...operationRow,
      state: 'processing',
      lease_token: '77777777-7777-4777-8777-777777777777',
      lease_generation: '2',
      lease_expires_at: '2026-08-10T00:01:00.000Z'
    }
    const claimQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [claimed] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query: claimQuery }))
    const [claim] = await claimCrmSearchOperations({
      limit: 10,
      leaseSeconds: 60,
      now: '2026-08-10T00:00:00.000Z'
    }, { transactionWithoutRetry } as never)

    expect(claimQuery.mock.calls[0]?.[0]).toContain('state = \'queued\'')
    expect(claimQuery.mock.calls[1]?.[0]).toContain('FOR UPDATE SKIP LOCKED')
    expect(claimQuery.mock.calls[1]?.[0]).toContain('state IN (\'queued\', \'retryable\')')
    const completionQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 })
    await expect(completeCrmSearchOperationClaim({
      id: claim!.id,
      leaseToken: claim!.leaseToken!,
      leaseGeneration: claim!.leaseGeneration,
      expectedState: 'processing',
      nextState: 'retryable',
      errorClass: 'provider_unavailable',
      nextAttemptAt: '2026-08-10T00:05:00.000Z'
    }, { query: completionQuery } as never)).resolves.toBe(true)
    const sql = completionQuery.mock.calls[0]?.[0] as string
    expect(sql).toContain('lease_token = $2')
    expect(sql).toContain('lease_generation = $3')
    expect(sql).toContain('state = $4')
  })

  it('coalesces claimed unadmitted identity into a legal retryable state', async () => {
    const processing = {
      ...operationRow,
      state: 'processing',
      lease_token: '77777777-7777-4777-8777-777777777777',
      lease_generation: '2',
      lease_expires_at: '2026-08-10T00:01:00.000Z'
    }
    const updated = {
      ...processing,
      source_revision: '4',
      source_event_sequence: '14',
      state: 'retryable',
      lease_token: null,
      lease_expires_at: null
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [processing] })
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 })

    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 14
    }, { query } as never)).resolves.toMatchObject({
      sourceRevision: 4,
      state: 'retryable',
      leaseToken: null
    })
    const sql = query.mock.calls[1]?.[0] as string
    expect(sql).not.toMatch(/state\s*=\s*'pending_transport'/)
    expect(sql).toMatch(/state\s*=\s*CASE/i)
  })

  it('admits provider work only through the governed database function and returns the stamped revision', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      state: 'admitted', control_revision: '19', lease_generation: '4'
    }] })
    await expect(admitCrmSearchOperation({
      operationId: operationRow.id,
      expectedState: 'processing',
      expectedControlRevision: 19,
      leaseToken: '77777777-7777-4777-8777-777777777777',
      leaseGeneration: 4
    }, { query } as never)).resolves.toEqual({
      state: 'admitted', controlRevision: 19, leaseGeneration: 4
    })
    expect(query.mock.calls[0]?.[0]).toContain('crm_search_admit_operation')
  })

  it('updates document state only when source high-watermark and lease generation match', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: operationRow.id }], rowCount: 1 })
    await expect(upsertCrmSearchDocumentCas({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 14,
      confirmationState: 'provider_pending',
      tombstoned: false,
      providerMutationId: 'mutation-2',
      expectedSourceRevision: 3,
      expectedSourceEventSequence: 13
    }, { query } as never)).resolves.toBe(true)
    expect(query.mock.calls[0]?.[0]).toContain('source_revision = $')
    expect(query.mock.calls[0]?.[0]).toContain('source_event_sequence = $')
    expect(query.mock.calls[0]?.[0]).toContain('UPDATE crm_search_documents')
    expect(query.mock.calls[0]?.[0]).toContain('source_event_sequence < $')
  })

  it('inserts a document only from an explicit zero high-watermark', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: operationRow.id }], rowCount: 1 })
    await expect(upsertCrmSearchDocumentCas({
      ...base,
      sourceRevision: 1,
      sourceEventSequence: 1,
      confirmationState: 'provider_pending',
      tombstoned: false,
      providerMutationId: 'mutation-1',
      expectedSourceRevision: 0,
      expectedSourceEventSequence: 0
    }, { query } as never)).resolves.toBe(true)
    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO crm_search_documents')
  })

  it('rejects a document update that regresses either source high-watermark', async () => {
    const query = vi.fn()
    await expect(upsertCrmSearchDocumentCas({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 12,
      confirmationState: 'provider_pending',
      tombstoned: false,
      providerMutationId: 'mutation-2',
      expectedSourceRevision: 3,
      expectedSourceEventSequence: 13
    }, { query } as never)).rejects.toThrow('crm_search_invalid_document')
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects stale document confirmation CAS instead of advancing the ledger', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    await expect(completeCrmSearchDocumentClaim({
      documentId: operationRow.id,
      leaseToken: '77777777-7777-4777-8777-777777777777',
      leaseGeneration: 4,
      expectedConfirmationState: 'provider_pending',
      nextConfirmationState: 'indexed',
      expectedSourceRevision: 4,
      expectedProviderMutationId: 'mutation-2',
      providerHighWatermark: 14
    }, { query } as never)).resolves.toBe(false)
  })
})

const task8LocalDsn = process.env.CRM_SEARCH_TASK8_TEST_DSN?.trim()
const task8ApplicationName = 'crm-search-task8-test'

function guardedTask8LocalPostgresConfig(raw: string): ClientConfig {
  const url = new URL(raw)
  const socketDirectory = url.searchParams.get('host') ?? ''
  const database = url.pathname.replace(/^\//, '')
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== 'localhost'
    || url.port !== ''
    || !socketDirectory.startsWith('/private/tmp/crm-search-task8-pg-')
    || socketDirectory.includes('..')
    || !/^crm_search_task8_[a-z0-9_]{4,80}$/.test(database)
    || url.password
    || url.searchParams.get('application_name') !== task8ApplicationName
    || url.searchParams.getAll('application_name').length !== 1) {
    throw new Error('CRM search Task 8 tests require a credential-free isolated local Unix socket')
  }
  return {
    host: socketDirectory,
    database,
    user: url.username || undefined,
    application_name: task8ApplicationName,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    statement_timeout: 10_000
  }
}

function task8MigrationForSchema(schema: string): string {
  const path = new URL('../../../server/database/migrations/350_crm_search_expand.sql', import.meta.url)
  if (!existsSync(path)) throw new Error('Missing CRM search migration 350')
  return readFileSync(path, 'utf8')
    .replace(/^\s*BEGIN;\s*/i, '')
    .replace(/\s*COMMIT;\s*$/i, '')
    .replaceAll('public.', `"${schema}".`)
}

function task8NeonCompatibleQuery(client: Client) {
  return async (text: string, values?: unknown[]) => {
    const result = await client.query(text, values)
    return {
      ...result,
      rows: result.rows.map(row => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value instanceof Date ? value.toISOString() : value
        ])
      ))
    }
  }
}

async function waitForTask8BackendLock(observer: Client, processId: number): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const activity = await observer.query(
      'SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE pid = $1',
      [processId]
    )
    if (activity.rows[0]?.wait_event_type === 'Lock') return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`PostgreSQL backend ${processId} did not wait for the client fence`)
}

const task8DatabaseDescribe = task8LocalDsn ? describe.sequential : describe.skip

task8DatabaseDescribe('CRM search Task 8 repositories on isolated local PostgreSQL 14', () => {
  it('uses legal trigger-backed operation transitions, narrow runtime completion, and a shared promotion fence', async () => {
    const config = guardedTask8LocalPostgresConfig(task8LocalDsn!)
    const schema = `crm_search_task8_${crypto.randomUUID().replaceAll('-', '')}`
    const runtimeLogin = `crm_search_task8_runtime_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
    const administrator = new Client(config)
    const runtime = new Client({ ...config, user: runtimeLogin })
    const peer = new Client(config)
    let schemaCreated = false
    let runtimeCreated = false
    let runtimeConnected = false
    let peerConnected = false
    const administratorRepositoryQuery = task8NeonCompatibleQuery(administrator)

    await administrator.connect()
    try {
      await administrator.query(`CREATE SCHEMA "${schema}"`)
      schemaCreated = true
      await administrator.query(`SET search_path TO "${schema}", pg_catalog`)
      await administrator.query(`
        CREATE TABLE crm_people (id UUID PRIMARY KEY, client_id UUID NOT NULL, deleted_at TIMESTAMPTZ);
        CREATE TABLE crm_companies (id UUID PRIMARY KEY, client_id UUID NOT NULL, deleted_at TIMESTAMPTZ);
        CREATE TABLE crm_opportunities (id UUID PRIMARY KEY, client_id UUID NOT NULL, deleted_at TIMESTAMPTZ);
      `)
      await administrator.query(task8MigrationForSchema(schema))

      await administrator.query(`CREATE ROLE "${runtimeLogin}" LOGIN NOINHERIT`)
      runtimeCreated = true
      await administrator.query(`GRANT crm_search_runtime TO "${runtimeLogin}"`)
      await runtime.connect()
      runtimeConnected = true
      await runtime.query('SET ROLE crm_search_runtime')
      await runtime.query(`SET search_path TO "${schema}", pg_catalog`)

      await administrator.query(
        `INSERT INTO crm_search_organisation_scopes
           (id, scope_key, scope_kind, is_primary, is_active)
         VALUES ($1, 'task8-installation', 'installation', TRUE, TRUE)`,
        [base.organisationScopeId]
      )
      await administrator.query(
        `INSERT INTO crm_search_global_control
           (organisation_scope_id, state, maximum_mode, indexing_ready, revision)
         VALUES ($1, 'enabled', 'assist', TRUE, 7)`,
        [base.organisationScopeId]
      )
      await administrator.query(
        `INSERT INTO crm_search_schema_versions
           (organisation_scope_id, schema_version, model_id, dimensions, distance_metric,
            pooling, tokenizer_revision, document_builder_revision, normalization_revision,
            max_input_tokens, canonical_max_code_points, metadata_index_state, sentinel_state,
            provider_contract_digest, created_by)
         VALUES ($1, $2, '@cf/baai/bge-base-en-v1.5', 768, 'cosine', 'cls',
           'tokenizer-v1', 'builder-v1', 'normalization-v1', 512, 1000, 'ready',
           'confirmed_absent', $3, $4)`,
        [base.organisationScopeId, base.schemaVersion, 'a'.repeat(64), base.entityId]
      )
      await administrator.query(
        `INSERT INTO crm_search_policies
           (organisation_scope_id, client_id, lifecycle_state, effective_mode,
            indexing_enabled, active_schema_version, revision)
         VALUES ($1, $2, 'indexing', 'off', TRUE, $3, 11)`,
        [base.organisationScopeId, base.clientId, base.schemaVersion]
      )

      const operation = await upsertCrmSearchOperation({
        ...base,
        sourceRevision: 1,
        sourceEventSequence: 1
      }, { query: administratorRepositoryQuery } as never)
      const claims = await claimCrmSearchOperations({
        limit: 10,
        leaseSeconds: 60,
        now: '2026-08-10T23:59:00.000Z'
      }, {
        transactionWithoutRetry: async (callback: never) => {
          await administrator.query('BEGIN')
          try {
            const result = await (callback as (client: unknown) => Promise<unknown>)({
              query: administratorRepositoryQuery
            })
            await administrator.query('COMMIT')
            return result
          } catch (error) {
            await administrator.query('ROLLBACK')
            throw error
          }
        }
      } as never)
      expect(claims).toHaveLength(1)
      expect(claims[0]).toMatchObject({ id: operation.id, state: 'processing' })

      const coalesced = await upsertCrmSearchOperation({
        ...base,
        sourceRevision: 2,
        sourceEventSequence: 2
      }, { query: administratorRepositoryQuery } as never)
      expect(coalesced).toMatchObject({
        id: operation.id,
        sourceRevision: 2,
        sourceEventSequence: 2,
        state: 'retryable',
        leaseToken: null
      })

      const dirtyId = '88888888-8888-4888-8888-888888888888'
      const claimToken = '99999999-9999-4999-8999-999999999999'
      await administrator.query(
        `INSERT INTO crm_search_source_dirty
           (id, organisation_scope_id, client_id, entity_type, entity_id,
            source_revision, desired_action, event_sequence, claim_token,
            claim_generation, claim_lease_expires_at)
         VALUES ($1, $2, $3, 'company', $4, 3, 'upsert', 3, $5, 4, NOW() + INTERVAL '1 minute')`,
        [dirtyId, base.organisationScopeId, base.clientId, base.entityId, claimToken]
      )
      await runtime.query('BEGIN')
      await expect(runtime.query(
        'DELETE FROM crm_search_source_dirty WHERE id = $1',
        [dirtyId]
      )).rejects.toThrow(/permission denied/i)
      await runtime.query('ROLLBACK')
      await expect(completeCrmSearchDirtySourceClaim({
        id: dirtyId,
        sourceRevision: 3,
        eventSequence: 3,
        claimToken,
        claimGeneration: 4
      }, { query: runtime.query.bind(runtime) } as never)).resolves.toBe(true)

      await peer.connect()
      peerConnected = true
      await peer.query(`SET search_path TO "${schema}", pg_catalog`)
      const peerPid = Number((await peer.query(
        'SELECT pg_catalog.pg_backend_pid() AS pid'
      )).rows[0].pid)
      await administrator.query('BEGIN')
      await requireCrmSearchProviderAuthority({
        organisationScopeId: base.organisationScopeId,
        clientId: base.clientId,
        action: 'upsert',
        schemaVersion: base.schemaVersion,
        infrastructureReady: true
      }, { query: administratorRepositoryQuery } as never)
      await peer.query('BEGIN')
      let exclusiveSettled = false
      const exclusive = peer.query(
        'SELECT pg_catalog.pg_advisory_xact_lock(crm_search_client_advisory_lock_key($1, $2))',
        [base.organisationScopeId, base.clientId]
      ).finally(() => { exclusiveSettled = true })
      await waitForTask8BackendLock(administrator, peerPid)
      expect(exclusiveSettled).toBe(false)
      await administrator.query('COMMIT')
      await exclusive
      await peer.query('ROLLBACK')
    } finally {
      await administrator.query('ROLLBACK').catch(() => undefined)
      if (peerConnected) {
        await peer.query('ROLLBACK').catch(() => undefined)
        await peer.end()
      }
      if (runtimeConnected) {
        await runtime.query('ROLLBACK').catch(() => undefined)
        await runtime.query('RESET ROLE').catch(() => undefined)
        await runtime.end()
      }
      if (runtimeCreated) {
        await administrator.query(`REVOKE crm_search_runtime FROM "${runtimeLogin}"`).catch(() => undefined)
        await administrator.query(`DROP ROLE IF EXISTS "${runtimeLogin}"`).catch(() => undefined)
      }
      if (schemaCreated) {
        await administrator.query('RESET search_path').catch(() => undefined)
        await administrator.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined)
      }
      await administrator.end()
    }
  }, 60_000)
})
