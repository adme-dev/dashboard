import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordPageStudioCheckpoint, type PageStudioCheckpointInput, type PageStudioControlQueryClient, type PageStudioControlScope } from '~~/server/utils/pageStudio/controlStore'
import { mutatePageStudioHistory } from '~~/server/utils/pageStudio/draftHistory'
import { revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { createJwt } from '~~/server/utils/auth'
import fixture from '../../fixtures/pageStudio/history-manifest.json'

// Every production query runs against the disposable database. An accidental
// fallback to the application's connection fails instead of touching real data.
const loginTransactions = vi.hoisted(() => ({
  run: undefined as undefined | (<T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>)
}))
vi.mock('~~/server/utils/db', () => ({
  transaction: <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => {
    if (!loginTransactions.run) throw new Error('Inject the disposable transaction')
    return loginTransactions.run(callback)
  },
  queryOneFresh: () => { throw new Error('Authority must use the acceptance transaction') },
  queryOne: () => { throw new Error('Unexpected application database access') },
  queryRows: () => { throw new Error('Unexpected application database access') },
  execute: () => { throw new Error('Unexpected application database access') }
}))

const databaseUrl = process.env.PAGE_STUDIO_SESSION_AUTHORITY_DATABASE_TEST_URL
  ?? process.env.PAGE_STUDIO_AUTHORITY_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/studio_history_authority(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) {
    throw new Error('History authority tests require an explicitly disposable localhost studio_history_authority database')
  }
}
const userId = '30000000-0000-4000-8000-000000000501'
const clientId = '20000000-0000-4000-8000-000000000501'
const roleId = '60000000-0000-4000-8000-000000000501'
const denied = { statusCode: 403 }
const migrationSql = [402, 404, 420, 422, 425].map(number => readFileSync(new URL({
  402: '../../../server/database/migrations/402_page_studio_control_plane.sql',
  404: '../../../server/database/migrations/404_page_studio_documents.sql',
  420: '../../../server/database/migrations/420_page_studio_login_sessions.sql',
  422: '../../../server/database/migrations/422_page_studio_cms_visibility.sql',
  425: '../../../server/database/migrations/425_page_studio_cms_authoring_scope.sql'
}[number]!, import.meta.url), 'utf8'))
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
type Outcome<T> = { ok: true, value: T } | { ok: false, error: unknown }
const capture = <T>(promise: Promise<T>): Promise<Outcome<T>> => promise.then(
  value => ({ ok: true, value }), error => ({ ok: false, error })
)

describe.runIf(Boolean(databaseUrl))('Native draft history authority at the PostgreSQL commit boundary', () => {
  let observer: pg.Client
  let schema: string
  let scope: PageStudioControlScope
  let connections: pg.Client[] = []
  let loginToken: string
  const blobs = new Map<string, string>()
  let beforeWrite: (() => Promise<void>) | undefined
  const bucket = {
    get: async (key: string) => blobs.has(key) ? { body: new Response(blobs.get(key)).body! } : null,
    put: async (key: string, body: string) => {
      await beforeWrite?.()
      blobs.set(key, body)
      return { etag: 'history-fixture-etag' }
    }
  }

  async function connect() {
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connections.push(db)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('SET statement_timeout TO \'6s\'')
    return db
  }

  function transactionFor(db: pg.Client, beforeCommit?: () => Promise<void>) {
    return async <T>(callback: (client: PageStudioControlQueryClient) => Promise<T>): Promise<T> => {
      await db.query('BEGIN')
      try {
        const result = await callback(db as unknown as PageStudioControlQueryClient)
        await beforeCommit?.()
        await db.query('COMMIT')
        return result
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      }
    }
  }

  function checkpoint(id: string, character: string): PageStudioCheckpointInput {
    return { checkpointId: id, scope, userId, digest: character.repeat(64), etag: `etag-${id}`,
      objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${id}.json`,
      createdAt: '2026-09-18T00:00:00.000Z' }
  }

  async function snapshot() {
    return (await observer.query(`SELECT current_checkpoint_id, current_version_id,
      (SELECT jsonb_agg(to_jsonb(checkpoint) ORDER BY id) FROM page_studio_checkpoints checkpoint) AS checkpoints,
      (SELECT jsonb_agg(to_jsonb(version) ORDER BY id) FROM page_studio_versions version) AS versions,
      (SELECT jsonb_agg(to_jsonb(audit) ORDER BY id) FROM page_studio_audit_events audit) AS audits
      FROM page_studio_sites WHERE id=$1`, [scope.siteId])).rows[0]
  }

  async function waitForBlock(waiter: pg.Client, blocker: pg.Client) {
    // Read backend IDs before callers start waiting queries; pg exposes the
    // connected process ID without queuing another query behind the lock wait.
    const waiterPid = (waiter as unknown as { processID: number }).processID
    const blockerPid = (blocker as unknown as { processID: number }).processID
    await expect.poll(async () => (await observer.query<{ blocked: boolean }>(
      'SELECT $2=ANY(pg_blocking_pids($1)) AS blocked', [waiterPid, blockerPid]
    )).rows[0]!.blocked, { timeout: 1500, interval: 20 }).toBe(true)
  }

  async function seedLogin(role: 'agency' | 'client') {
    loginToken = role === 'agency' ? await createJwt({ userId, role: 'owner' }) : randomUUID()
    if (role === 'client') await observer.query('INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL \'1 day\')',
      [createHash('sha256').update(loginToken).digest('hex'), userId])
  }

  beforeEach(async () => {
    connections = []
    blobs.clear()
    beforeWrite = undefined
    schema = `checkpoint_authority_${randomUUID().replaceAll('-', '')}`
    observer = await connect()
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query(`
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,
        role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
    `)
    await observer.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    for (const migration of migrationSql) await observer.query(migration)
    await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await observer.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'manager\')', [userId, clientId])
    const entitlement = (await observer.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,created_by)
      VALUES('checkpoint-authority',$1,$2) RETURNING id`, [clientId, userId])).rows[0]
    const site = (await observer.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,created_by)
      VALUES('checkpoint-authority',$1,$2,'Checkpoint authority fixture','checkpoint-authority','fixture-v1',$3) RETURNING id`, [clientId, entitlement.id, userId])).rows[0]
    scope = { tenantId: 'checkpoint-authority', clientId, siteId: site.id }
    await observer.query(`INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role)
      VALUES($1,$2,$3,$4,'editor')`, [scope.tenantId, clientId, scope.siteId, userId])
    const manifest = { ...fixture, id: scope.siteId }
    const canonical = (v: unknown): string => v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)
    const digest = createHash('sha256').update(canonical(manifest)).digest('hex')
    for (const id of ['checkpoint_old', 'checkpoint_base']) {
      const saved = { ...checkpoint(id, 'a'), digest }
      blobs.set(saved.objectKey, JSON.stringify({ schemaVersion: 1, ...saved, manifest }))
      await recordPageStudioCheckpoint(saved, { runTransaction: transactionFor(observer) })
    }
  })

  afterEach(async () => {
    loginTransactions.run = undefined
    await Promise.all(connections.filter(db => db !== observer).map(db => db.end()))
    if (!observer) return
    try {
      await observer.query('ROLLBACK')
      await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await observer.end() }
  })

  describe.each(['agency', 'client'] as const)('%s native login', (role) => {
    beforeEach(() => seedLogin(role))
    function event() {
      const request = new IncomingMessage(new Socket())
      request.method = 'POST'
      request.url = '/test/history'
      request.headers = { authorization: `Bearer ${loginToken}` }
      return createEvent(request, new ServerResponse(request))
    }
    function request(action: 'restore' | 'name' = 'restore') {
      const actor = role === 'agency'
        ? { role, actorId: userId, tenantId: scope.tenantId, canEdit: true }
        : { role, actorId: userId, clientId }
      const body = action === 'restore'
        ? { action, checkpointId: 'checkpoint_old', expectedCheckpointId: 'checkpoint_base', requestId: randomUUID() }
        : { action, name: 'Native history snapshot', expectedCheckpointId: 'checkpoint_base', requestId: randomUUID() }
      return { actor, event: event(), siteId: scope.siteId, bucket, body }
    }

    it('denies a missing native event without writing', async () => {
      const before = await snapshot()
      const input = { ...request(), event: undefined }
      await expect(mutatePageStudioHistory(input, { runTransaction: transactionFor(await connect()) })).rejects.toMatchObject({ statusCode: 401 })
      expect(await snapshot()).toEqual(before)
    })

    it.each(['restore', 'name'] as const)('denies waiting %s after actual native logout, with no editor grant', async (action) => {
      const before = await snapshot()
      const blocker = await connect(), writer = await connect(), revoker = await connect()
      loginTransactions.run = transactionFor(revoker)
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
      const pending = capture(mutatePageStudioHistory(request(action), { runTransaction: transactionFor(writer) }))
      try {
        await waitForBlock(writer, blocker)
        await revokePageStudioLoginSession(event(), role)
        await blocker.query('COMMIT')
        expect(await pending).toMatchObject({ ok: false, error: { statusCode: 401 } })
        expect(await snapshot()).toEqual(before)
        expect((await observer.query('SELECT * FROM page_studio_sessions')).rowCount).toBe(0)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })

    it.each(['restore', 'name'] as const)('allows %s without an editor grant or AI allowance and preserves replay idempotency', async (action) => {
      await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=0')
      const input = request(action), writer = await connect()
      const options = { runTransaction: transactionFor(writer) }
      const receipt = await mutatePageStudioHistory(input, options)
      expect(receipt.isCurrent).toBe(true)
      const after = await snapshot()
      expect(await mutatePageStudioHistory(input, options)).toEqual(receipt)
      expect(await snapshot()).toEqual(after)
      expect((await observer.query('SELECT * FROM page_studio_sessions')).rowCount).toBe(0)
      expect((await observer.query('SELECT * FROM page_studio_login_sessions WHERE role=$1', [role])).rowCount).toBe(1)
      if (action === 'name') {
        expect(after.current_checkpoint_id).toBe('checkpoint_base')
        expect(after.versions).toHaveLength(1)
      } else {
        expect(after.current_checkpoint_id).toMatch(/^restore_/)
        expect(after.checkpoints).toHaveLength(3)
      }
      loginTransactions.run = transactionFor(await connect())
      await revokePageStudioLoginSession(event(), role)
      await expect(mutatePageStudioHistory(input, options)).rejects.toMatchObject({ statusCode: 401 })
      expect(await snapshot()).toEqual(after)
    })

    it.each(['restore', 'name'] as const)('holds native login authority until %s commits, then lets logout finish', async (action) => {
      const writer = await connect(), revoker = await connect()
      loginTransactions.run = transactionFor(revoker)
      const release = deferred()
      let ready = false
      const input = request(action)
      const pending = capture(mutatePageStudioHistory(input, { runTransaction: transactionFor(writer, async () => {
        // Ignore read-only managed-scope discovery: wait at the actual history
        // mutation commit, identified by its transaction-local durable audit.
        const mutation = await writer.query('SELECT id FROM page_studio_audit_events WHERE idempotency_key=$1 AND action=\'draft.history.saved\'', [`history:${role}:${userId}:${input.body.requestId}`])
        if (!mutation.rows.length) return
        ready = true
        await release.promise
      }) }))
      let logout: Promise<Outcome<void>> | undefined
      try {
        await expect.poll(() => ready, { timeout: 1500 }).toBe(true)
        logout = capture(revokePageStudioLoginSession(event(), role))
        await waitForBlock(revoker, writer)
        release.resolve()
        expect(await pending).toMatchObject({ ok: true, value: { isCurrent: true } })
        expect(await logout).toMatchObject({ ok: true })
        const after = await snapshot()
        await expect(mutatePageStudioHistory(input, { runTransaction: transactionFor(writer) })).rejects.toMatchObject({ statusCode: 401 })
        expect(await snapshot()).toEqual(after)
      } finally {
        release.resolve()
        await pending
        await logout
      }
    })

    it.each(['inactive-user', 'permission-loss'] as const)('rejects a waiting write after %s despite the admitted actor', async (change) => {
      const before = await snapshot()
      const blocker = await connect(), writer = await connect()
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
      const pending = capture(mutatePageStudioHistory(request(), { runTransaction: transactionFor(writer) }))
      try {
        await waitForBlock(writer, blocker)
        if (change === 'inactive-user') {
          await observer.query(role === 'agency' ? 'UPDATE team_members SET is_active=FALSE' : 'UPDATE client_users SET status=\'disabled\'')
        } else {
          await observer.query(role === 'agency' ? 'DELETE FROM role_permission_groups' : 'UPDATE page_studio_site_memberships SET role=\'viewer\'')
        }
        await blocker.query('COMMIT')
        expect(await pending).toMatchObject({ ok: false, error: denied })
        expect(await snapshot()).toEqual(before)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })

    it('rejects an actor whose ID differs from the native credential', async () => {
      const input = request('name')
      input.actor.actorId = randomUUID()
      const before = await snapshot()
      await expect(mutatePageStudioHistory(input, { runTransaction: transactionFor(await connect()) })).rejects.toMatchObject({ statusCode: role === 'agency' ? 401 : 403 })
      expect(await snapshot()).toEqual(before)
    })

    it.each(['site-wait', 'blob-write'] as const)('rejects entitlement expiry during %s using the final wall clock', async (stage) => {
      const expires = (await observer.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'250 milliseconds\' RETURNING effective_until')).rows[0].effective_until
      const before = await snapshot()
      const awaitExpiry = async () => {
        await expect.poll(async () => (await observer.query('SELECT clock_timestamp()>$1 AS expired', [expires])).rows[0].expired,
          { timeout: 1500, interval: 15 }).toBe(true)
      }
      const writer = await connect()
      if (stage === 'blob-write') {
        beforeWrite = awaitExpiry
        await expect(mutatePageStudioHistory(request(), { runTransaction: transactionFor(writer) })).rejects.toMatchObject(denied)
      } else {
        const blocker = await connect()
        await blocker.query('BEGIN')
        await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
        const pending = capture(mutatePageStudioHistory(request(), { runTransaction: transactionFor(writer) }))
        try {
          await waitForBlock(writer, blocker)
          await awaitExpiry()
          await blocker.query('COMMIT')
          expect(await pending).toMatchObject({ ok: false, error: denied })
        } finally {
          await blocker.query('ROLLBACK')
          await pending
        }
      }
      expect(await snapshot()).toEqual(before)
    })

    it('rejects native parent expiry during durable restore storage', async () => {
      // Establish the native login through a valid name operation; no editor launch.
      await mutatePageStudioHistory(request('name'), { runTransaction: transactionFor(await connect()) })
      const expires = (await observer.query('UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+INTERVAL \'250 milliseconds\' RETURNING expires_at')).rows[0].expires_at
      const before = await snapshot()
      beforeWrite = async () => {
        await expect.poll(async () => (await observer.query('SELECT clock_timestamp()>$1 AS expired', [expires])).rows[0].expired,
          { timeout: 1500, interval: 15 }).toBe(true)
      }
      await expect(mutatePageStudioHistory(request(), { runTransaction: transactionFor(await connect()) })).rejects.toMatchObject(denied)
      expect(await snapshot()).toEqual(before)
    })

    it('rejects current native account invalidation after admission', async () => {
      const before = await snapshot()
      if (role === 'agency') await observer.query('UPDATE team_members SET sessions_invalidated_at=clock_timestamp()+INTERVAL \'1 second\'')
      else await observer.query('UPDATE client_users SET client_id=$1', [randomUUID()])
      await expect(mutatePageStudioHistory(request(), { runTransaction: transactionFor(await connect()) })).rejects.toMatchObject(denied)
      expect(await snapshot()).toEqual(before)
    })

    it('holds current native actor permission rows through the restore', async () => {
      const contender = await connect()
      await contender.query('SET lock_timeout=\'100ms\'')
      beforeWrite = async () => {
        await expect(contender.query(role === 'agency'
          ? 'DELETE FROM role_permission_groups'
          : 'UPDATE client_users SET status=\'disabled\''))
          .rejects.toMatchObject({ code: '55P03' })
      }
      await expect(mutatePageStudioHistory(request(), { runTransaction: transactionFor(await connect()) })).resolves.toMatchObject({ isCurrent: true })
    })

    if (role === 'client') it('rejects native portal session expiry during durable storage', async () => {
      const expires = (await observer.query('UPDATE client_sessions SET expires_at=clock_timestamp()+INTERVAL \'250 milliseconds\' RETURNING expires_at')).rows[0].expires_at
      const before = await snapshot()
      beforeWrite = async () => {
        await expect.poll(async () => (await observer.query('SELECT clock_timestamp()>$1 AS expired', [expires])).rows[0].expired,
          { timeout: 1500, interval: 15 }).toBe(true)
      }
      await expect(mutatePageStudioHistory(request(), { runTransaction: transactionFor(await connect()) })).rejects.toMatchObject(denied)
      expect(await snapshot()).toEqual(before)
    })
  })
})
