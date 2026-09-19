import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, type H3Event } from 'h3'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizePageStudioProvisioning, verifyPageStudioProvisioningJobAuthority, bindPageStudioProvisioningLogin } from '~~/server/utils/pageStudio/provisioningAuthority'
import { createPageStudioProvisioningJob } from '~~/server/utils/pageStudio/provisioningBinding'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession, revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { createJwt } from '~~/server/utils/auth'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'

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
const databaseUrl = process.env.PAGE_STUDIO_PROVISIONING_LOGIN_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/studio_provisioning_login(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) {
    throw new Error('Provisioning login tests require an explicitly disposable localhost studio_provisioning_login database')
  }
}
const migrations = ['402_page_studio_control_plane.sql', '415_page_studio_setup_proposals.sql', '420_page_studio_login_sessions.sql']
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

describe.runIf(Boolean(databaseUrl))('Provisioning retains the original native login authority on PostgreSQL', () => {
  let db: pg.Client
  let schema: string
  let loginToken: string
  let loginHash: string
  let saved: ReturnType<typeof createPageStudioProvisioningJob>
  let scope: { tenantId: string, clientId: string, businessId: string, siteId: string, environment: 'staging' }
  const transaction = async <T>(callback: (client: PageStudioControlQueryClient) => Promise<T>): Promise<T> => {
    await db.query('BEGIN')
    try {
      const result = await callback(db)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  const authorize = () => authorizePageStudioProvisioning({ createProvisioning: async job => job, readProvisioning: async () => saved },
    { requestKey: saved.requestKey, scope }, 'staging')
  const verify = () => verifyPageStudioProvisioningJobAuthority(saved, 'staging')

  beforeEach(async () => {
    schema = `provisioning_login_${randomUUID().replaceAll('-', '')}`
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
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
    })

    it('requires reconciliation for a legacy retained owner with no original login hash', async () => {
      Reflect.deleteProperty(saved.actor!, 'loginSessionHash')
      await expect(authorize()).rejects.toMatchObject({ code: 'PROVISIONING_OWNER_REQUIRED', statusCode: 409 })
      await expect(verify()).rejects.toMatchObject({ code: 'PROVISIONING_OWNER_REQUIRED', statusCode: 409 })
    })

    it('authorizes the bound original native login without an editor grant', async () => {
      expect(saved.actor).toMatchObject({ loginSessionHash: loginHash })
      await expect(authorize()).resolves.toMatchObject({ userId, job: { actor: { loginSessionHash: loginHash } } })
      await expect(verify()).resolves.toMatchObject({ userId })
      expect((await db.query('SELECT * FROM page_studio_sessions')).rowCount).toBe(0)
    })

    it.each(['not-a-digest', 'F'.repeat(64), 'a'.repeat(63), null])('rejects malformed retained login hash %s before querying authority', async (hash) => {
      Reflect.set(saved.actor!, 'loginSessionHash', hash)
      database.fresh.mockClear()
      await expect(authorize()).rejects.toMatchObject({ code: 'PROVISIONER_FAILED', statusCode: 503 })
      await expect(verify()).rejects.toMatchObject({ code: 'PROVISIONER_FAILED', statusCode: 503 })
      expect(database.fresh).not.toHaveBeenCalled()
    })

    it('actual logout revokes only the initiating login and a second login cannot rescue its job', async () => {
      await expect(authorize()).resolves.toMatchObject({ userId })
      const second = await bind()
      await revokePageStudioLoginSession(event(loginToken), role)
      await expect(authorize()).rejects.toMatchObject(denied)
      await expect(verify()).rejects.toMatchObject(denied)
      expect((await db.query('SELECT is_active FROM team_members WHERE id=$1', [userId])).rows[0].is_active).toBe(true)
      expect((await db.query('SELECT status FROM client_users WHERE id=$1', [userId])).rows[0].status).toBe('active')
      const original = saved
      saved = { ...saved, actor: { ...saved.actor!, loginSessionHash: second.hash } }
      await expect(authorize()).resolves.toMatchObject({ userId })
      saved = original
      await expect(authorize()).rejects.toMatchObject(denied)
      expect((await db.query('SELECT * FROM page_studio_sessions')).rowCount).toBe(0)
    })

    it.each(['missing', 'revoked', 'expired', 'wrong-user', 'wrong-role'] as const)('denies an original parent that is %s', async (change) => {
      await expect(authorize()).resolves.toMatchObject({ userId })
      if (change === 'missing') await db.query('DELETE FROM page_studio_login_sessions')
      if (change === 'revoked') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      if (change === 'expired') await db.query('UPDATE page_studio_login_sessions SET issued_at=NOW()-INTERVAL \'2 days\',expires_at=NOW()-INTERVAL \'1 day\'')
      if (change === 'wrong-user') await db.query('UPDATE page_studio_login_sessions SET user_id=$1', [randomUUID()])
      if (change === 'wrong-role') await db.query('UPDATE page_studio_login_sessions SET role=$1', [role === 'agency' ? 'client' : 'agency'])
      await expect(authorize()).rejects.toMatchObject(denied)
      await expect(verify()).rejects.toMatchObject(denied)
    })

    it.each(['permission', 'entitlement'] as const)('still denies current %s loss with a valid parent login', async (change) => {
      await expect(authorize()).resolves.toMatchObject({ userId })
      if (change === 'permission') await db.query(role === 'agency' ? 'DELETE FROM role_permission_groups' : 'UPDATE page_studio_site_memberships SET role=\'viewer\'')
      else await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
      await expect(authorize()).rejects.toMatchObject(denied)
      await expect(verify()).rejects.toMatchObject(denied)
    })

    it('binds the canonical original credential through the production producer helper', async () => {
      const token = role === 'agency' ? await createJwt({ userId, role: 'owner' }) : randomUUID()
      const hash = createHash('sha256').update(token).digest('hex')
      if (role === 'client') await db.query('INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL \'1 day\')', [hash, userId])
      await expect(bindPageStudioProvisioningLogin(event(token), role, userId)).resolves.toBe(hash)
      expect((await db.query('SELECT user_id,revoked_at FROM page_studio_login_sessions WHERE role=$1 AND token_hash=$2', [role, hash])).rows)
        .toEqual([{ user_id: userId, revoked_at: null }])
      expect((await db.query('SELECT * FROM page_studio_sessions')).rowCount).toBe(0)
    })

    it('rejects missing, foreign and revoked producer credentials without reactivating a parent', async () => {
      await expect(bindPageStudioProvisioningLogin(undefined as unknown as H3Event, role, userId)).rejects.toMatchObject({ statusCode: 401 })
      await expect(bindPageStudioProvisioningLogin(event(loginToken), role, randomUUID())).rejects.toMatchObject({ statusCode: 401 })
      await revokePageStudioLoginSession(event(loginToken), role)
      await expect(bindPageStudioProvisioningLogin(event(loginToken), role, userId)).rejects.toMatchObject({ statusCode: 401 })
      expect((await db.query('SELECT revoked_at IS NOT NULL AS revoked FROM page_studio_login_sessions WHERE role=$1 AND token_hash=$2', [role, loginHash])).rows)
        .toEqual([{ revoked: true }])
    })

    if (role === 'agency') it('denies global staff session invalidation after the original login was issued', async () => {
      await expect(authorize()).resolves.toMatchObject({ userId })
      await db.query('UPDATE team_members SET sessions_invalidated_at=clock_timestamp()+INTERVAL \'1 second\'')
      await expect(authorize()).rejects.toMatchObject(denied)
      await expect(verify()).rejects.toMatchObject(denied)
    })

    if (role === 'client') it.each(['expired', 'deleted', 'reassigned', 'wrong-native-user'] as const)('denies a portal native session that is %s', async (change) => {
      await expect(authorize()).resolves.toMatchObject({ userId })
      if (change === 'expired') await db.query('UPDATE client_sessions SET expires_at=NOW()-INTERVAL \'1 second\'')
      if (change === 'deleted') await db.query('DELETE FROM client_sessions')
      if (change === 'reassigned') await db.query('UPDATE client_users SET client_id=$1', [randomUUID()])
      if (change === 'wrong-native-user') await db.query('UPDATE client_sessions SET client_user_id=$1', [randomUUID()])
      await expect(authorize()).rejects.toMatchObject(denied)
      await expect(verify()).rejects.toMatchObject(denied)
    })
  })
})
