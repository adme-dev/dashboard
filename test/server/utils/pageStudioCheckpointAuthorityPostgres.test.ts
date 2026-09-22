import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import pg from 'pg'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordPageStudioCheckpoint,
  type PageStudioCheckpointCommitInput, type PageStudioCheckpointCommitReceipt, type PageStudioCheckpointInput,
  type PageStudioControlQueryClient, type PageStudioControlScope
} from '~~/server/utils/pageStudio/controlStore'
import * as controlStore from '~~/server/utils/pageStudio/controlStore'
import { assertPageStudioSessionAuthority } from '~~/server/utils/pageStudio/sessionAuthority'
import { revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { createJwt } from '~~/server/utils/auth'
import type { PageStudioSessionClaims, PageStudioSessionQueryOne } from '~~/server/utils/pageStudio/sessions'

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
    || !/^\/studio_checkpoint_authority(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) {
    throw new Error('Checkpoint authority tests require an explicitly disposable localhost studio_checkpoint_authority database')
  }
}
const userId = '30000000-0000-4000-8000-000000000501'
const clientId = '20000000-0000-4000-8000-000000000501'
const roleId = '60000000-0000-4000-8000-000000000501'
const denied = { code: 'SESSION_AUTHORITY_DENIED', statusCode: 403 }
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

type EditorCheckpointWriter = (
  input: PageStudioCheckpointCommitInput,
  session: PageStudioSessionClaims,
  dependencies: { runTransaction: <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T> }
) => Promise<PageStudioCheckpointCommitReceipt>
const commitEditor = Reflect.get(controlStore, 'commitPageStudioEditorCheckpoint') as EditorCheckpointWriter | undefined

describe.runIf(Boolean(databaseUrl))('Ordinary editor checkpoint authority at the PostgreSQL commit boundary', () => {
  beforeAll(() => {
    expect(commitEditor, 'The public editor needs a session-authorized checkpoint writer').toBeTypeOf('function')
  })
  let observer: pg.Client
  let schema: string
  let scope: PageStudioControlScope
  let claims: PageStudioSessionClaims
  let connections: pg.Client[] = []
  let input: PageStudioCheckpointCommitInput
  let loginToken: string
  const queryOneFresh: PageStudioSessionQueryOne = async (sql, values) => (await observer.query(sql, values)).rows[0] ?? null

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

  async function seedSession(role: 'agency' | 'client') {
    loginToken = role === 'agency' ? await createJwt({ userId, role: 'owner' }) : randomUUID()
    const loginHash = createHash('sha256').update(loginToken).digest('hex')
    const now = Math.floor(Date.now() / 1000)
    claims = { ...scope, userId, role, nonce: randomUUID(), issuedAt: now - 10, expiresAt: now + 600,
      capabilities: ['workspace:preview', 'workspace:checkpoint'] }
    await observer.query('INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL \'1 day\')', [loginHash, userId])
    await observer.query(`INSERT INTO page_studio_login_sessions (role,token_hash,user_id,issued_at,expires_at)
      VALUES($1,$2,$3,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 day')`, [role, loginHash, userId])
    await observer.query(`INSERT INTO page_studio_sessions
      (nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)`,
    [claims.nonce, scope.tenantId, clientId, scope.siteId, userId, role, JSON.stringify(claims.capabilities), claims.issuedAt, claims.expiresAt, loginHash])
    input = { expectedCheckpointId: 'checkpoint_base', checkpoint: checkpoint('checkpoint_editor_save', 'b') }
  }

  beforeEach(async () => {
    connections = []
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
    await recordPageStudioCheckpoint(checkpoint('checkpoint_base', 'a'), { runTransaction: transactionFor(observer) })
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

  describe.each(['agency', 'client'] as const)('%s session', (role) => {
    beforeEach(() => seedSession(role))

    function logoutEvent() {
      const request = new IncomingMessage(new Socket())
      request.method = 'POST'
      request.url = '/test/logout'
      request.headers = { authorization: `Bearer ${loginToken}` }
      return createEvent(request, new ServerResponse(request))
    }

    it('rejects a waiting save after actual logout commits its revocation and foreign-key-backed audit', async () => {
      await assertPageStudioSessionAuthority(claims, 'workspace:checkpoint', { queryOneFresh })
      const before = await snapshot()
      const blocker = await connect()
      const writer = await connect()
      const revoker = await connect()
      loginTransactions.run = transactionFor(revoker)
      await blocker.query('BEGIN')
      // A non-key site mutation allows logout to append its FK-backed audit.
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
      const options = { runTransaction: transactionFor(writer) }
      const save = capture(commitEditor!(input, claims, options))
      try {
        await waitForBlock(writer, blocker)
        await revokePageStudioLoginSession(logoutEvent(), role)
        const afterLogout = await snapshot()
        expect(afterLogout.current_checkpoint_id).toBe(before.current_checkpoint_id)
        expect(afterLogout.current_version_id).toBe(before.current_version_id)
        expect(afterLogout.checkpoints).toEqual(before.checkpoints)
        expect(afterLogout.versions).toEqual(before.versions)
        expect(afterLogout.audits.filter((row: { action: string }) => row.action === 'session.revoked')).toHaveLength(1)
        await blocker.query('COMMIT')
        expect(await save).toMatchObject({ ok: false, error: denied })
        expect(await snapshot()).toEqual(afterLogout)
      } finally {
        await blocker.query('ROLLBACK')
        await save
      }
    })

    it('makes actual logout wait for an authorized save, then records revocation without a foreign-key deadlock', async () => {
      const writer = await connect()
      const revoker = await connect()
      loginTransactions.run = transactionFor(revoker)
      const release = deferred()
      let readyToCommit = false
      const options = { runTransaction: transactionFor(writer, async () => {
        // Gate the mutation commit, not read-only managed-scope discovery.
        const mutation = await writer.query('SELECT id FROM page_studio_checkpoints WHERE id=$1', [input.checkpoint.checkpointId])
        if (!mutation.rows.length) return
        readyToCommit = true
        await release.promise
      }) }
      const save = capture(commitEditor!(input, claims, options))
      let logout: Promise<Outcome<void>> | undefined
      try {
        await expect.poll(() => readyToCommit, { timeout: 1500 }).toBe(true)
        logout = capture(revokePageStudioLoginSession(logoutEvent(), role))
        await waitForBlock(revoker, writer)
        release.resolve()
        expect(await save).toMatchObject({ ok: true, value: { acknowledged: true } })
        expect(await logout).toMatchObject({ ok: true })
        const after = await snapshot()
        expect(after.current_checkpoint_id).toBe(input.checkpoint.checkpointId)
        expect(after.versions).toBeNull()
        expect(after.current_version_id).toBeNull()
        expect(after.audits.filter((row: { action: string }) => row.action === 'session.revoked')).toHaveLength(1)
        await expect(assertPageStudioSessionAuthority(claims, 'workspace:checkpoint', { queryOneFresh })).rejects.toMatchObject(denied)
      } finally {
        release.resolve()
        await save
        await logout
      }
    })

    it('rejects an admitted request revoked while waiting for the site lock without changing durable state', async () => {
      await assertPageStudioSessionAuthority(claims, 'workspace:checkpoint', { queryOneFresh })
      const before = await snapshot()
      const blocker = await connect()
      const writer = await connect()
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR UPDATE', [scope.siteId])
      const options = { runTransaction: transactionFor(writer) }
      const pending = capture(commitEditor!(input, claims, options))
      try {
        await waitForBlock(writer, blocker)
        await observer.query('UPDATE page_studio_sessions SET revoked_at=clock_timestamp() WHERE nonce=$1', [claims.nonce])
        await blocker.query('COMMIT')
        const outcome = await pending
        expect(outcome).toMatchObject({ ok: false, error: denied })
        expect(await snapshot()).toEqual(before)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })

    it('rejects token expiry reached during a lock wait using current time rather than transaction start', async () => {
      claims.expiresAt = Math.floor(Date.now() / 1000) + 2
      await observer.query('UPDATE page_studio_sessions SET expires_at=to_timestamp($1) WHERE nonce=$2', [claims.expiresAt, claims.nonce])
      await assertPageStudioSessionAuthority(claims, 'workspace:checkpoint', { queryOneFresh })
      const before = await snapshot()
      const blocker = await connect()
      const writer = await connect()
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR UPDATE', [scope.siteId])
      const options = { runTransaction: transactionFor(writer) }
      const pending = capture(commitEditor!(input, claims, options))
      try {
        await waitForBlock(writer, blocker)
        await expect.poll(async () => (await observer.query('SELECT clock_timestamp()>to_timestamp($1) AS expired', [claims.expiresAt])).rows[0].expired,
          { timeout: 3000, interval: 20 }).toBe(true)
        await blocker.query('COMMIT')
        expect(await pending).toMatchObject({ ok: false, error: denied })
        expect(await snapshot()).toEqual(before)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })

    it('allows an ordinary checkpoint with no model capability and zero AI budget without creating a version', async () => {
      await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=0')
      const before = await snapshot()
      const writer = await connect()
      const options = { runTransaction: transactionFor(writer) }
      const receipt = await commitEditor!(input, claims, options)
      expect(receipt).toMatchObject({ acknowledged: true, checkpointId: input.checkpoint.checkpointId, isCurrent: true })
      const after = await snapshot()
      expect(after.checkpoints).toHaveLength(before.checkpoints.length + 1)
      expect(after.versions).toBeNull()
      expect(after.current_version_id).toBeNull()
      const newAudit = after.audits.filter((row: { id: string }) => !before.audits.some((old: { id: string }) => old.id === row.id))
      expect(newAudit).toHaveLength(1)
      expect(newAudit[0]).toMatchObject({ action: 'workspace.checkpointed', resource_type: 'checkpoint', resource_id: input.checkpoint.checkpointId })
    })

    it.each(['tenantId', 'clientId', 'siteId', 'userId', 'role'] as const)('denies a mismatched session %s without durable changes', async (field) => {
      const before = await snapshot()
      const foreignClaims = { ...claims, [field]: field === 'role' ? (role === 'agency' ? 'client' : 'agency') : randomUUID() }
      const writer = await connect()
      await expect(commitEditor!(input, foreignClaims, { runTransaction: transactionFor(writer) })).rejects.toMatchObject({ statusCode: 403 })
      expect(await snapshot()).toEqual(before)
    })

    it('denies missing workspace checkpoint capability without durable changes', async () => {
      claims.capabilities = ['workspace:preview']
      await observer.query('UPDATE page_studio_sessions SET capabilities=$1::jsonb WHERE nonce=$2', [JSON.stringify(claims.capabilities), claims.nonce])
      const before = await snapshot()
      const writer = await connect()
      await expect(commitEditor!(input, claims, { runTransaction: transactionFor(writer) })).rejects.toMatchObject({ statusCode: 403 })
      expect(await snapshot()).toEqual(before)
    })

    it('denies a missing session before any durable mutation', async () => {
      const before = await snapshot()
      const writer = await connect()
      await expect(commitEditor!(input, undefined as unknown as PageStudioSessionClaims, { runTransaction: transactionFor(writer) })).rejects.toMatchObject({ statusCode: 403 })
      expect(await snapshot()).toEqual(before)
    })

    it('preserves authorized replay idempotency but rejects replay after revocation without new audit or mutation', async () => {
      const writer = await connect()
      const options = { runTransaction: transactionFor(writer) }
      const receipt = await commitEditor!(input, claims, options)
      const before = await snapshot()
      await expect(commitEditor!(input, claims, options)).resolves.toEqual(receipt)
      expect(await snapshot()).toEqual(before)
      await observer.query('UPDATE page_studio_sessions SET revoked_at=clock_timestamp() WHERE nonce=$1', [claims.nonce])
      await expect(commitEditor!(input, claims, options)).rejects.toMatchObject(denied)
      expect(await snapshot()).toEqual(before)
    })
  })
})
