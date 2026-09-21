import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJwt } from '~~/server/utils/auth'
import { authorizePageStudioCollections, executePageStudioCollection } from '~~/server/utils/pageStudio/collections'
import { resolvePageStudioLoginSession, bindPageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { preparePageStudioCollectionUpgrade } from '~~/server/utils/pageStudio/collectionUpgradeIntent'
import { authorizePageStudioCollectionUpgrade } from '~~/server/utils/pageStudio/collectionUpgradeAuthority'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => { throw new Error('Inject disposable transaction') },
  queryRowsFresh: () => { throw new Error('Inject disposable query') }
}))
const databaseUrl = process.env.PAGE_STUDIO_COLLECTION_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || !/^\/studio_collection_upgrade(?:_[a-z0-9_]+)?$/.test(url.pathname) || url.search) throw new Error('Disposable localhost collection database required')
}
const userId = '30000000-0000-4000-8000-000000000501', clientId = '20000000-0000-4000-8000-000000000501'
const roleId = '60000000-0000-4000-8000-000000000501'
const migrations = ['402_page_studio_control_plane.sql', '404_page_studio_documents.sql', '420_page_studio_login_sessions.sql']
  .map(file => readFileSync(new URL(`../../../server/database/migrations/${file}`, import.meta.url), 'utf8'))

describe.runIf(Boolean(databaseUrl))('native collection upgrade intent on PostgreSQL', () => {
  let db: pg.Client, schema: string, siteId: string, token: string
  let connections: pg.Client[] = []
  async function connect() {
    const connection = new pg.Client({ connectionString: databaseUrl })
    await connection.connect()
    connections.push(connection)
    await connection.query(`SET search_path TO "${schema}", pg_catalog`)
    await connection.query('SET statement_timeout TO \'6s\'')
    return connection
  }
  function transaction(connection: pg.Client) {
    return async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => {
      await connection.query('BEGIN')
      try {
        const result = await work(connection as unknown as PageStudioControlQueryClient)
        await connection.query('COMMIT')
        return result
      } catch (error) {
        await connection.query('ROLLBACK')
        throw error
      }
    }
  }
  beforeEach(async () => {
    connections = []
    schema = `collection_${randomUUID().replaceAll('-', '')}`
    db = await connect()
    await db.query(`CREATE SCHEMA "${schema}";
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,
        role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);`)
    await db.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    for (const sql of migrations) await db.query(sql)
    await db.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await db.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'manager\')', [userId, clientId])
    const entitlement = (await db.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,created_by,plan_metadata)
      VALUES('collection-fixture',$1,$2,'{"allowedModules":["business-content"],"builder":{"collectionSchemas":true}}') RETURNING id`, [clientId, userId])).rows[0]
    siteId = (await db.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,created_by)
      VALUES('collection-fixture',$1,$2,'Collection fixture','collection-fixture','fixture-v1',$3) RETURNING id`, [clientId, entitlement.id, userId])).rows[0].id
    await db.query('INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role) VALUES(\'collection-fixture\',$1,$2,$3,\'editor\')', [clientId, siteId, userId])
  })
  afterEach(async () => {
    await Promise.all(connections.filter(c => c !== db).map(c => c.end()))
    if (db) {
      try {
        await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      } finally {
        await db.end()
      }
    }
  })
  const count = async () => Number((await db.query('SELECT count(*) FROM page_studio_audit_events WHERE action=\'content.collection-upgrade.requested\'')).rows[0].count)
  const read = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows
  const target = () => ({ scope: { tenantId: 'collection-fixture', clientId, businessId: clientId, siteId, environment: 'staging' },
    accountId: 'a'.repeat(32), databaseId: '10000000-0000-4000-8000-000000000001', name: `ps-content-${'b'.repeat(32)}` })
  const authorize = (intent: unknown) => authorizePageStudioCollectionUpgrade(intent, 'staging', { read })

  describe.each(['agency', 'client'] as const)('%s', (role) => {
    beforeEach(async () => {
      token = role === 'agency' ? await createJwt({ userId, role: 'owner' }) : randomUUID()
      if (role === 'client') await db.query('INSERT INTO client_sessions VALUES($1,$2,clock_timestamp()+INTERVAL \'1 day\')', [createHash('sha256').update(token).digest('hex'), userId])
    })
    function request() {
      const incoming = new IncomingMessage(new Socket())
      incoming.method = 'POST'
      incoming.url = '/test/collection-upgrade'
      incoming.headers = { authorization: `Bearer ${token}` }
      const actor = role === 'agency' ? { role, actorId: userId, tenantId: 'collection-fixture', canEdit: true } : { role, actorId: userId, clientId }
      return { actor, event: createEvent(incoming, new ServerResponse(incoming)), siteId, environment: 'staging' as const, body: { requestId: randomUUID() } }
    }
    async function options() {
      return { runTransaction: transaction(await connect()), resolveDatabase: vi.fn(async () => target()) }
    }
    async function collectionAccess() {
      const input = request()
      const login = await resolvePageStudioLoginSession(db, input.event, role, userId)
      await bindPageStudioLoginSession(db, login)
      const service = { readContent: vi.fn(), writeContent: vi.fn(), listCollectionDefinitions: vi.fn(async () => ({ items: [], nextCursor: null })), readCollectionDefinition: vi.fn(), writeCollectionDefinition: vi.fn(), listCollectionRecords: vi.fn(), readCollectionRecord: vi.fn(), writeCollectionRecord: vi.fn() }
      return { request: { actor: input.actor, login, siteId, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: service } }, service, deps: { query: async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0] ?? null } }
    }
    it('admits generated collection reads and schema management through actual native SQL', async () => {
      const f = await collectionAccess()
      expect(await authorizePageStudioCollections(f.request, true, true, f.deps)).toMatchObject({ scope: target().scope, canManageSchema: true })
      expect(await executePageStudioCollection(f.request, 'listDefinitions', {}, f.deps)).toMatchObject({ items: [] })
      expect(f.service.listCollectionDefinitions).toHaveBeenCalledTimes(1)
    })
    it.each(['plan', 'module', 'capacity', 'logout'] as const)('denies generated collections after current %s changes', async (change) => {
      const f = await collectionAccess()
      if (change === 'plan') await db.query('UPDATE page_studio_entitlements SET plan_metadata=\'{}\'')
      if (change === 'module') await db.query(`UPDATE page_studio_entitlements SET plan_metadata='{"builder":{"collectionSchemas":true},"allowedModules":[]}'`)
      if (change === 'capacity') await db.query('UPDATE page_studio_entitlements SET active_site_limit=0')
      if (change === 'logout') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      await expect(executePageStudioCollection(f.request, 'listDefinitions', {}, f.deps)).rejects.toMatchObject({ statusCode: 403 })
      expect(f.service.listCollectionDefinitions).not.toHaveBeenCalled()
    })
    it('withholds remote content if native login is revoked during the RPC', async () => {
      const f = await collectionAccess()
      f.service.listCollectionDefinitions.mockImplementation(async () => {
        await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        return { items: [], nextCursor: null }
      })
      await expect(executePageStudioCollection(f.request, 'listDefinitions', {}, f.deps)).rejects.toMatchObject({ statusCode: 403 })
    })
    function deployedRequest() {
      const input = request()
      const binding = { createProvisioning: vi.fn(), readProvisioning: vi.fn(), readCollectionUpgradeDatabase: vi.fn(async (_scope: unknown) => target()) }
      input.event.context.cloudflare = { env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_PROVISIONER: binding } }
      return { input, binding }
    }
    it('discovers the exact database through the deployed binding after native admission', async () => {
      const { input, binding } = deployedRequest()
      binding.readCollectionUpgradeDatabase.mockImplementation(async (scope) => {
        expect(scope).toEqual(target().scope)
        expect((await db.query('SELECT * FROM page_studio_login_sessions')).rows).toHaveLength(1)
        return target()
      })
      const { runTransaction } = await options()
      const saved = await preparePageStudioCollectionUpgrade(input, { runTransaction })
      expect(saved.intent.databaseId).toBe(target().databaseId)
      expect(await authorize(saved.intent)).toEqual(saved.intent)
      expect(await preparePageStudioCollectionUpgrade(input, { runTransaction })).toEqual(saved)
      expect(binding.readCollectionUpgradeDatabase).toHaveBeenCalledTimes(2)
      expect(binding.createProvisioning).not.toHaveBeenCalled()
      expect(await count()).toBe(1)
    })
    it.each(['missing-environment', 'wrong-environment', 'missing-binding', 'missing-method'])('denies %s without discovery or saving intent', async (failure) => {
      const { input, binding } = deployedRequest()
      const env = input.event.context.cloudflare.env
      if (failure === 'missing-environment') delete env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT
      if (failure === 'wrong-environment') env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
      if (failure === 'missing-binding') delete env.PAGE_STUDIO_PROVISIONER
      if (failure === 'missing-method') env.PAGE_STUDIO_PROVISIONER = { createProvisioning: binding.createProvisioning, readProvisioning: binding.readProvisioning }
      const { runTransaction } = await options()
      await expect(preparePageStudioCollectionUpgrade(input, { runTransaction })).rejects.toMatchObject({ statusCode: 503 })
      expect(binding.readCollectionUpgradeDatabase).not.toHaveBeenCalled()
      expect(await count()).toBe(0)
    })
    it.each(['missing', 'foreign', 'unavailable'])('denies %s database discovery without saving intent', async (failure) => {
      const { input, binding } = deployedRequest()
      if (failure === 'missing') binding.readCollectionUpgradeDatabase.mockResolvedValue(null as never)
      if (failure === 'foreign') binding.readCollectionUpgradeDatabase.mockResolvedValue({ ...target(), scope: { ...target().scope, siteId: randomUUID() } })
      if (failure === 'unavailable') binding.readCollectionUpgradeDatabase.mockRejectedValue(new Error('Worker unavailable'))
      const { runTransaction } = await options()
      await expect(preparePageStudioCollectionUpgrade(input, { runTransaction })).rejects.toThrow()
      expect(binding.readCollectionUpgradeDatabase).toHaveBeenCalledOnce()
      expect(await count()).toBe(0)
    })
    it('does not contact the deployed Worker without the collection package allowance', async () => {
      const { input, binding } = deployedRequest()
      await db.query('UPDATE page_studio_entitlements SET plan_metadata=\'{}\'')
      const { runTransaction } = await options()
      await expect(preparePageStudioCollectionUpgrade(input, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
      expect(binding.readCollectionUpgradeDatabase).not.toHaveBeenCalled()
      expect(await count()).toBe(0)
    })
    it('rechecks logout after deployed Worker discovery before saving intent', async () => {
      const { input, binding } = deployedRequest()
      binding.readCollectionUpgradeDatabase.mockImplementation(async () => {
        await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        return target()
      })
      const { runTransaction } = await options()
      await expect(preparePageStudioCollectionUpgrade(input, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
      expect(binding.readCollectionUpgradeDatabase).toHaveBeenCalledOnce()
      expect(await count()).toBe(0)
    })
    it('persists one exact request, admits its original login, and preserves site state on retry', async () => {
      const input = request(), opts = await options()
      const before = (await db.query('SELECT * FROM page_studio_sites')).rows
      const saved = await preparePageStudioCollectionUpgrade(input, opts)
      expect(saved.intent.scope).toEqual(target().scope)
      expect(saved.intent.actor.loginSessionHash).toBe(createHash('sha256').update(token).digest('hex'))
      expect(await authorize(saved.intent)).toEqual(saved.intent)
      expect(await preparePageStudioCollectionUpgrade(input, opts)).toEqual(saved)
      expect(await count()).toBe(1)
      expect((await db.query('SELECT * FROM page_studio_sites')).rows).toEqual(before)
    })
    it('serializes concurrent retry IDs into a single native intent', async () => {
      const input = request(), a = await options(), b = await options()
      const results = await Promise.all([preparePageStudioCollectionUpgrade(input, a), preparePageStudioCollectionUpgrade(input, b)])
      expect(results[0]).toEqual(results[1])
      expect(await count()).toBe(1)
    })
    it('denies other requests, a replacement database and a replacement login', async () => {
      const input = request(), opts = await options()
      await preparePageStudioCollectionUpgrade(input, opts)
      await expect(preparePageStudioCollectionUpgrade(request(), opts)).rejects.toMatchObject({ statusCode: 409 })
      opts.resolveDatabase.mockResolvedValue({ ...target(), databaseId: randomUUID() })
      await expect(preparePageStudioCollectionUpgrade(input, opts)).rejects.toMatchObject({ statusCode: 409 })
      opts.resolveDatabase.mockResolvedValue(target())
      token = role === 'agency' ? await createJwt({ userId, role: 'owner', loginInstance: randomUUID() }) : randomUUID()
      if (role === 'client') await db.query('INSERT INTO client_sessions VALUES($1,$2,clock_timestamp()+INTERVAL \'1 day\')', [createHash('sha256').update(token).digest('hex'), userId])
      await expect(preparePageStudioCollectionUpgrade({ ...request(), body: input.body }, opts)).rejects.toMatchObject({ statusCode: 409 })
    })
    it.each(['scope', 'actor', 'targetDigest', 'databaseId', 'approved'])('rejects browser supplied %s before database discovery', async (key) => {
      const input = request(), opts = await options()
      await expect(preparePageStudioCollectionUpgrade({ ...input, body: { ...input.body, [key]: 'forged' } }, opts)).rejects.toMatchObject({ statusCode: 400 })
      expect(opts.resolveDatabase).not.toHaveBeenCalled()
      expect(await count()).toBe(0)
    })
    it('denies foreign scope discovery and a missing native login', async () => {
      const opts = await options()
      opts.resolveDatabase.mockResolvedValue({ ...target(), scope: { ...target().scope, siteId: randomUUID() } })
      await expect(preparePageStudioCollectionUpgrade(request(), opts)).rejects.toMatchObject({ statusCode: 403 })
      await expect(preparePageStudioCollectionUpgrade({ ...request(), event: undefined }, opts)).rejects.toMatchObject({ statusCode: 401 })
      expect(await count()).toBe(0)
    })
    it('denies logout committed while database discovery is in flight', async () => {
      const opts = await options()
      opts.resolveDatabase.mockImplementation(async () => {
        await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        return target()
      })
      await expect(preparePageStudioCollectionUpgrade(request(), opts)).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(0)
    })
    it.each([
      'UPDATE page_studio_entitlements SET plan_metadata=\'{}\'',
      'UPDATE page_studio_entitlements SET plan_metadata=\'{"builder":{"collectionSchemas":false}}\'',
      'UPDATE page_studio_entitlements SET plan_metadata=\'{"builder":{"collectionSchemas":true},"allowedModules":[]}\'',
      'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-INTERVAL \'1 second\'',
      'UPDATE page_studio_entitlements SET active_site_limit=0',
      'UPDATE page_studio_sites SET status=\'suspended\'',
      'UPDATE agency_clients SET is_active=FALSE',
      'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'
    ])('denies current native authority after %s', async (mutation) => {
      const saved = await preparePageStudioCollectionUpgrade(request(), await options())
      await db.query(mutation)
      await expect(authorize(saved.intent)).rejects.toMatchObject({ statusCode: 403 })
    })
    it.each(role === 'agency'
      ? [
          'DELETE FROM role_permission_groups', 'UPDATE custom_roles SET is_read_only=TRUE',
          'UPDATE team_members SET sessions_invalidated_at=clock_timestamp()'
        ]
      : [
          'UPDATE client_users SET role=\'viewer\'', 'UPDATE page_studio_site_memberships SET role=\'viewer\'',
          'DELETE FROM client_sessions'
        ])('denies editing downgrade after %s', async (mutation) => {
      const saved = await preparePageStudioCollectionUpgrade(request(), await options())
      await db.query(mutation)
      await expect(authorize(saved.intent)).rejects.toMatchObject({ statusCode: 403 })
    })
    it('denies forged retained target, actor, scope and duplicate intents', async () => {
      const saved = await preparePageStudioCollectionUpgrade(request(), await options())
      for (const input of [{ ...saved.intent, databaseId: randomUUID() }, { ...saved.intent, actor: { ...saved.intent.actor, loginSessionHash: 'f'.repeat(64) } },
        { ...saved.intent, scope: { ...saved.intent.scope, businessId: 'foreign' } }]) await expect(authorize(input)).rejects.toMatchObject({ statusCode: 403 })
      await db.query('INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata) SELECT tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata FROM page_studio_audit_events WHERE action=\'content.collection-upgrade.requested\'')
      await expect(authorize(saved.intent)).rejects.toMatchObject({ statusCode: 403 })
    })
    it('retains cancellation as an appended audit event and denies retries', async () => {
      const input = request(), opts = await options()
      const saved = await preparePageStudioCollectionUpgrade(input, opts)
      await db.query('INSERT INTO page_studio_audit_events(tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata) SELECT tenant_id,client_id,site_id,actor_id,actor_role,\'content.collection-upgrade.disabled\',resource_type,resource_id,metadata FROM page_studio_audit_events WHERE action=\'content.collection-upgrade.requested\'')
      await expect(authorize(saved.intent)).rejects.toMatchObject({ statusCode: 403 })
      await expect(preparePageStudioCollectionUpgrade(input, opts)).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(1)
    })
    it('recovers after the native intent commits but its acknowledgement is lost', async () => {
      const input = request(), opts = await options(), run = opts.runTransaction
      let calls = 0
      opts.runTransaction = async (work) => {
        const result = await run(work)
        if (++calls === 2) throw new Error('lost acknowledgement')
        return result
      }
      await expect(preparePageStudioCollectionUpgrade(input, opts)).rejects.toThrow('lost acknowledgement')
      const saved = (await db.query('SELECT metadata FROM page_studio_audit_events WHERE action=\'content.collection-upgrade.requested\'')).rows[0].metadata
      expect(await preparePageStudioCollectionUpgrade(input, opts)).toEqual({ intent: saved.intent, identity: saved.identity })
      expect(await count()).toBe(1)
    })
    it('rolls back intent when package expires during its insert', async () => {
      await db.query(`CREATE FUNCTION delay_collection_intent() RETURNS trigger AS $$
        BEGIN IF NEW.action='content.collection-upgrade.requested' THEN PERFORM pg_sleep(0.4); END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER delay_collection_intent BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION delay_collection_intent();`)
      const opts = await options()
      opts.resolveDatabase.mockImplementation(async () => {
        await db.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'0.3 seconds\'')
        return target()
      })
      await expect(preparePageStudioCollectionUpgrade(request(), opts)).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(0)
    })
  })
})
