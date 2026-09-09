import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizePageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningAuthority'
import { dispatchPageStudioProvisioning } from '~~/server/utils/pageStudio/provisioningBinding'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

const reads = vi.hoisted(() => ({ fresh: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: reads.fresh }))
const databaseUrl = process.env.PAGE_STUDIO_AUTHORITY_DATABASE_TEST_URL
const scope = { tenantId: 'authority-test', clientId: '20000000-0000-4000-8000-000000000201', businessId: '20000000-0000-4000-8000-000000000201', siteId: '50000000-0000-4000-8000-000000000201', environment: 'staging' as const }
const userId = '30000000-0000-4000-8000-000000000201'
const entitlementId = '40000000-0000-4000-8000-000000000201'
const request = { requestKey: `page-studio-${scope.siteId}-1`, scope }
const plan = createPageStudioSetupProposal({ businessName: 'Authority Flowers', starterVersion: 'floristry-v1', setupSource: 'template' })

describe.runIf(Boolean(databaseUrl))('provisioning authority on disposable PostgreSQL', () => {
  let client: pg.Client
  let connected = false
  let saved: Awaited<ReturnType<typeof dispatchPageStudioProvisioning>>
  const schema = `authority_${randomUUID().replaceAll('-', '')}`
  const authorize = () => authorizePageStudioProvisioning({ createProvisioning: vi.fn(), readProvisioning: async () => saved }, request)

  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connected = true
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    // Real query execution against the relevant migration columns. Migration/FK
    // coverage lives in pageStudioControlPlaneMigrationPostgres.test.ts.
    await client.query(`
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID, status TEXT, role TEXT);
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID, status TEXT);
      CREATE TABLE page_studio_site_memberships (tenant_id TEXT, client_id UUID, site_id UUID, user_id UUID, role TEXT);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT,
        portal_creation_enabled BOOLEAN, effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ,
        pages_per_site_limit INTEGER, plan_metadata JSONB, active_site_limit INTEGER);
      CREATE TABLE page_studio_setup_proposals (tenant_id TEXT, client_id UUID, site_id UUID,
        revision INTEGER, status TEXT, source TEXT, brief TEXT, plan JSONB);
    `)
    await client.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [scope.clientId])
    await client.query('INSERT INTO client_users VALUES ($1, $2, \'active\', \'manager\')', [userId, scope.clientId])
    await client.query('INSERT INTO page_studio_sites VALUES ($1, $2, $3, $4, \'draft\')', [scope.siteId, scope.tenantId, scope.clientId, entitlementId])
    await client.query('INSERT INTO page_studio_site_memberships VALUES ($1, $2, $3, $4, \'editor\')', [scope.tenantId, scope.clientId, scope.siteId, userId])
    await client.query('INSERT INTO page_studio_entitlements VALUES ($1, $2, $3, \'trial\', TRUE, NOW() - INTERVAL \'1 hour\', NULL, 10, $4, 1)', [entitlementId, scope.tenantId, scope.clientId, { allowedModules: plan.modules }])
    await client.query('INSERT INTO page_studio_setup_proposals VALUES ($1, $2, $3, 1, \'accepted\', \'template\', NULL, $4)', [scope.tenantId, scope.clientId, scope.siteId, plan])
    reads.fresh.mockImplementation(async (sql, values) => (await client.query(sql, values)).rows[0] ?? null)
    saved = await dispatchPageStudioProvisioning({ readProvisioning: async () => null, createProvisioning: async value => value }, { ...request, initiatingUserId: userId, plan, revision: 1, source: 'template', now: '2026-09-09T00:00:00.000Z' })
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
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await client.end()
    }
  })

  it('excludes archived sites and other clients from the site allowance', async () => {
    await client.query('INSERT INTO page_studio_sites SELECT \'50000000-0000-4000-8000-000000000202\',tenant_id,client_id,entitlement_id,\'archived\' FROM page_studio_sites')
    await client.query('INSERT INTO page_studio_sites SELECT \'50000000-0000-4000-8000-000000000203\',tenant_id,\'20000000-0000-4000-8000-000000000202\',entitlement_id,\'draft\' FROM page_studio_sites LIMIT 1')
    await expect(authorize()).resolves.toMatchObject({ userId })
  })

  it.each([
    'UPDATE client_users SET status=\'disabled\'',
    'UPDATE client_users SET role=\'viewer\'',
    'UPDATE agency_clients SET is_active=FALSE',
    'UPDATE page_studio_site_memberships SET role=\'viewer\'',
    'UPDATE page_studio_site_memberships SET tenant_id=\'foreign\'',
    'UPDATE page_studio_site_memberships SET client_id=\'20000000-0000-4000-8000-000000000202\'',
    'UPDATE page_studio_site_memberships SET site_id=\'50000000-0000-4000-8000-000000000202\'',
    'UPDATE page_studio_site_memberships SET user_id=\'30000000-0000-4000-8000-000000000202\'',
    'UPDATE page_studio_sites SET status=\'suspended\'',
    'UPDATE page_studio_entitlements SET status=\'suspended\'',
    'UPDATE page_studio_entitlements SET portal_creation_enabled=FALSE',
    'UPDATE page_studio_entitlements SET effective_until=NOW() - INTERVAL \'1 second\'',
    'UPDATE page_studio_entitlements SET effective_from=NOW() + INTERVAL \'1 hour\'',
    'UPDATE page_studio_entitlements SET pages_per_site_limit=1',
    'UPDATE page_studio_entitlements SET active_site_limit=0',
    'INSERT INTO page_studio_sites SELECT \'50000000-0000-4000-8000-000000000202\',tenant_id,client_id,entitlement_id,\'draft\' FROM page_studio_sites',
    'UPDATE page_studio_entitlements SET plan_metadata=\'{"allowedModules":[]}\'',
    'UPDATE page_studio_setup_proposals SET status=\'rejected\'',
    'INSERT INTO page_studio_setup_proposals SELECT tenant_id,client_id,site_id,2,\'proposed\',source,brief,plan FROM page_studio_setup_proposals',
    'UPDATE page_studio_setup_proposals SET plan=jsonb_set(plan, \'{businessName}\', \'"Changed Flowers"\')'
  ])('immediately denies after %s', async (mutation) => {
    await expect(authorize()).resolves.toMatchObject({ userId })
    await client.query(mutation)
    await expect(authorize()).rejects.toMatchObject({ code: 'PROVISIONING_AUTHORITY_DENIED', statusCode: 403 })
  })
})
