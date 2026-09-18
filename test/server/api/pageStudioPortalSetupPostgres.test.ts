import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), queryOne: vi.fn(), access: vi.fn(), portalAccess: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: mocks.transaction, queryOne: mocks.queryOne, queryOneFresh: mocks.queryOne, queryRows: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.portalAccess }))
interface TestEvent { siteId: string, body: unknown }
const globals = globalThis as typeof globalThis & {
  setHeader: (event: unknown, name: string, value: string) => void
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: TestEvent) => string
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.setHeader = vi.fn()
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.siteId
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
const databaseUrl = process.env.PAGE_STUDIO_AUTHORITY_DATABASE_TEST_URL
const siteId = '50000000-0000-4000-8000-000000000901'
const clientId = '20000000-0000-4000-8000-000000000901'
const userId = '30000000-0000-4000-8000-000000000901'
const entitlementId = '40000000-0000-4000-8000-000000000901'
const loginToken = randomUUID()
const loginHash = createHash('sha256').update(loginToken).digest('hex')

describe.runIf(Boolean(databaseUrl))('portal setup isolation and transactions on disposable PostgreSQL', () => {
  const schema = `portal_setup_${randomUUID().replaceAll('-', '')}`
  let db: pg.Client
  let connected = false
  let handler: (event: never) => Promise<unknown>
  let decisionHandler: (event: never) => Promise<unknown>
  const create = (expectedRevision = 0) => handler({ siteId, body: { expectedRevision, setupSource: 'template' } } as never)
  const decide = (expectedRevision: number) => decisionHandler({ siteId, body: { expectedRevision, decision: 'accepted' } } as never)
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connected = true
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID, status TEXT, role TEXT);
      CREATE TABLE client_sessions (token_hash TEXT PRIMARY KEY, client_user_id UUID, expires_at TIMESTAMPTZ);
      CREATE TABLE page_studio_login_sessions (role TEXT, token_hash TEXT, user_id TEXT,
        issued_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, PRIMARY KEY(role, token_hash));
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT,
        effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, pages_per_site_limit INTEGER, active_site_limit INTEGER,
        plan_metadata JSONB, portal_creation_enabled BOOLEAN DEFAULT TRUE);
      CREATE TABLE page_studio_site_memberships (tenant_id TEXT, client_id UUID, site_id UUID, user_id UUID, role TEXT);
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID,
        name TEXT, starter_version TEXT, status TEXT, UNIQUE (tenant_id, client_id, id));
    `)
    await db.query(readFileSync(new URL('../../../server/database/migrations/415_page_studio_setup_proposals.sql', import.meta.url), 'utf8'))
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
    await db.query('INSERT INTO client_users VALUES ($1, $2, \'active\', \'manager\')', [userId, clientId])
    await db.query(`INSERT INTO page_studio_entitlements (id, tenant_id, client_id, status, effective_from, effective_until, pages_per_site_limit, active_site_limit, plan_metadata) VALUES ($1, 'agency-setup-test', $2, 'trial',
      NOW() - INTERVAL '1 hour', NULL, 15, 1, '{"allowedModules":["business-content","bookings","enquiries"]}')`, [entitlementId, clientId])
    await db.query(`INSERT INTO page_studio_sites VALUES ($1, 'agency-setup-test', $2, $3, 'Agency Limo Fixture', 'limousine-v1', 'draft')`, [siteId, clientId, entitlementId])
    await db.query(`INSERT INTO page_studio_site_memberships VALUES ('agency-setup-test', $1, $2, $3, 'editor')`, [clientId, siteId, userId])
    await db.query(`
      ALTER TABLE page_studio_sites ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE page_studio_sites ADD COLUMN route TEXT UNIQUE;
      ALTER TABLE page_studio_sites ADD COLUMN created_by UUID;
      ALTER TABLE page_studio_sites ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE page_studio_sites ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE page_studio_site_memberships ADD UNIQUE (site_id, user_id);
      CREATE TABLE page_studio_audit_events (tenant_id TEXT, client_id UUID, site_id UUID, actor_id TEXT,
        actor_role TEXT, action TEXT, resource_type TEXT, resource_id TEXT, metadata JSONB);
    `)
    mocks.access.mockResolvedValue({ tenantId: 'agency-setup-test', user: { id: userId } })
    mocks.queryOne.mockImplementation(async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0] ?? null)
    mocks.transaction.mockImplementation(async (callback: (client: pg.Client) => Promise<unknown>) => {
      const client = new pg.Client({ connectionString: databaseUrl })
      await client.connect()
      try {
        await client.query('BEGIN')
        await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
        const value = await callback(client)
        await client.query('COMMIT')
        return value
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        await client.end()
      }
    })
    handler = (await import('~~/server/api/portal/page-studio/sites/[siteId]/setup-proposal.post')).default
    decisionHandler = (await import('~~/server/api/agency/page-studio/setup-proposals/[siteId]/decision.post')).default
  })
  beforeEach(async () => {
    mocks.portalAccess.mockResolvedValue({ clientId, id: userId, role: 'manager' })
    await db.query('DELETE FROM page_studio_login_sessions')
    await db.query('DELETE FROM client_sessions')
    await db.query('INSERT INTO client_sessions VALUES ($1,$2,NOW() + INTERVAL \'1 hour\')', [loginHash, userId])
    await db.query('UPDATE client_users SET status=\'active\', role=\'manager\'')
    await db.query('UPDATE page_studio_site_memberships SET role=\'editor\'')
    await db.query('UPDATE page_studio_entitlements SET portal_creation_enabled=TRUE')
    await db.query('DELETE FROM page_studio_setup_proposals')
    await db.query('DELETE FROM page_studio_site_memberships WHERE site_id <> $1', [siteId])
    await db.query('DELETE FROM page_studio_sites WHERE id <> $1', [siteId])
    await db.query('DELETE FROM page_studio_audit_events')
    await db.query('UPDATE page_studio_entitlements SET active_site_limit=1, pages_per_site_limit=15')

    await db.query('UPDATE page_studio_entitlements SET effective_until=NULL')
  })
  afterAll(async () => {
    if (!connected) return
    try {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await db.end()
    }
  })
  it('serializes concurrent first proposals and persists one review-required revision', async () => {
    const results = await Promise.allSettled([create(), create()])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ statusCode: 409 })
    const rows = (await db.query('SELECT revision, status, created_by, reviewed_by, plan FROM page_studio_setup_proposals')).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ revision: 1, status: 'proposed', created_by: userId, reviewed_by: null, plan: { requiresAgencyReview: true } })
  })
  it('keeps prior revisions and rejects stale edits and edits after acceptance', async () => {
    await create()
    await create(1)
    await expect(create(1)).rejects.toMatchObject({ statusCode: 409 })
    await db.query('UPDATE page_studio_setup_proposals SET status=\'accepted\' WHERE revision=2')
    await expect(create(2)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT revision FROM page_studio_setup_proposals ORDER BY revision')).rows).toEqual([{ revision: 1 }, { revision: 2 }])
  })
  it('does not write a proposal after entitlement expiry', async () => {
    await db.query('UPDATE page_studio_entitlements SET effective_until=NOW() - INTERVAL \'1 second\'')
    await expect(create()).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_setup_proposals')).rows[0].count).toBe(0)
  })
  it('rejects approval of a superseded revision without changing either proposal', async () => {
    await create()
    await create(1)
    await expect(decide(1)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT revision, status FROM page_studio_setup_proposals ORDER BY revision')).rows)
      .toEqual([{ revision: 1, status: 'proposed' }, { revision: 2, status: 'proposed' }])
  })
  it('serializes approval against a concurrent revision so only one wins', async () => {
    await create()
    const results = await Promise.allSettled([decide(1), create(1)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ statusCode: 409 })
    const rows = (await db.query('SELECT revision, status FROM page_studio_setup_proposals ORDER BY revision')).rows
    expect(rows).toEqual(rows.length === 1
      ? [{ revision: 1, status: 'accepted' }]
      : [{ revision: 1, status: 'proposed' }, { revision: 2, status: 'proposed' }])
  })
  it('does not read or change another client website, even with the same signed-in user ID', async () => {
    await create()
    mocks.portalAccess.mockResolvedValue({ clientId: '20000000-0000-4000-8000-000000000902', id: userId, role: 'admin' })
    const read = (await import('~~/server/api/portal/page-studio/sites/[siteId]/setup-proposal.get')).default
    await expect(read({ siteId, context: {} } as never)).rejects.toMatchObject({ statusCode: 404 })
    await expect(create(1)).rejects.toMatchObject({ statusCode: 404 })
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_setup_proposals')).rows[0].count).toBe(1)
  })
  it('permits a viewer membership to read but never revise', async () => {
    await create()
    await db.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
    const read = (await import('~~/server/api/portal/page-studio/sites/[siteId]/setup-proposal.get')).default
    await expect(read({ siteId, context: {} } as never)).resolves.toMatchObject({ canEdit: false, proposal: { revision: 1 }, serviceAvailable: false })
    await expect(create(1)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('blocks setup when customer creation is disabled', async () => {
    await db.query('UPDATE page_studio_entitlements SET portal_creation_enabled=FALSE')
    await expect(create()).rejects.toMatchObject({ statusCode: 403 })
  })
  it('blocks reads and edits after site membership is removed', async () => {
    await create()
    await db.query('UPDATE page_studio_site_memberships SET user_id=$1', ['30000000-0000-4000-8000-000000000902'])
    try {
      const read = (await import('~~/server/api/portal/page-studio/sites/[siteId]/setup-proposal.get')).default
      await expect(read({ siteId, context: {} } as never)).rejects.toMatchObject({ statusCode: 404 })
      await expect(create(1)).rejects.toMatchObject({ statusCode: 404 })
    } finally { await db.query('UPDATE page_studio_site_memberships SET user_id=$1', [userId]) }
  })
  async function createWebsite(route = 'new-limo') {
    const { createPageStudioSite } = await import('~~/server/utils/pageStudio/sites')
    return createPageStudioSite({ actorId: userId, actorRole: 'client', clientId, portalUserId: userId,
      tenantId: 'agency-setup-test', name: 'New Limo', route, starterVersion: 'limousine-v1',
      setup: { setupSource: 'chat', setupBrief: 'Airport transfers with booking enquiries' } })
  }
  it('atomically saves the customer website, editor membership and first review proposal', async () => {
    await db.query('UPDATE page_studio_entitlements SET active_site_limit=2')
    const site = await createWebsite()
    expect((await db.query('SELECT source, brief, revision, status, created_by, plan FROM page_studio_setup_proposals WHERE site_id=$1', [site.id])).rows)
      .toEqual([expect.objectContaining({ source: 'chat', brief: 'Airport transfers with booking enquiries', revision: 1,
        status: 'proposed', created_by: userId, plan: expect.objectContaining({ requiresAgencyReview: true }) })])
    expect((await db.query('SELECT user_id, role FROM page_studio_site_memberships WHERE site_id=$1', [site.id])).rows)
      .toEqual([{ user_id: userId, role: 'editor' }])
  })
  it('serializes concurrent customer creation against the last available site allowance', async () => {
    await db.query('UPDATE page_studio_entitlements SET active_site_limit=2')
    const results = await Promise.allSettled([createWebsite('first-limo'), createWebsite('second-limo')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'ENTITLEMENT_LIMIT_REACHED' })
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_setup_proposals')).rows[0].count).toBe(1)
  })
  it('rolls back the website and membership if proposal storage fails', async () => {
    await db.query('UPDATE page_studio_entitlements SET active_site_limit=2')
    await db.query(`ALTER TABLE page_studio_setup_proposals ADD CONSTRAINT reject_fixture CHECK (brief <> 'Airport transfers with booking enquiries')`)
    try {
      await expect(createWebsite()).rejects.toMatchObject({ code: '23514' })
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_sites')).rows[0].count).toBe(1)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_site_memberships')).rows[0].count).toBe(1)
      expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events')).rows[0].count).toBe(0)
    } finally { await db.query('ALTER TABLE page_studio_setup_proposals DROP CONSTRAINT reject_fixture') }
  })
  it('rejects a fresh role downgrade or a proposal outside page limits before saving a website', async () => {
    await db.query('UPDATE page_studio_entitlements SET active_site_limit=2, pages_per_site_limit=1')
    await expect(createWebsite()).rejects.toMatchObject({ code: 'SETUP_ENTITLEMENT_EXCEEDED' })
    await db.query('UPDATE page_studio_entitlements SET pages_per_site_limit=15')
    await db.query(`UPDATE client_users SET role='viewer'`)
    await expect(createWebsite()).rejects.toMatchObject({ code: 'PORTAL_USER_OUT_OF_SCOPE' })
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_sites')).rows[0].count).toBe(1)
  })

  function provisioningEvent() {
    let retained: unknown = null
    const binding = {
      readProvisioning: vi.fn(async () => retained),
      createProvisioning: vi.fn(async (job) => {
        retained = job
        return job
      })
    }
    const req = new IncomingMessage(new Socket())
    req.method = 'POST'
    req.url = '/test/provision'
    req.headers = { authorization: `Bearer ${loginToken}` }
    const event = createEvent(req, new ServerResponse(req))
    event.context.cloudflare = { env: { PAGE_STUDIO_PROVISIONER: binding, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging' } }
    return Object.assign(event, { siteId, body: { expectedRevision: 1 }, binding })
  }
  it('creates one immutable customer-owned job from the accepted SQL proposal across retries', async () => {
    await create()
    await decide(1)
    const provision = (await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')).default
    const event = provisioningEvent()
    const first = await provision(event as never)
    expect(await provision(event as never)).toEqual(first)
    expect(first).toEqual({ provisioning: { phase: 'requested', updatedAt: expect.any(String) } })
    expect(event.binding.createProvisioning).toHaveBeenCalledOnce()
    expect(event.binding.createProvisioning.mock.calls[0][0]).toMatchObject({
      actor: { kind: 'client-user', userId, loginSessionHash: loginHash },
      scope: { tenantId: 'agency-setup-test', clientId, businessId: clientId, siteId, environment: 'staging' },
      setup: { proposalRevision: 1 }
    })
  })
  it.each([
    'DELETE FROM client_sessions',
    'UPDATE client_sessions SET expires_at=NOW() - INTERVAL \'1 second\''
  ])('denies provisioning when the native login is unavailable: %s', async (sql) => {
    await create()
    await decide(1)
    await db.query(sql)
    const provision = (await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')).default
    const event = provisioningEvent()
    await expect(provision(event as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(event.binding.createProvisioning).not.toHaveBeenCalled()
    expect(event.binding.readProvisioning).not.toHaveBeenCalled()
  })
  it.each([
    'UPDATE client_users SET status=\'inactive\'',
    'UPDATE client_users SET role=\'viewer\'',
    'UPDATE page_studio_entitlements SET portal_creation_enabled=FALSE',
    'UPDATE page_studio_entitlements SET effective_until=NOW() - INTERVAL \'1 second\''
  ])('denies fresh authority revoked after approval: %s', async (sql) => {
    await create()
    await decide(1)
    await db.query(sql)
    const provision = (await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')).default
    const event = provisioningEvent()
    await expect(provision(event as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(event.binding.createProvisioning).not.toHaveBeenCalled()
    expect(event.binding.readProvisioning).not.toHaveBeenCalled()
  })
  it('cannot provision another client website using a valid but foreign portal session', async () => {
    await create()
    await decide(1)
    mocks.portalAccess.mockResolvedValue({ clientId: '20000000-0000-4000-8000-000000000902', id: userId, role: 'admin' })
    const provision = (await import('~~/server/api/portal/page-studio/sites/[siteId]/provision.post')).default
    const event = provisioningEvent()
    await expect(provision(event as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(event.binding.readProvisioning).not.toHaveBeenCalled()
    expect(event.binding.createProvisioning).not.toHaveBeenCalled()
  })
})
