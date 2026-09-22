import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { createApp, toWebHandler } from 'h3'
import { preparePageStudioContentLogin } from '~~/server/utils/pageStudio/contentNativeLogin'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { contentLogin } from '../../fixtures/pageStudioContentLogin'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readPageStudioBusinessContent, writePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContent'

const nativeDb = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn(), transactionWithoutRetry: (callback: (db: unknown) => unknown) => callback(nativeDb) }))
const databaseUrl = process.env.PAGE_STUDIO_CONTENT_DATABASE_TEST_URL
const siteId = '10000000-0000-4000-8000-000000000001'
const clientId = '10000000-0000-4000-8000-000000000002'
const staffId = '20000000-0000-4000-8000-000000000001'
const memberId = '20000000-0000-4000-8000-000000000002'
const agencyLogin = contentLogin({ role: 'agency', actorId: staffId })
const portalLogin = contentLogin({ role: 'client', actorId: memberId })
const entitlementId = '10000000-0000-4000-8000-000000000003'
describe.runIf(Boolean(databaseUrl))('business content authority on disposable PostgreSQL', () => {
  let client: pg.Client
  let connected = false
  const schema = `content_${randomUUID().replaceAll('-', '')}`
  const read = vi.fn().mockResolvedValue(null)
  const write = vi.fn()
  const env = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: { readContent: read, writeContent: write } }
  const dependencies = { query: async (sql: string, values: unknown[]) => (await client.query(sql, values)).rows[0] ?? null }
  const run = (tenantId = 'selected') => readPageStudioBusinessContent({ actor: { role: 'agency', actorId: staffId, tenantId, canEdit: false }, login: agencyLogin, siteId, env }, dependencies)
  const portal = (actorId = memberId) => ({ actor: { role: 'client' as const, actorId, clientId }, login: { ...portalLogin, userId: actorId }, siteId, env })
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connected = true
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    await client.query(`CREATE TABLE page_studio_cms_scopes (tenant_id TEXT, client_id UUID, business_id UUID, site_id UUID, environment TEXT, state TEXT);
      CREATE TABLE page_studio_site_memberships (tenant_id TEXT, client_id UUID, site_id UUID, user_id UUID, role TEXT);
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID, status TEXT);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT, effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, plan_metadata JSONB);
      CREATE TABLE page_studio_login_sessions (role TEXT, token_hash TEXT, user_id TEXT, issued_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, PRIMARY KEY (role,token_hash));
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID, status TEXT);
      CREATE TABLE client_sessions (token_hash TEXT PRIMARY KEY, client_user_id UUID, expires_at TIMESTAMPTZ);
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN, user_role TEXT, custom_role_id UUID, sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT, is_system BOOLEAN, is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT);`)
    portalLogin.tokenHash = await digestPortalSessionToken('local-cms-session-fixture')
    for (const login of [agencyLogin, portalLogin]) {
      await client.query('INSERT INTO page_studio_login_sessions VALUES ($1,$2,$3,$4,$5,NULL)', [login.role, login.tokenHash, login.userId, login.issuedAt, login.expiresAt])
    }
    await client.query('INSERT INTO client_users VALUES (\'20000000-0000-4000-8000-000000000002\',$1,\'active\')', [clientId])
    await client.query('INSERT INTO client_sessions VALUES ($1,\'20000000-0000-4000-8000-000000000002\',$2)', [portalLogin.tokenHash, portalLogin.expiresAt])
    await client.query('INSERT INTO team_members VALUES (\'20000000-0000-4000-8000-000000000001\',TRUE,\'member\',NULL,NULL)')
    await client.query('INSERT INTO custom_roles VALUES (\'30000000-0000-4000-8000-000000000001\',\'member\',TRUE,FALSE)')
    await client.query('INSERT INTO role_permission_groups VALUES (\'30000000-0000-4000-8000-000000000001\',\'PAGE_STUDIO_VIEW\')')
    await client.query('INSERT INTO page_studio_site_memberships VALUES (\'selected\', $1, $2, \'20000000-0000-4000-8000-000000000002\', \'editor\')', [clientId, siteId])
    await client.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
    await client.query('INSERT INTO page_studio_sites VALUES ($1, \'selected\', $2, $3, \'active\')', [siteId, clientId, entitlementId])
    await client.query('INSERT INTO page_studio_entitlements VALUES ($1, \'selected\', $2, \'trial\', NOW() - INTERVAL \'1 hour\', NOW() + INTERVAL \'1 hour\', $3)', [entitlementId, clientId, { allowedModules: ['bookings'] }])
  })
  beforeEach(async () => {
    read.mockReset().mockResolvedValue(null)
    write.mockReset()
    await client.query('BEGIN')
    nativeDb.query.mockImplementation((sql, values) => client.query(sql, values))
  })
  afterEach(async () => {
    await client.query('ROLLBACK')
  })
  afterAll(async () => {
    if (!connected) return
    try {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`)
    } finally {
      await client.end()
    }
  })
  it('allows the selected tenant and denies another tenant', async () => {
    await expect(run()).resolves.toMatchObject({ revision: 0, canEdit: false })
    await expect(run('foreign')).rejects.toMatchObject({ statusCode: 404 })
  })
  it.each([
    ['membership removed', 'DELETE FROM page_studio_site_memberships', 403],
    ['site suspended', 'UPDATE page_studio_sites SET status=\'suspended\'', 403],
    ['client inactive', 'UPDATE agency_clients SET is_active=FALSE', 404],
    ['entitlement expired', 'UPDATE page_studio_entitlements SET effective_until=NOW() - INTERVAL \'1 second\'', 403],
    ['entitlement cancelled', 'UPDATE page_studio_entitlements SET status=\'cancelled\'', 403]
  ])('withholds the RPC result after %s during a read', async (_label, mutation, statusCode) => {
    read.mockImplementationOnce(async () => {
      await client.query(mutation as string)
      return null
    })
    await expect(readPageStudioBusinessContent(portal(), dependencies)).rejects.toMatchObject({ statusCode })
  })
  it('returns viewer permissions after a mid-read membership downgrade', async () => {
    read.mockImplementationOnce(async () => {
      await client.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
      return null
    })
    await expect(readPageStudioBusinessContent(portal(), dependencies)).resolves.toMatchObject({ canEdit: false, revision: 0 })
  })
  it('observes membership revocation committed by a separate connection before the RPC returns', async () => {
    const revoker = new pg.Client({ connectionString: databaseUrl })
    await revoker.connect()
    try {
      await revoker.query(`SET search_path TO "${schema}", pg_catalog`)
      read.mockImplementationOnce(async () => {
        await revoker.query('DELETE FROM page_studio_site_memberships')
        return null
      })
      await expect(readPageStudioBusinessContent(portal(), dependencies)).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      try {
        await revoker.query('INSERT INTO page_studio_site_memberships SELECT \'selected\', $1, $2, \'20000000-0000-4000-8000-000000000002\', \'editor\' WHERE NOT EXISTS (SELECT 1 FROM page_studio_site_memberships)', [clientId, siteId])
      } finally {
        await revoker.end()
      }
    }
  })
  it('withholds the old result when an agency site changes client during a read', async () => {
    read.mockImplementationOnce(async () => {
      const replacementClientId = randomUUID()
      await client.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [replacementClientId])
      await client.query('UPDATE page_studio_sites SET client_id=$1', [replacementClientId])
      await client.query('UPDATE page_studio_entitlements SET client_id=$1', [replacementClientId])
      return null
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
  })
  it('immediately denies a deactivated client', async () => {
    await client.query('UPDATE agency_clients SET is_active=FALSE')
    await expect(run()).rejects.toMatchObject({ statusCode: 404 })
  })
  it('rejects an expired or future access period', async () => {
    await client.query('UPDATE page_studio_entitlements SET effective_until=NOW() - INTERVAL \'1 minute\'')
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    await client.query('UPDATE page_studio_entitlements SET effective_until=NULL, effective_from=NOW() + INTERVAL \'1 hour\'')
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
  })
  it('cannot borrow an entitlement from a different client or tenant', async () => {
    await client.query('UPDATE page_studio_entitlements SET tenant_id=\'foreign\'')
    await expect(run()).rejects.toMatchObject({ statusCode: 404 })
    await client.query('UPDATE page_studio_entitlements SET tenant_id=\'selected\', client_id=$1', [randomUUID()])
    await expect(run()).rejects.toMatchObject({ statusCode: 404 })
  })
  it('denies revoked, viewer or foreign-user membership on writes before RPC', async () => {
    await expect(readPageStudioBusinessContent(portal(), dependencies)).resolves.toMatchObject({ canEdit: true })
    await expect(readPageStudioBusinessContent(portal('20000000-0000-4000-8000-000000000099'), dependencies)).rejects.toMatchObject({ statusCode: 403 })
    await client.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
    await expect(readPageStudioBusinessContent(portal(), dependencies)).resolves.toMatchObject({ canEdit: false })
    await expect(writePageStudioBusinessContent({ ...portal(), body: { collections: [], expectedRevision: 0 } }, dependencies)).rejects.toMatchObject({ statusCode: 403 })
    await client.query('DELETE FROM page_studio_site_memberships')
    await expect(readPageStudioBusinessContent(portal(), dependencies)).rejects.toMatchObject({ statusCode: 403 })
    expect(write).not.toHaveBeenCalled()
  })
  it('cannot borrow membership from a different site, client or tenant', async () => {
    for (const [column, value] of [['site_id', randomUUID()], ['client_id', randomUUID()], ['tenant_id', 'foreign']]) {
      await client.query(`UPDATE page_studio_site_memberships SET ${column}=$1`, [value])
      await expect(readPageStudioBusinessContent(portal(), dependencies)).rejects.toMatchObject({ statusCode: 403 })
      await client.query('UPDATE page_studio_site_memberships SET tenant_id=\'selected\', client_id=$1, site_id=$2', [clientId, siteId])
    }
  })
  it.each([
    ['native portal logout', 'DELETE FROM client_sessions'],
    ['login revoked', 'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE role=\'client\''],
    ['portal account disabled', 'UPDATE client_users SET status=\'inactive\''],
    ['portal user moved', 'UPDATE client_users SET client_id=\'10000000-0000-4000-8000-000000000099\''],
    ['native session expired', 'UPDATE client_sessions SET expires_at=clock_timestamp() - interval \'1 second\'']
  ])('withholds a completed CMS read after %s', async (_label, sql) => {
    read.mockImplementationOnce(async () => {
      await client.query(sql)
      return null
    })
    await expect(readPageStudioBusinessContent(portal(), dependencies)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    ['agency logout', 'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE role=\'agency\''],
    ['agency disabled', 'UPDATE team_members SET is_active=FALSE'],
    ['agency sessions invalidated', 'UPDATE team_members SET sessions_invalidated_at=clock_timestamp()'],
    ['view permission removed', 'DELETE FROM role_permission_groups'],
    ['custom role changed', 'UPDATE team_members SET custom_role_id=\'30000000-0000-4000-8000-000000000099\'']
  ])('withholds agency CMS data after %s', async (_label, sql) => {
    read.mockImplementationOnce(async () => {
      await client.query(sql)
      return null
    })
    await expect(run()).rejects.toMatchObject({ statusCode: 403 })
  })
  it('removes editing after a current agency role downgrade while retaining view access', async () => {
    await client.query('INSERT INTO role_permission_groups VALUES (\'30000000-0000-4000-8000-000000000001\',\'PAGE_STUDIO_EDIT\')')
    const request = { actor: { role: 'agency' as const, actorId: staffId, tenantId: 'selected', canEdit: true }, login: agencyLogin, siteId, env }
    read.mockImplementationOnce(async () => {
      await client.query('UPDATE custom_roles SET is_read_only=TRUE')
      return null
    })
    await expect(readPageStudioBusinessContent(request, dependencies)).resolves.toMatchObject({ canEdit: false })
    await expect(writePageStudioBusinessContent({ ...request, body: { collections: [], expectedRevision: 0 } }, dependencies)).rejects.toMatchObject({ statusCode: 403 })
    expect(write).not.toHaveBeenCalled()
  })
  it('observes native logout committed by another connection during the remote read', async () => {
    const revoker = new pg.Client({ connectionString: databaseUrl })
    await revoker.connect()
    try {
      await revoker.query(`SET search_path TO "${schema}", pg_catalog`)
      read.mockImplementationOnce(async () => {
        await revoker.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE role=\'client\'')
        return null
      })
      await expect(readPageStudioBusinessContent(portal(), dependencies)).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      await revoker.query('UPDATE page_studio_login_sessions SET revoked_at=NULL WHERE role=\'client\'')
      await revoker.end()
    }
  })
  it('uses wall-clock expiry even if a transaction began before the session expired', async () => {
    const expiresAt = new Date(Date.now() + 300)
    await client.query('UPDATE page_studio_login_sessions SET expires_at=$1 WHERE role=\'client\'', [expiresAt])
    await client.query('UPDATE client_sessions SET expires_at=$1', [expiresAt])
    read.mockImplementationOnce(async () => {
      await client.query('SELECT pg_sleep(0.4)')
      return null
    })
    await expect(readPageStudioBusinessContent({ ...portal(), login: { ...portalLogin, expiresAt } }, dependencies)).rejects.toMatchObject({ statusCode: 403 })
    expect(read).toHaveBeenCalledOnce()
  })

  it('binds a real HTTP portal cookie and prevents reuse after native logout', async () => {
    const fetch = toWebHandler(createApp().use(async (event) => {
      const request = portal()
      const login = await preparePageStudioContentLogin(event, request.actor)
      return await readPageStudioBusinessContent({ ...request, login }, dependencies)
    }))
    const request = () => new Request('https://fixture.invalid/content', { headers: { cookie: 'client_session_token=local-cms-session-fixture' } })
    expect((await fetch(request())).status).toBe(200)
    await client.query('DELETE FROM client_sessions')
    expect((await fetch(request())).status).toBe(401)
    expect(read).toHaveBeenCalledOnce()
  })
  it('does not clear an existing logout tombstone while binding a CMS request', async () => {
    const fetch = toWebHandler(createApp().use(async (event) => {
      const request = portal()
      const login = await preparePageStudioContentLogin(event, request.actor)
      return await readPageStudioBusinessContent({ ...request, login }, dependencies)
    }))
    await client.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE role=\'client\'')
    const response = await fetch(new Request('https://fixture.invalid/content', { headers: { cookie: 'client_session_token=local-cms-session-fixture' } }))
    expect(response.status).toBe(401)
    expect(read).not.toHaveBeenCalled()
    expect((await client.query('SELECT revoked_at FROM page_studio_login_sessions WHERE role=\'client\'')).rows[0].revoked_at).not.toBeNull()
  })
})
