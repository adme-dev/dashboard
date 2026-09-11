import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), queryOne: vi.fn(), access: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: mocks.transaction, queryOne: mocks.queryOne }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: mocks.access }))
interface TestEvent { siteId: string, body: unknown }
const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: TestEvent) => string
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getRouterParam = event => event.siteId
globals.readBody = async event => event.body
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
const databaseUrl = process.env.PAGE_STUDIO_AUTHORITY_DATABASE_TEST_URL
const siteId = '50000000-0000-4000-8000-000000000901'
const clientId = '20000000-0000-4000-8000-000000000901'
const userId = '30000000-0000-4000-8000-000000000901'
const entitlementId = '40000000-0000-4000-8000-000000000901'

describe.runIf(Boolean(databaseUrl))('agency setup proposal transactions on disposable PostgreSQL', () => {
  const schema = `agency_setup_${randomUUID().replaceAll('-', '')}`
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
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT,
        effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, pages_per_site_limit INTEGER, active_site_limit INTEGER,
        plan_metadata JSONB);
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID,
        name TEXT, starter_version TEXT, status TEXT, UNIQUE (tenant_id, client_id, id));
    `)
    await db.query(readFileSync(new URL('../../../server/database/migrations/415_page_studio_setup_proposals.sql', import.meta.url), 'utf8'))
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
    await db.query(`INSERT INTO page_studio_entitlements VALUES ($1, 'agency-setup-test', $2, 'trial',
      NOW() - INTERVAL '1 hour', NULL, 15, 1, '{"allowedModules":["business-content","bookings","enquiries"]}')`, [entitlementId, clientId])
    await db.query(`INSERT INTO page_studio_sites VALUES ($1, 'agency-setup-test', $2, $3, 'Agency Limo Fixture', 'limousine-v1', 'draft')`, [siteId, clientId, entitlementId])
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
    handler = (await import('~~/server/api/agency/page-studio/sites/[siteId]/setup-proposal.post')).default
    decisionHandler = (await import('~~/server/api/agency/page-studio/setup-proposals/[siteId]/decision.post')).default
  })
  beforeEach(async () => {
    await db.query('DELETE FROM page_studio_setup_proposals')
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
})
