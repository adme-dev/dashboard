import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listScopedPageStudioBookings } from '~~/server/utils/pageStudio/bookingsBinding'

vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_BOOKINGS_DATABASE_TEST_URL
const siteId = '10000000-0000-4000-8000-000000000001'
const clientId = '10000000-0000-4000-8000-000000000002'
const entitlementId = '10000000-0000-4000-8000-000000000003'
describe.runIf(Boolean(databaseUrl))('booking authority on disposable PostgreSQL', () => {
  let client: pg.Client
  let connected = false
  const schema = `bookings_${randomUUID().replaceAll('-', '')}`
  const list = vi.fn().mockResolvedValue([])
  const run = (tenantId = 'selected') => listScopedPageStudioBookings({ actor: { role: 'agency', actorId: 'staff', tenantId, canApprove: false }, siteId, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: { listScopedBookings: list, applyScopedBookingCommand: vi.fn() } } }, { limit: 10 }, { query: async (sql, values) => (await client.query(sql, values)).rows[0] ?? null })
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connected = true
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    await client.query(`CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID, status TEXT);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT, effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, plan_metadata JSONB);`)
    await client.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
    await client.query('INSERT INTO page_studio_sites VALUES ($1, \'selected\', $2, $3, \'active\')', [siteId, clientId, entitlementId])
    await client.query('INSERT INTO page_studio_entitlements VALUES ($1, \'selected\', $2, \'trial\', NOW() - INTERVAL \'1 hour\', NOW() + INTERVAL \'1 hour\', $3)', [entitlementId, clientId, { allowedModules: ['bookings'] }])
  })
  beforeEach(async () => {
    await client.query('BEGIN')
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
    await expect(run()).resolves.toEqual([])
    await expect(run('foreign')).rejects.toMatchObject({ statusCode: 404 })
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
})
