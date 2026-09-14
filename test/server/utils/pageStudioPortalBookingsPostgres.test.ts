import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPortalPageStudioBooking, listPortalPageStudioBookings } from '~~/server/utils/pageStudio/portalBookings'

vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_BOOKINGS_DATABASE_TEST_URL
const siteId = '10000000-0000-4000-8000-000000000001'
const clientId = '10000000-0000-4000-8000-000000000002'
const entitlementId = '10000000-0000-4000-8000-000000000003'
const userId = '10000000-0000-4000-8000-000000000004'
describe.runIf(Boolean(databaseUrl))('portal booking authority on disposable PostgreSQL', () => {
  let client: pg.Client
  let connected = false
  const schema = `portal_bookings_${randomUUID().replaceAll('-', '')}`
  const list = vi.fn().mockResolvedValue([])
  const create = vi.fn().mockImplementation(async (_scope, booking) => ({ booking, version: 0, processedCommands: [] }))
  const request = (selectedClient = clientId, selectedUser = userId) => ({ actor: { userId: selectedUser, clientId: selectedClient, role: 'manager' }, siteId, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: { listScopedBookings: list, readScopedBooking: vi.fn().mockResolvedValue(null), createScopedBooking: create } } })
  const dependencies = { query: async (sql: string, values: unknown[]) => (await client.query(sql, values)).rows[0] ?? null }
  const read = (selectedClient = clientId, selectedUser = userId) => listPortalPageStudioBookings(request(selectedClient, selectedUser), { limit: 10 }, dependencies)
  const write = () => createPortalPageStudioBooking(request(), { requestKey: randomUUID(), customer: { name: 'Synthetic Customer', email: 'test@example.invalid', phone: '0400000000' }, pickup: 'A', dropoff: 'B', travelAt: '2026-12-01T00:00:00Z', durationMinutes: 60, passengers: 2, occasion: '' }, dependencies)
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connected = true
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    await client.query(`CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID, role TEXT, status TEXT);
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID, status TEXT);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT, effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, plan_metadata JSONB);
      CREATE TABLE page_studio_site_memberships (tenant_id TEXT, client_id UUID, site_id UUID, user_id UUID, role TEXT);`)
    await client.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
    await client.query('INSERT INTO client_users VALUES ($1, $2, \'manager\', \'active\')', [userId, clientId])
    await client.query('INSERT INTO page_studio_sites VALUES ($1, \'selected\', $2, $3, \'active\')', [siteId, clientId, entitlementId])
    await client.query('INSERT INTO page_studio_entitlements VALUES ($1, \'selected\', $2, \'trial\', NOW() - INTERVAL \'1 hour\', NOW() + INTERVAL \'1 hour\', $3)', [entitlementId, clientId, { allowedModules: ['bookings'] }])
    await client.query('INSERT INTO page_studio_site_memberships VALUES (\'selected\', $1, $2, $3, \'editor\')', [clientId, siteId, userId])
  })
  beforeEach(async () => {
    vi.clearAllMocks()
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
  it('derives tenant from the authenticated client website and denies another client or user', async () => {
    await expect(read()).resolves.toEqual([])
    await expect(write()).resolves.toMatchObject({ replayed: false })
    expect(create.mock.calls[0]![0]).toEqual({ tenantId: 'selected', clientId, businessId: clientId, siteId, environment: 'staging' })
    await expect(read(randomUUID())).rejects.toMatchObject({ statusCode: 404 })
    await expect(read(clientId, randomUUID())).rejects.toMatchObject({ statusCode: 404 })
  })
  it.each(['agency_clients', 'client_users'])('immediately denies deactivated %s before routing', async (table) => {
    await client.query(table === 'agency_clients' ? 'UPDATE agency_clients SET is_active=FALSE' : 'UPDATE client_users SET status=\'inactive\'')
    await expect(write()).rejects.toMatchObject({ statusCode: 404 })
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects expired and future access periods', async () => {
    await client.query('UPDATE page_studio_entitlements SET effective_until=NOW() - INTERVAL \'1 minute\'')
    await expect(write()).rejects.toMatchObject({ statusCode: 403 })
    await client.query('UPDATE page_studio_entitlements SET effective_until=NULL, effective_from=NOW() + INTERVAL \'1 hour\'')
    await expect(read()).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['tenant_id', 'client_id', 'site_id', 'user_id'])('requires exact membership %s', async (column) => {
    await client.query(`UPDATE page_studio_site_memberships SET ${column}=$1`, [column === 'tenant_id' ? 'foreign' : randomUUID()])
    await expect(write()).rejects.toMatchObject({ statusCode: 404 })
    expect(create).not.toHaveBeenCalled()
  })
  it('preserves viewer read access while denying mutation after membership downgrade', async () => {
    await client.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
    await expect(read()).resolves.toEqual([])
    await expect(write()).rejects.toMatchObject({ statusCode: 403 })
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects fresh portal-user role downgrade even with a cached manager actor', async () => {
    await client.query('UPDATE client_users SET role=\'viewer\'')
    await expect(write()).rejects.toMatchObject({ statusCode: 403 })
    expect(create).not.toHaveBeenCalled()
  })
  it.each(['client_id', 'tenant_id'])('cannot borrow another entitlement %s', async (column) => {
    await client.query(`UPDATE page_studio_entitlements SET ${column}=$1`, [column === 'tenant_id' ? 'foreign' : randomUUID()])
    await expect(read()).rejects.toMatchObject({ statusCode: 404 })
  })
})
