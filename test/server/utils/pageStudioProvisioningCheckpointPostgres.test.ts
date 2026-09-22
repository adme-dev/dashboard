import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizePageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningAuthority'
import { commitPageStudioProvisioningCheckpoint } from '~~/server/utils/pageStudio/provisioningCheckpoint'
import { createPageStudioProvisioningJob } from '~~/server/utils/pageStudio/provisioningBinding'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession, revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { createJwt } from '~~/server/utils/auth'
import { recordPageStudioCheckpoint, type PageStudioCheckpointCommitInput, type PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'

// Only the connection adapter is substituted: all SQL, authentication, login
// binding and logout behavior execute against real disposable PostgreSQL.
const database = vi.hoisted(() => ({
  fresh: vi.fn(),
  transaction: undefined as undefined | (<T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>)
}))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: database.fresh,
  transaction: <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => {
    if (!database.transaction) throw new Error('Disposable transaction must be installed')
    return database.transaction(callback)
  },
  queryOne: () => { throw new Error('Unexpected application database access') },
  queryRows: () => { throw new Error('Unexpected application database access') },
  execute: () => { throw new Error('Unexpected application database access') }
}))
const databaseUrl = process.env.PAGE_STUDIO_PROVISIONING_COMMIT_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/studio_provisioning_commit(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) {
    throw new Error('Provisioning checkpoint tests require an explicitly disposable localhost studio_provisioning_commit database')
  }
}
const migrations = ['402_page_studio_control_plane.sql', '404_page_studio_documents.sql', '415_page_studio_setup_proposals.sql', '420_page_studio_login_sessions.sql', '422_page_studio_cms_visibility.sql', '425_page_studio_cms_authoring_scope.sql']
  .map(name => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8'))
const userId = '30000000-0000-4000-8000-000000000601'
const clientId = '20000000-0000-4000-8000-000000000601'
const roleId = '60000000-0000-4000-8000-000000000601'
const denied = { code: 'PROVISIONING_AUTHORITY_DENIED', statusCode: 403 }
const plan = createPageStudioSetupProposal({ businessName: 'Login Flowers', starterVersion: 'floristry-v1', setupSource: 'template' })

function event(token: string) {
  const request = new IncomingMessage(new Socket())
  request.method = 'POST'
  request.url = '/test/provisioning'
  request.headers = { authorization: `Bearer ${token}` }
  return createEvent(request, new ServerResponse(request))
}

describe.runIf(Boolean(databaseUrl))('Provisioning checkpoint commit authority on real PostgreSQL', () => {
  let db: pg.Client
  let connections: pg.Client[] = []
  let input: PageStudioCheckpointCommitInput & { provisioning: { requestKey: string, scope: typeof scope } }
  let schema: string
  let loginToken: string
  let loginHash: string
  let saved: ReturnType<typeof createPageStudioProvisioningJob>
  let scope: { tenantId: string, clientId: string, businessId: string, siteId: string, environment: 'staging' }
  async function connect() {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connections.push(client)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    await client.query('SET statement_timeout=\'6s\'')
    return client
  }
  function transactionFor(client: pg.Client, beforeCommit?: () => Promise<void>, afterQuery?: (sql: string) => Promise<void>) {
    return async <T>(callback: (client: PageStudioControlQueryClient) => Promise<T>): Promise<T> => {
      await client.query('BEGIN')
      try {
        const instrumented: PageStudioControlQueryClient = afterQuery
          ? {
              async query(sql, values) {
                const result = await client.query(sql, values)
                await afterQuery(sql)
                return result
              }
            }
          : client
        const result = await callback(instrumented)
        await beforeCommit?.()
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  }
  const transaction = <T>(callback: (client: PageStudioControlQueryClient) => Promise<T>) => transactionFor(db)(callback)
  const capture = <T>(promise: Promise<T>) => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }))
  async function snapshot() {
    return (await db.query(`SELECT current_checkpoint_id,current_version_id,
      (SELECT jsonb_agg(to_jsonb(checkpoint) ORDER BY id) FROM page_studio_checkpoints checkpoint) AS checkpoints,
      (SELECT jsonb_agg(to_jsonb(version) ORDER BY id) FROM page_studio_versions version) AS versions,
      (SELECT jsonb_agg(to_jsonb(audit) ORDER BY id) FROM page_studio_audit_events audit) AS audits
      FROM page_studio_sites WHERE id=$1`, [scope.siteId])).rows[0]
  }
  async function waitForBlock(waiter: pg.Client, blocker: pg.Client) {
    const waiterPid = (waiter as unknown as { processID: number }).processID
    const blockerPid = (blocker as unknown as { processID: number }).processID
    await expect.poll(async () => (await db.query('SELECT $2=ANY(pg_blocking_pids($1)) AS blocked', [waiterPid, blockerPid])).rows[0].blocked,
      { timeout: 1500, interval: 15 }).toBe(true)
  }
  const commit = (value: typeof input, dependencies: { runTransaction: ReturnType<typeof transactionFor> }) =>
    commitPageStudioProvisioningCheckpoint(value, { createProvisioning: async job => job, readProvisioning: async () => saved }, 'staging', dependencies)
  const authorize = () => authorizePageStudioProvisioning({ createProvisioning: async job => job, readProvisioning: async () => saved },
    { requestKey: saved.requestKey, scope }, 'staging')

  beforeEach(async () => {
    connections = []
    schema = `provisioning_commit_${randomUUID().replaceAll('-', '')}`
    db = await connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('SET statement_timeout=\'5s\'')
    await db.query(`
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,
        role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
    `)
    await db.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    for (const sql of migrations) await db.query(sql)
    await db.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await db.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'manager\')', [userId, clientId])
    const entitlement = (await db.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,created_by,plan_metadata)
      VALUES('provisioning-login',$1,$2,$3) RETURNING id`, [clientId, userId, { allowedModules: plan.modules }])).rows[0]
    const site = (await db.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,created_by)
      VALUES('provisioning-login',$1,$2,'Native login fixture','native-login','floristry-v1',$3) RETURNING id`, [clientId, entitlement.id, userId])).rows[0]
    scope = { tenantId: 'provisioning-login', clientId, businessId: clientId, siteId: site.id, environment: 'staging' }
    await db.query(`INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role)
      VALUES($1,$2,$3,$4,'editor')`, [scope.tenantId, clientId, scope.siteId, userId])
    await db.query(`INSERT INTO page_studio_setup_proposals(tenant_id,client_id,site_id,revision,status,source,plan,created_by)
      VALUES($1,$2,$3,1,'accepted','template',$4,$5)`, [scope.tenantId, clientId, scope.siteId, plan, userId])
    database.fresh.mockImplementation(async (sql, values) => {
      try {
        return (await db.query(sql, values)).rows[0] ?? null
      } catch (error) {
        const detail = error as { code?: string, message?: string }
        console.error('Disposable provisioning SQL failed', { code: detail.code, message: detail.message })
        throw error
      }
    })
    database.transaction = transaction
  })

  afterEach(async () => {
    database.fresh.mockReset()
    database.transaction = undefined
    await Promise.all(connections.filter(client => client !== db).map(client => client.end()))
    if (!db) return
    try {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })

  describe.each(['agency', 'client'] as const)('%s actor', (role) => {
    async function bind(token?: string) {
      const credential = token ?? (role === 'agency' ? await createJwt({ userId, role: 'owner' }) : randomUUID())
      const hash = createHash('sha256').update(credential).digest('hex')
      if (role === 'client') await db.query('INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL \'1 day\')', [hash, userId])
      await transaction(async (client) => {
        const login = await resolvePageStudioLoginSession(client, event(credential), role, userId)
        await bindPageStudioLoginSession(client, login)
      })
      return { credential, hash }
    }
    beforeEach(async () => {
      const login = await bind()
      loginToken = login.credential
      loginHash = login.hash
      saved = createPageStudioProvisioningJob({ initiatingUserId: userId, initiatingLoginSessionHash: loginHash, initiatingActorKind: role === 'agency' ? 'agency-user' : 'client-user',
        requestKey: `page-studio-${scope.siteId}-1`, scope, plan, revision: 1, source: 'template', now: new Date().toISOString() })
      saved = { ...saved, phase: 'content-seeded', resources: { contentBinding: 'fixture-content', database: 'fixture-database', site: scope.siteId } }
      const checkpointId = `setup_${'a'.repeat(64)}`
      input = { expectedCheckpointId: null, provisioning: { requestKey: saved.requestKey, scope },
        checkpoint: { checkpointId, scope: { tenantId: scope.tenantId, clientId, siteId: scope.siteId }, userId,
          digest: 'b'.repeat(64), etag: 'fixture-etag', createdAt: new Date().toISOString(),
          objectKey: `tenants/${scope.tenantId}/clients/${clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json` } }
    })

    it('denies a checkpoint waiting on its site after actual logout commits', async () => {
      await authorize()
      const before = await snapshot()
      const blocker = await connect(), writer = await connect(), revoker = await connect()
      database.transaction = transactionFor(revoker)
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
      const pending = capture(commit(input, { runTransaction: transactionFor(writer) }))
      try {
        await waitForBlock(writer, blocker)
        await revokePageStudioLoginSession(event(loginToken), role)
        await blocker.query('COMMIT')
        expect(await pending).toMatchObject({ ok: false, error: denied })
        expect(await snapshot()).toEqual(before)
        expect((await db.query('SELECT * FROM page_studio_sessions')).rowCount).toBe(0)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })

    it('commits an empty-head seed without an editor grant and replays without duplicate audit', async () => {
      const writer = await connect(), options = { runTransaction: transactionFor(writer) }
      const receipt = await commit(input, options)
      expect(receipt).toMatchObject({ acknowledged: true, checkpointId: input.checkpoint.checkpointId, isCurrent: true })
      const after = await snapshot()
      expect(after.checkpoints).toHaveLength(1)
      expect(after.versions).toBeNull()
      expect(after.audits).toHaveLength(1)
      expect(after.audits[0]).toMatchObject({ action: 'workspace.checkpointed', actor_id: 'page-studio', metadata: { authorId: userId } })
      expect(await commit(input, options)).toEqual(receipt)
      expect(await snapshot()).toEqual(after)
      expect((await db.query('SELECT * FROM page_studio_sessions')).rowCount).toBe(0)
      database.transaction = transactionFor(await connect())
      await revokePageStudioLoginSession(event(loginToken), role)
      await expect(commit(input, options)).rejects.toMatchObject(denied)
      expect(await snapshot()).toEqual(after)
    })

    it('holds native login authority until commit and then allows logout', async () => {
      const writer = await connect(), revoker = await connect()
      database.transaction = transactionFor(revoker)
      let release!: () => void, ready = false
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const pending = capture(commit(input, { runTransaction: transactionFor(writer, async () => {
        ready = true
        await gate
      }) }))
      let logout: ReturnType<typeof capture<void>> | undefined
      try {
        await expect.poll(() => ready, { timeout: 1500 }).toBe(true)
        logout = capture(revokePageStudioLoginSession(event(loginToken), role))
        await waitForBlock(revoker, writer)
        release()
        expect(await pending).toMatchObject({ ok: true, value: { acknowledged: true } })
        expect(await logout).toMatchObject({ ok: true })
        expect((await snapshot()).current_checkpoint_id).toBe(input.checkpoint.checkpointId)
        await expect(commit(input, { runTransaction: transactionFor(writer) })).rejects.toMatchObject(denied)
      } finally {
        release()
        await pending
        await logout
      }
    })

    it('holds the current permission, proposal and entitlement rows until commit', async () => {
      const contender = await connect()
      await contender.query('SET lock_timeout=\'100ms\'')
      await commit(input, { runTransaction: transactionFor(await connect(), async () => {
        await expect(contender.query(role === 'agency' ? 'DELETE FROM role_permission_groups' : 'UPDATE page_studio_site_memberships SET role=\'viewer\''))
          .rejects.toMatchObject({ code: '55P03' })
        await expect(contender.query('UPDATE page_studio_setup_proposals SET status=\'rejected\''))
          .rejects.toMatchObject({ code: '55P03' })
        await expect(contender.query('UPDATE page_studio_entitlements SET status=\'suspended\''))
          .rejects.toMatchObject({ code: '55P03' })
      }) })
    })

    it.each(['proposal', 'permission', 'entitlement'] as const)('rejects changed %s authority while waiting on site', async (change) => {
      const before = await snapshot()
      const blocker = await connect(), writer = await connect()
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
      const pending = capture(commit(input, { runTransaction: transactionFor(writer) }))
      try {
        await waitForBlock(writer, blocker)
        if (change === 'proposal') await db.query('UPDATE page_studio_setup_proposals SET status=\'rejected\'')
        if (change === 'permission') await db.query(role === 'agency' ? 'DELETE FROM role_permission_groups' : 'UPDATE page_studio_site_memberships SET role=\'viewer\'')
        if (change === 'entitlement') await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
        await blocker.query('COMMIT')
        expect(await pending).toMatchObject({ ok: false, error: denied })
        expect(await snapshot()).toEqual(before)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })

    it.each(['parent', 'entitlement'] as const)('rejects wall-clock %s expiry reached during the site lock wait', async (target) => {
      const expiry = (await db.query(target === 'parent'
        ? 'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+INTERVAL \'300 milliseconds\' RETURNING expires_at AS expiry'
        : 'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'300 milliseconds\' RETURNING effective_until AS expiry')).rows[0].expiry
      const before = await snapshot()
      const blocker = await connect(), writer = await connect()
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [scope.siteId])
      const pending = capture(commit(input, { runTransaction: transactionFor(writer) }))
      try {
        await waitForBlock(writer, blocker)
        await expect.poll(async () => (await db.query('SELECT clock_timestamp()>$1 AS expired', [expiry])).rows[0].expired,
          { timeout: 1500, interval: 15 }).toBe(true)
        await blocker.query('COMMIT')
        expect(await pending).toMatchObject({ ok: false, error: denied })
        expect(await snapshot()).toEqual(before)
      } finally {
        await blocker.query('ROLLBACK')
        await pending
      }
    })

    it.each(['parent', 'entitlement', ...(role === 'client' ? ['native'] : [])])('rolls back inserted metadata if %s expires before final authority check', async (target) => {
      const expiry = (await db.query(target === 'parent'
        ? 'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+INTERVAL \'300 milliseconds\' RETURNING expires_at AS expiry'
        : target === 'native'
          ? 'UPDATE client_sessions SET expires_at=clock_timestamp()+INTERVAL \'300 milliseconds\' RETURNING expires_at AS expiry'
          : 'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'300 milliseconds\' RETURNING effective_until AS expiry')).rows[0].expiry
      const before = await snapshot()
      let inserted = false
      const options = { runTransaction: transactionFor(await connect(), undefined, async (sql) => {
        // Only pause after a REAL successful INSERT on the real transaction;
        // never replace an authority query or fabricate any database result.
        if (!sql.includes('INSERT INTO page_studio_checkpoints')) return
        inserted = true
        await expect.poll(async () => (await db.query('SELECT clock_timestamp()>$1 AS expired', [expiry])).rows[0].expired,
          { timeout: 1500, interval: 15 }).toBe(true)
      }) }
      await expect(commit(input, options)).rejects.toMatchObject(denied)
      expect(inserted, 'Must have passed initial authority and attempted the real metadata insertion').toBe(true)
      expect(await snapshot()).toEqual(before)
    })

    it('rechecks parent expiry before returning an existing idempotent receipt', async () => {
      await commit(input, { runTransaction: transactionFor(await connect()) })
      const before = await snapshot()
      const expiry = (await db.query('UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+INTERVAL \'300 milliseconds\' RETURNING expires_at')).rows[0].expires_at
      let receiptRead = false
      await expect(commit(input, { runTransaction: transactionFor(await connect(), undefined, async (sql) => {
        if (!sql.includes('SELECT metadata FROM page_studio_audit_events')) return
        receiptRead = true
        await expect.poll(async () => (await db.query('SELECT clock_timestamp()>$1 AS expired', [expiry])).rows[0].expired,
          { timeout: 1500, interval: 15 }).toBe(true)
      }) })).rejects.toMatchObject(denied)
      expect(receiptRead).toBe(true)
      expect(await snapshot()).toEqual(before)
    })

    it.each(['actor', 'tenant', 'client', 'site', 'job-scope'] as const)('rejects a mismatched %s without metadata effects', async (field) => {
      const before = await snapshot()
      if (field === 'actor') input.checkpoint.userId = randomUUID()
      if (field === 'tenant') input.checkpoint.scope.tenantId = 'another-tenant'
      if (field === 'client') input.checkpoint.scope.clientId = randomUUID()
      if (field === 'site') input.checkpoint.scope.siteId = randomUUID()
      if (field === 'job-scope') input.provisioning.scope = { ...scope, clientId: randomUUID() }
      await expect(commit(input, { runTransaction: transactionFor(await connect()) })).rejects.toBeDefined()
      expect(await snapshot()).toEqual(before)
    })

    it('rejects a legacy retained actor without its original login digest', async () => {
      const before = await snapshot()
      Reflect.deleteProperty(saved.actor!, 'loginSessionHash')
      await expect(commit(input, { runTransaction: transactionFor(await connect()) })).rejects.toMatchObject({ code: 'PROVISIONING_OWNER_REQUIRED', statusCode: 409 })
      expect(await snapshot()).toEqual(before)
    })

    it.each(['requested', 'complete', 'failed'] as const)('rejects retained phase %s before checkpoint metadata', async (phase) => {
      const before = await snapshot()
      saved.phase = phase
      await expect(commit(input, { runTransaction: transactionFor(await connect()) })).rejects.toBeDefined()
      expect(await snapshot()).toEqual(before)
    })

    it('cannot overwrite a newer head with a first provisioning commit', async () => {
      await recordPageStudioCheckpoint({ ...input.checkpoint, checkpointId: 'newer-checkpoint',
        objectKey: `tenants/${scope.tenantId}/clients/${clientId}/sites/${scope.siteId}/checkpoints/newer-checkpoint.json` },
      { runTransaction: transactionFor(await connect()) })
      const before = await snapshot()
      await expect(commit(input, { runTransaction: transactionFor(await connect()) })).rejects.toMatchObject({ statusCode: 409 })
      expect(await snapshot()).toEqual(before)
    })
  })
})
