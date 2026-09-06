import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  acceptPageStudioAiProposal,
  commitPageStudioCheckpoint,
  recordPageStudioCheckpoint,
  type PageStudioCheckpointInput,
  type PageStudioControlQueryClient,
  type PageStudioControlScope
} from '~~/server/utils/pageStudio/controlStore'

const databaseUrl = process.env.PAGE_STUDIO_DATABASE_TEST_URL
// Never run this mutating integration fixture against an application database.
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || !/^\/page_studio_checkpoint_cas_test(?:_[a-z0-9_]+)?$/.test(target.pathname)
    || target.search
  ) {
    throw new Error('Checkpoint CAS tests require a local disposable page_studio_checkpoint_cas_test database')
  }
}

const migrationSql = readFileSync(
  new URL('../../server/database/migrations/402_page_studio_control_plane.sql', import.meta.url),
  'utf8'
)
const bootstrapSql = `
  CREATE TABLE team_members (id UUID PRIMARY KEY, user_role TEXT);
  CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL DEFAULT TRUE);
  CREATE TABLE client_users (
    id UUID PRIMARY KEY, client_id UUID NOT NULL REFERENCES agency_clients(id),
    status TEXT NOT NULL, role TEXT NOT NULL,
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE);
  CREATE TABLE role_permission_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES custom_roles(id),
    permission_group VARCHAR(50) NOT NULL,
    UNIQUE (role_id, permission_group)
  );
  INSERT INTO custom_roles (id, slug) VALUES
    ('10000000-0000-4000-8000-000000000001', 'owner');
`

type Outcome<T> = { ok: true, value: T } | { ok: false, error: unknown }
const capture = <T>(promise: Promise<T>): Promise<Outcome<T>> => promise.then(
  value => ({ ok: true, value }),
  error => ({ ok: false, error })
)
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe.runIf(Boolean(databaseUrl))('Page Studio atomic checkpoint commits on disposable PostgreSQL', () => {
  let observer: pg.Client
  let schema: string
  let scope: PageStudioControlScope
  const userId = '40000000-0000-4000-8000-000000000001'
  let connections: pg.Client[]

  async function connect() {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connections.push(client)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    await client.query('SET statement_timeout TO \'10s\'')
    return client
  }

  function transactionFor(client: pg.Client) {
    return async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>): Promise<T> => {
      await client.query('BEGIN')
      try {
        const result = await callback(client as unknown as PageStudioControlQueryClient)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  }

  function checkpoint(id: string, digestCharacter: string, checkpointScope = scope): PageStudioCheckpointInput {
    return {
      checkpointId: id,
      createdAt: '2026-09-06T01:00:00.000Z',
      digest: digestCharacter.repeat(64),
      etag: `etag-${id}`,
      objectKey: `tenants/${checkpointScope.tenantId}/clients/${checkpointScope.clientId}/sites/${checkpointScope.siteId}/checkpoints/${id}.json`,
      scope: checkpointScope,
      userId
    }
  }

  async function snapshot() {
    const result = await observer.query(`
      SELECT current_checkpoint_id,
        (SELECT COUNT(*)::integer FROM page_studio_checkpoints) AS checkpoints,
        (SELECT COUNT(*)::integer FROM page_studio_audit_events) AS audits,
        (SELECT COUNT(*)::integer FROM page_studio_versions) AS versions
      FROM page_studio_sites WHERE id = $1
    `, [scope.siteId])
    return result.rows[0]
  }

  async function waitForLock(pid: number) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const result = await observer.query(
        `SELECT wait_event_type, cardinality(pg_blocking_pids(pid)) AS blockers
         FROM pg_stat_activity WHERE pid = $1`, [pid]
      )
      if (result.rows[0]?.wait_event_type === 'Lock' && result.rows[0]?.blockers > 0) return
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error('Expected a real PostgreSQL lock waiter before releasing the competing transaction')
  }

  beforeEach(async () => {
    connections = []
    schema = `page_studio_cas_${randomUUID().replaceAll('-', '')}`
    observer = await connect()
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query(bootstrapSql)
    await observer.query(migrationSql)
    const tenantId = 'tenant-cas'
    const clientId = '20000000-0000-4000-8000-000000000001'
    const ownerId = '30000000-0000-4000-8000-000000000001'
    await observer.query('INSERT INTO team_members (id, user_role) VALUES ($1, $2)', [ownerId, 'owner'])
    await observer.query('INSERT INTO agency_clients (id) VALUES ($1)', [clientId])
    await observer.query(
      'INSERT INTO client_users (id, client_id, status, role) VALUES ($1, $2, \'active\', \'manager\')',
      [userId, clientId]
    )
    const entitlement = await observer.query(
      'INSERT INTO page_studio_entitlements (tenant_id, client_id, created_by) VALUES ($1, $2, $3) RETURNING id',
      [tenantId, clientId, ownerId]
    )
    const site = await observer.query(
      `INSERT INTO page_studio_sites (tenant_id, client_id, entitlement_id, name, route, starter_version, created_by)
       VALUES ($1, $2, $3, 'CAS fixture', 'cas-fixture', 'automotive-campaign-v1', $4) RETURNING id`,
      [tenantId, clientId, entitlement.rows[0].id, ownerId]
    )
    scope = { tenantId, clientId, siteId: site.rows[0].id }
  })

  afterEach(async () => {
    // Close only this fixture's sessions before dropping only its generated schema.
    await Promise.all(connections.filter(client => client !== observer).map(client => client.end()))
    if (observer) {
      try {
        await observer.query('ROLLBACK')
        await observer.query('SET search_path TO pg_catalog')
        await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      } finally {
        await observer.end()
      }
    }
  })

  it('allows only one of two lock-contending writers based on the same checkpoint', async () => {
    const base = checkpoint('checkpoint_base', 'a')
    await recordPageStudioCheckpoint(base, { runTransaction: transactionFor(observer) })
    const blocker = await connect()
    const first = await connect()
    const second = await connect()
    const firstPid = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM page_studio_sites WHERE id = $1 FOR UPDATE', [scope.siteId])
    const pending: Array<Promise<Outcome<unknown>>> = []
    try {
      pending.push(capture(commitPageStudioCheckpoint({
        checkpoint: checkpoint('checkpoint_writer_one', 'b'), expectedCheckpointId: base.checkpointId
      }, { runTransaction: transactionFor(first) })))
      await waitForLock(firstPid)
      pending.push(capture(commitPageStudioCheckpoint({
        checkpoint: checkpoint('checkpoint_writer_two', 'c'), expectedCheckpointId: base.checkpointId
      }, { runTransaction: transactionFor(second) })))
      await waitForLock(secondPid)
    } finally {
      await blocker.query('ROLLBACK')
      await Promise.all(pending)
    }
    const outcomes = await Promise.all(pending)
    expect(outcomes.filter(result => result.ok)).toHaveLength(1)
    expect(outcomes.find(result => !result.ok)).toMatchObject({
      ok: false, error: { code: 'CHECKPOINT_BASE_MISMATCH', statusCode: 409 }
    })
    const winner = outcomes.find(result => result.ok) as { ok: true, value: { checkpointId: string } }
    expect(winner.value).toMatchObject({ acknowledged: true, isCurrent: true, currentCheckpointId: winner.value.checkpointId })
    expect(await snapshot()).toEqual({ current_checkpoint_id: winner.value.checkpointId, checkpoints: 2, audits: 2, versions: 0 })
  }, 20_000)

  it('rejects an initial-save null base after a checkpoint already exists without writes', async () => {
    const first = checkpoint('checkpoint_initial', 'a')
    await commitPageStudioCheckpoint({ checkpoint: first, expectedCheckpointId: null }, { runTransaction: transactionFor(observer) })
    const before = await snapshot()
    await expect(commitPageStudioCheckpoint({
      checkpoint: checkpoint('checkpoint_stale_initial', 'b'), expectedCheckpointId: null
    }, { runTransaction: transactionFor(observer) })).rejects.toMatchObject({ code: 'CHECKPOINT_BASE_MISMATCH', statusCode: 409 })
    expect(await snapshot()).toEqual(before)
  })

  it('rolls checkpoint and head changes back when the audit insert fails, allowing an exact retry', async () => {
    const base = checkpoint('checkpoint_rollback_base', 'a')
    const options = { runTransaction: transactionFor(observer) }
    await commitPageStudioCheckpoint({ checkpoint: base, expectedCheckpointId: null }, options)
    const request = {
      checkpoint: checkpoint('checkpoint_audit_failure', 'b'), expectedCheckpointId: base.checkpointId
    }
    const before = await snapshot()
    // The trigger proves both earlier writes happened in this transaction before
    // forcing the real PostgreSQL audit INSERT to fail (no mocked query results).
    await observer.query(`
      CREATE FUNCTION reject_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.resource_id = 'checkpoint_audit_failure' THEN
          IF NOT EXISTS (SELECT 1 FROM page_studio_checkpoints WHERE id = NEW.resource_id)
             OR NOT EXISTS (SELECT 1 FROM page_studio_sites WHERE current_checkpoint_id = NEW.resource_id) THEN
            RAISE EXCEPTION 'Checkpoint or head was not written before audit';
          END IF;
          RAISE EXCEPTION 'Synthetic audit insert failure' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON page_studio_audit_events
        FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit();
    `)
    await expect(commitPageStudioCheckpoint(request, options)).rejects.toMatchObject({
      code: 'P0001', message: 'Synthetic audit insert failure'
    })
    expect(await snapshot()).toEqual(before)
    await observer.query('DROP TRIGGER reject_fixture_audit ON page_studio_audit_events')
    await expect(commitPageStudioCheckpoint(request, options)).resolves.toEqual({
      acknowledged: true, checkpointId: request.checkpoint.checkpointId,
      currentCheckpointId: request.checkpoint.checkpointId, isCurrent: true
    })
    expect(await snapshot()).toEqual({
      current_checkpoint_id: request.checkpoint.checkpointId, checkpoints: 2, audits: 2, versions: 0
    })
  })

  it('deduplicates simultaneous identical requests after both wait on the site lock', async () => {
    const request = { checkpoint: checkpoint('checkpoint_identical', 'a'), expectedCheckpointId: null }
    const blocker = await connect()
    const first = await connect()
    const second = await connect()
    const firstPid = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM page_studio_sites WHERE id = $1 FOR UPDATE', [scope.siteId])
    const pending: Array<Promise<Outcome<unknown>>> = []
    try {
      pending.push(capture(commitPageStudioCheckpoint(request, { runTransaction: transactionFor(first) })))
      await waitForLock(firstPid)
      pending.push(capture(commitPageStudioCheckpoint(request, { runTransaction: transactionFor(second) })))
      await waitForLock(secondPid)
    } finally {
      await blocker.query('ROLLBACK')
      await Promise.all(pending)
    }
    const receipt = {
      ok: true,
      value: {
        acknowledged: true, checkpointId: request.checkpoint.checkpointId,
        currentCheckpointId: request.checkpoint.checkpointId, isCurrent: true
      }
    }
    expect(await Promise.all(pending)).toEqual([receipt, receipt])
    expect(await snapshot()).toEqual({
      current_checkpoint_id: request.checkpoint.checkpointId, checkpoints: 1, audits: 1, versions: 0
    })
  }, 20_000)

  it('rejects an earlier checkpoint identity even when the current content digest is identical', async () => {
    const first = checkpoint('checkpoint_aba_original', 'a')
    const identicalContent = checkpoint('checkpoint_aba_new_identity', 'a')
    const options = { runTransaction: transactionFor(observer) }
    await commitPageStudioCheckpoint({ checkpoint: first, expectedCheckpointId: null }, options)
    await commitPageStudioCheckpoint({ checkpoint: identicalContent, expectedCheckpointId: first.checkpointId }, options)
    const before = await snapshot()
    await expect(commitPageStudioCheckpoint({
      checkpoint: checkpoint('checkpoint_aba_stale', 'b'), expectedCheckpointId: first.checkpointId
    }, options)).rejects.toMatchObject({ code: 'CHECKPOINT_BASE_MISMATCH', statusCode: 409 })
    expect(await snapshot()).toEqual(before)
  })

  it('distinguishes current and superseded exact retries without duplicate rows or head rewind', async () => {
    const first = checkpoint('checkpoint_first', 'a')
    const second = checkpoint('checkpoint_second', 'b')
    const request = { checkpoint: first, expectedCheckpointId: null }
    const options = { runTransaction: transactionFor(observer) }
    const currentReceipt = { acknowledged: true, checkpointId: first.checkpointId, currentCheckpointId: first.checkpointId, isCurrent: true }
    await expect(commitPageStudioCheckpoint(request, options)).resolves.toEqual(currentReceipt)
    await expect(commitPageStudioCheckpoint(request, options)).resolves.toEqual(currentReceipt)
    await commitPageStudioCheckpoint({ checkpoint: second, expectedCheckpointId: first.checkpointId }, options)
    const before = await snapshot()
    await expect(commitPageStudioCheckpoint(request, options)).resolves.toEqual({
      acknowledged: true, checkpointId: first.checkpointId, currentCheckpointId: second.checkpointId, isCurrent: false
    })
    expect(before).toEqual({ current_checkpoint_id: second.checkpointId, checkpoints: 2, audits: 2, versions: 0 })
    expect(await snapshot()).toEqual(before)
  })

  it('rejects changing the expected base or payload under an already committed checkpoint identity', async () => {
    const first = checkpoint('checkpoint_original', 'a')
    const options = { runTransaction: transactionFor(observer) }
    await commitPageStudioCheckpoint({ checkpoint: first, expectedCheckpointId: null }, options)
    const before = await snapshot()
    await expect(commitPageStudioCheckpoint({ checkpoint: first, expectedCheckpointId: first.checkpointId }, options))
      .rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT', statusCode: 409 })
    await expect(commitPageStudioCheckpoint({ checkpoint: { ...first, digest: 'b'.repeat(64) }, expectedCheckpointId: null }, options))
      .rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT', statusCode: 409 })
    expect(await snapshot()).toEqual(before)
  })

  it('does not infer a guarded receipt for an existing legacy checkpoint', async () => {
    const legacy = checkpoint('checkpoint_legacy', 'a')
    const options = { runTransaction: transactionFor(observer) }
    await recordPageStudioCheckpoint(legacy, options)
    const before = await snapshot()
    await expect(commitPageStudioCheckpoint({ checkpoint: legacy, expectedCheckpointId: null }, options))
      .rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT', statusCode: 409 })
    expect(await snapshot()).toEqual(before)
  })

  it('rejects a foreign scope even when checkpoint metadata and expected identity are otherwise valid', async () => {
    const first = checkpoint('checkpoint_scoped', 'a')
    const options = { runTransaction: transactionFor(observer) }
    await commitPageStudioCheckpoint({ checkpoint: first, expectedCheckpointId: null }, options)
    const before = await snapshot()
    const foreign = checkpoint('checkpoint_scoped', 'a', { ...scope, tenantId: 'tenant-other' })
    await expect(commitPageStudioCheckpoint({ checkpoint: foreign, expectedCheckpointId: null }, options))
      .rejects.toMatchObject({ code: 'CONTROL_SCOPE_NOT_FOUND', statusCode: 404 })
    expect(await snapshot()).toEqual(before)
  })

  it.each(['manual', 'ai'] as const)('serializes an AI/manual race when %s acquires the site lock first', async (winnerKind) => {
    const base = checkpoint('checkpoint_race_base', 'a')
    await recordPageStudioCheckpoint(base, { runTransaction: transactionFor(observer) })
    const first = await connect()
    const second = await connect()
    const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const locked = deferred()
    const release = deferred()
    const gatedTransaction = async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>): Promise<T> => {
      return transactionFor(first)(async (db) => {
        let firstQuery = true
        return callback({
          async query<R>(sql: string, params?: unknown[]) {
            const result = await db.query<R>(sql, params)
            if (firstQuery) {
              firstQuery = false
              locked.resolve()
              await release.promise
            }
            return result
          }
        })
      })
    }
    const manualCheckpoint = checkpoint('checkpoint_race_manual', 'b')
    const aiCheckpoint = checkpoint('checkpoint_race_ai', 'c')
    const execute = (kind: 'manual' | 'ai', runTransaction: ReturnType<typeof transactionFor>): Promise<unknown> => kind === 'manual'
      ? commitPageStudioCheckpoint({ checkpoint: manualCheckpoint, expectedCheckpointId: base.checkpointId }, { runTransaction })
      : acceptPageStudioAiProposal({
          checkpoint: aiCheckpoint, baseDigest: base.digest, authorRole: 'client',
          idempotencyKey: 'accept-race-ai', summary: 'Synthetic concurrency proposal'
        }, { runTransaction })
    const winningRequest = capture(execute(winnerKind, gatedTransaction))
    // A rejected request also resolves the gate, so a broken implementation fails promptly.
    void winningRequest.then(() => locked.resolve())
    let losingRequest: Promise<Outcome<unknown>> | undefined
    try {
      await locked.promise
      losingRequest = capture(execute(winnerKind === 'manual' ? 'ai' : 'manual', transactionFor(second)))
      await waitForLock(secondPid)
    } finally {
      release.resolve()
      await Promise.all([winningRequest, losingRequest])
    }
    expect(await winningRequest).toMatchObject({ ok: true })
    expect(await losingRequest).toMatchObject({
      ok: false,
      error: { code: winnerKind === 'manual' ? 'BASE_DIGEST_MISMATCH' : 'CHECKPOINT_BASE_MISMATCH', statusCode: 409 }
    })
    expect(await snapshot()).toEqual({
      current_checkpoint_id: winnerKind === 'manual' ? manualCheckpoint.checkpointId : aiCheckpoint.checkpointId,
      checkpoints: 2, audits: winnerKind === 'manual' ? 2 : 4, versions: winnerKind === 'manual' ? 0 : 1
    })
  }, 20_000)
})
