import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readPageStudioBusinessContent, writePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContent'

vi.mock('~~/server/utils/db', () => ({ queryOneFresh: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_CONTENT_DATABASE_TEST_URL
const siteId = '10000000-0000-4000-8000-000000000001'
const clientId = '10000000-0000-4000-8000-000000000002'
const entitlementId = '10000000-0000-4000-8000-000000000003'
describe.runIf(Boolean(databaseUrl))('business content authority on disposable PostgreSQL', () => {
  let client: pg.Client
  let connected = false
  const schema = `content_${randomUUID().replaceAll('-', '')}`
  const read = vi.fn().mockResolvedValue(null)
  const write = vi.fn()
  const env = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ROUTER: { readContent: read, writeContent: write } }
  const dependencies = { query: async (sql: string, values: unknown[]) => (await client.query(sql, values)).rows[0] ?? null }
  const run = (tenantId = 'selected') => readPageStudioBusinessContent({ actor: { role: 'agency', actorId: 'staff', tenantId, canEdit: false }, siteId, env }, dependencies)
  const portal = (actorId = 'member') => ({ actor: { role: 'client' as const, actorId, clientId }, siteId, env })
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connected = true
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    await client.query(`CREATE TABLE page_studio_site_memberships (tenant_id TEXT, client_id UUID, site_id UUID, user_id TEXT, role TEXT);
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID, status TEXT);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT, effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, plan_metadata JSONB);`)
    await client.query('INSERT INTO page_studio_site_memberships VALUES (\'selected\', $1, $2, \'member\', \'editor\')', [clientId, siteId])
    await client.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
    await client.query('INSERT INTO page_studio_sites VALUES ($1, \'selected\', $2, $3, \'active\')', [siteId, clientId, entitlementId])
    await client.query('INSERT INTO page_studio_entitlements VALUES ($1, \'selected\', $2, \'trial\', NOW() - INTERVAL \'1 hour\', NOW() + INTERVAL \'1 hour\', $3)', [entitlementId, clientId, { allowedModules: ['bookings'] }])
  })
  beforeEach(async () => {
    read.mockReset().mockResolvedValue(null)
    write.mockReset()
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
        await revoker.query('INSERT INTO page_studio_site_memberships SELECT \'selected\', $1, $2, \'member\', \'editor\' WHERE NOT EXISTS (SELECT 1 FROM page_studio_site_memberships)', [clientId, siteId])
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
    await expect(readPageStudioBusinessContent(portal('other'), dependencies)).rejects.toMatchObject({ statusCode: 403 })
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
})
