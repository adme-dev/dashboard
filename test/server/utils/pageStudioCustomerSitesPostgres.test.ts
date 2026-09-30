import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const ids = { owner: randomUUID(), other: randomUUID(), client: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl))('customer site ownership on disposable PostgreSQL', () => {
  const schema = `customer_sites_${randomUUID().replaceAll('-', '')}`
  let db: pg.Client
  let workspaces: typeof import('~~/server/utils/pageStudio/customerWorkspaces')
  const runTransaction = async <T>(callback: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { await client.end() }
  }
  const workspace = async (identityId = ids.owner) => (await workspaces.createCustomerWorkspace({ identityId, requestId: randomUUID(), name: 'Customer business' }, runTransaction)).workspace.id

  beforeAll(async () => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID REFERENCES agency_clients(id), status TEXT, role TEXT);
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT, UNIQUE (role_id, permission_group));
    `)
    await db.query(migration('402_page_studio_control_plane.sql'))
    await db.query(migration('442_page_studio_customer_workspaces.sql'))
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
  })
  beforeEach(async () => {
    await db.query(`TRUNCATE agency_clients, team_members, page_studio_customer_identities CASCADE`)
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [ids.client])
    await db.query('INSERT INTO team_members VALUES ($1, TRUE)', [ids.staff])
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, verified_at)
      VALUES ($1::uuid, 'studio', $1::uuid::text, NOW()), ($2::uuid, 'studio', $2::uuid::text, NOW())`, [ids.owner, ids.other])
    await db.query(migration(ownershipMigration))
  })
  afterAll(async () => {
    if (!db) return
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  it('backfills without changing client scopes and replays safely', async () => {
    await db.query(migration(ownershipMigration))
    expect((await db.query('SELECT id, agency_client_id, workspace_id FROM page_studio_business_owners')).rows).toEqual([
      { id: ids.client, agency_client_id: ids.client, workspace_id: null }
    ])
    const { rows: [entitlement] } = await db.query(`INSERT INTO page_studio_entitlements (tenant_id, client_id) VALUES ('legacy', $1) RETURNING id`, [ids.client])
    await expect(db.query(`INSERT INTO page_studio_sites (tenant_id, client_id, entitlement_id, name, route, starter_version)
      VALUES ('legacy', $1, $2, 'Existing site', 'existing', 'v1')`, [ids.client, entitlement.id])).resolves.toBeDefined()
    await expect(db.query('DELETE FROM agency_clients WHERE id = $1', [ids.client])).rejects.toMatchObject({ code: '23503' })
  })

  it('registers new legacy clients and preserves deletion of unused clients', async () => {
    const id = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [id])
    expect((await db.query('SELECT agency_client_id FROM page_studio_business_owners WHERE id = $1', [id])).rows[0].agency_client_id).toBe(id)
    await db.query('DELETE FROM agency_clients WHERE id = $1', [id])
    expect((await db.query('SELECT id FROM page_studio_business_owners WHERE id = $1', [id])).rows).toHaveLength(0)
  })

  it('requires exactly one real owner and keeps the ownership immutable', async () => {
    const wid = await workspace()
    const bid = randomUUID()
    await expect(db.query('INSERT INTO page_studio_business_owners (id) VALUES ($1)', [bid])).rejects.toMatchObject({ code: '23514' })
    await expect(db.query('INSERT INTO page_studio_business_owners (id, workspace_id, agency_client_id) VALUES ($1, $2, $3)', [bid, wid, ids.client])).rejects.toMatchObject({ code: '23514' })
    await expect(db.query('INSERT INTO page_studio_business_owners (id, workspace_id) VALUES ($1, $2)', [bid, randomUUID()])).rejects.toMatchObject({ code: '23503' })
    await db.query('INSERT INTO page_studio_business_owners (id, workspace_id) VALUES ($1, $2)', [bid, wid])
    await expect(db.query('UPDATE page_studio_business_owners SET workspace_id = $1 WHERE id = $2', [await workspace(ids.other), bid])).rejects.toThrow('immutable')
    await expect(db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [bid])).rejects.toThrow()
    expect((await db.query('SELECT id FROM agency_clients WHERE id = $1', [bid])).rows).toHaveLength(0)
  })

  it('retains compound entitlement/site isolation for independent businesses', async () => {
    const a = randomUUID(), b = randomUUID()
    await db.query('INSERT INTO page_studio_business_owners (id, workspace_id) VALUES ($1, $2), ($3, $4)', [a, await workspace(), b, await workspace(ids.other)])
    const { rows: [entitlement] } = await db.query(`INSERT INTO page_studio_entitlements (tenant_id, client_id) VALUES ('customer-a', $1) RETURNING id`, [a])
    await expect(db.query(`INSERT INTO page_studio_sites (tenant_id, client_id, entitlement_id, name, route, starter_version)
      VALUES ('customer-a', $1, $2, 'Site', 'site', 'v1')`, [b, entitlement.id])).rejects.toMatchObject({ code: '23503' })
  })

  it.each(['legacy-first', 'standalone-first'])('prevents dual workspace ownership (%s)', async (order) => {
    const wid = await workspace()
    const legacy = () => db.query(`INSERT INTO page_studio_workspace_client_bindings (workspace_id, client_id, tenant_id) VALUES ($1, $2, 'legacy')`, [wid, ids.client])
    const standalone = () => db.query('INSERT INTO page_studio_business_owners (id, workspace_id) VALUES ($1, $2)', [randomUUID(), wid])
    await (order === 'legacy-first' ? legacy() : standalone())
    await expect(order === 'legacy-first' ? standalone() : legacy()).rejects.toThrow('ownership')
  })

  it.each([
    ['READ COMMITTED', 'standalone-first'], ['READ COMMITTED', 'legacy-first'],
    ['REPEATABLE READ', 'standalone-first'], ['REPEATABLE READ', 'legacy-first']
  ])('retains one ownership claim across concurrent %s transactions (%s)', async (isolation, order) => {
    const wid = await workspace()
    const clients = [new pg.Client({ connectionString: databaseUrl }), new pg.Client({ connectionString: databaseUrl })]
    await Promise.all(clients.map(client => client.connect()))
    try {
      for (const client of clients) {
        await client.query(`BEGIN ISOLATION LEVEL ${isolation}`)
        await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
        await client.query('SELECT id FROM page_studio_customer_workspaces WHERE id = $1', [wid])
      }
      const standalone = (client: pg.Client) => client.query('INSERT INTO page_studio_business_owners (workspace_id) VALUES ($1)', [wid])
      const legacy = (client: pg.Client) => client.query(`INSERT INTO page_studio_workspace_client_bindings
        (workspace_id, client_id, tenant_id) VALUES ($1, $2, 'legacy')`, [wid, ids.client])
      await (order === 'standalone-first' ? standalone(clients[0]!) : legacy(clients[0]!))
      const blocked = (order === 'standalone-first' ? legacy(clients[1]!) : standalone(clients[1]!))
        .then(() => ({ accepted: true, code: '' }), error => ({ accepted: false, code: error.code }))
      await clients[0]!.query('COMMIT')
      expect(await blocked).toMatchObject({ accepted: false, code: isolation === 'REPEATABLE READ' ? '40001' : 'P0001' })
      await clients[1]!.query('ROLLBACK')
      const count = await db.query(`SELECT
        (SELECT COUNT(*) FROM page_studio_business_owners WHERE workspace_id = $1)
        + (SELECT COUNT(*) FROM page_studio_workspace_client_bindings WHERE workspace_id = $1) AS claims`, [wid])
      expect(count.rows[0].claims).toBe('1')
    } finally {
      await Promise.all(clients.map(async (client) => {
        await client.query('ROLLBACK')
        await client.end()
      }))
    }
  })

  const previewPolicy = () => ({ approvalId: randomUUID(), approvedBy: ids.staff,
    expiresAt: new Date(Date.now() + 86400_000).toISOString(), pagesPerSiteLimit: 5,
    storageBytesLimit: 104857600, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 1073741824 })
  const siteRequest = async () => ({ workspaceId: await workspace(), identityId: ids.owner,
    requestId: randomUUID(), name: 'Customer website', route: 'customer', starterVersion: 'v1' })
  const createSite = async (input: Awaited<ReturnType<typeof siteRequest>>, policy: unknown = previewPolicy()) => {
    const api = await import('~~/server/utils/pageStudio/customerSites')
    return api.createCustomerPreviewSite(input, { runTransaction, previewPolicy: policy })
  }

  it('creates an unpublished site with explicit limited policy and no fabricated client or portal login', async () => {
    const input = await siteRequest(), policy = previewPolicy()
    const result = await createSite(input, policy)
    expect(result).toMatchObject({ workspaceId: input.workspaceId, replayed: false, site: { status: 'draft', name: input.name } })
    expect(result.businessId).not.toBe(input.workspaceId)
    const { rows: [site] } = await db.query('SELECT * FROM page_studio_sites WHERE id = $1', [result.site.id])
    expect(site).toMatchObject({ client_id: result.businessId, tenant_id: result.tenantId, current_checkpoint_id: null, current_release_id: null })
    const { rows: [entitlement] } = await db.query('SELECT * FROM page_studio_entitlements WHERE id = $1', [site.entitlement_id])
    expect(entitlement).toMatchObject({ status: 'trial', plan_key: 'customer_preview_v1', active_site_limit: 1, pages_per_site_limit: 5,
      storage_bytes_limit: '104857600', monthly_ai_operation_limit: 0, custom_domain_limit: 0, portal_creation_enabled: false })
    expect(entitlement.effective_until.toISOString()).toBe(policy.expiresAt)
    expect((await db.query('SELECT COUNT(*) FROM agency_clients')).rows[0].count).toBe('1')
    expect((await db.query('SELECT COUNT(*) FROM client_users')).rows[0].count).toBe('0')
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_site_requests')).rows[0].count).toBe('1')
  })

  it('reconciles concurrent retries to one site and one unchanged entitlement', async () => {
    const input = await siteRequest(), policy = previewPolicy()
    const results = await Promise.all([createSite(input, policy), createSite(input, policy), createSite(input, policy)])
    expect(new Set(results.map(r => r.site.id)).size).toBe(1)
    expect(results.filter(r => !r.replayed)).toHaveLength(1)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_entitlements')).rows[0].count).toBe('1')
    await expect(createSite({ ...input, name: 'Changed website' }, policy)).rejects.toMatchObject({ code: 'CUSTOMER_SITE_REQUEST_CONFLICT' })
    await expect(createSite(input, { ...policy, monthlyBuildLimit: 50 })).rejects.toMatchObject({ code: 'CUSTOMER_SITE_REQUEST_CONFLICT' })
    await expect(createSite({ ...input, requestId: randomUUID() }, policy)).rejects.toMatchObject({ code: 'CUSTOMER_SITE_LIMIT_REACHED' })
  })

  it.each(['missing-policy', 'expired-policy', 'inactive-approver', 'invalid-limits'])('rejects %s before granting any plan', async (reason) => {
    const input = await siteRequest()
    let policy: unknown = previewPolicy()
    if (reason === 'missing-policy') policy = null
    if (reason === 'expired-policy') policy = { ...previewPolicy(), expiresAt: new Date(Date.now() - 10000).toISOString() }
    if (reason === 'inactive-approver') await db.query('UPDATE team_members SET is_active = FALSE')
    if (reason === 'invalid-limits') policy = { ...previewPolicy(), monthlyBuildLimit: -1 }
    await expect(createSite(input, policy)).rejects.toMatchObject({ code: 'CUSTOMER_SITE_POLICY_REQUIRED' })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_sites')).rows[0].count).toBe('0')
    expect((await db.query('SELECT COUNT(*) FROM page_studio_entitlements')).rows[0].count).toBe('0')
  })

  it.each(['foreign-identity', 'manager', 'revoked', 'expired-membership', 'suspended-workspace', 'suspended-identity', 'unverified'])('rejects %s on creation and on replay', async (reason) => {
    const input = await siteRequest(), policy = previewPolicy()
    const existing = await createSite(input, policy)
    if (reason === 'foreign-identity') input.identityId = ids.other
    if (reason === 'manager') await db.query('UPDATE page_studio_workspace_memberships SET role = \'manager\'')
    if (reason === 'revoked') await db.query('UPDATE page_studio_workspace_memberships SET revoked_at = NOW()')
    if (reason === 'expired-membership') await db.query('UPDATE page_studio_workspace_memberships SET expires_at = NOW() - INTERVAL \'1 second\'')
    if (reason === 'suspended-workspace') await db.query('UPDATE page_studio_customer_workspaces SET status = \'suspended\'')
    if (reason === 'suspended-identity') await db.query('UPDATE page_studio_customer_identities SET status = \'suspended\'')
    if (reason === 'unverified') await db.query('UPDATE page_studio_customer_identities SET verified_at = NULL')
    await expect(createSite(input, policy)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createSite({ ...input, requestId: randomUUID() }, policy)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT id FROM page_studio_sites')).rows).toEqual([{ id: existing.site.id }])
  })

  it.each(['expired', 'suspended', 'archived-site', 'changed-limits'])('does not restore a preview with %s authority', async (reason) => {
    const input = await siteRequest(), policy = previewPolicy()
    await createSite(input, policy)
    if (reason === 'expired') await db.query('UPDATE page_studio_entitlements SET effective_until = NOW() - INTERVAL \'1 second\'')
    if (reason === 'suspended') await db.query('UPDATE page_studio_entitlements SET status = \'suspended\'')
    if (reason === 'archived-site') await db.query('UPDATE page_studio_sites SET status = \'archived\'')
    if (reason === 'changed-limits') await db.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit = 100')
    await expect(createSite(input, policy)).rejects.toMatchObject({ code: 'CUSTOMER_SITE_ACCESS_DENIED' })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_entitlements')).rows[0].count).toBe('1')
  })

  it('uses separate business scopes for two customers and rejects cross-scope receipts', async () => {
    const first = await siteRequest(), second = { ...await siteRequest(), workspaceId: await workspace(ids.other), identityId: ids.other }
    const a = await createSite(first), b = await createSite(second)
    expect(a.businessId).not.toBe(b.businessId)
    expect(a.tenantId).not.toBe(b.tenantId)
    await expect(db.query(`UPDATE page_studio_customer_site_requests SET site_id = $1 WHERE workspace_id = $2`, [b.site.id, first.workspaceId])).rejects.toThrow('append-only')
    const third = await workspace()
    await expect(db.query(`INSERT INTO page_studio_customer_site_requests
      (workspace_id, request_id, actor_identity_id, business_id, tenant_id, site_id, request_payload, preview_policy)
      VALUES ($1, $2, $3, $4, $5, $6, '{}', '{}')`, [third, randomUUID(), ids.owner, b.businessId, b.tenantId, b.site.id])).rejects.toThrow()
  })

  it('rolls back all allocated control-plane records when receipt retention fails', async () => {
    const input = await siteRequest()
    await db.query(`ALTER TABLE page_studio_customer_site_requests ADD CONSTRAINT fixture_failure CHECK (FALSE) NOT VALID`)
    try {
      await expect(createSite(input)).rejects.toThrow()
      expect((await db.query('SELECT COUNT(*) FROM page_studio_sites')).rows[0].count).toBe('0')
      expect((await db.query('SELECT COUNT(*) FROM page_studio_entitlements')).rows[0].count).toBe('0')
      expect((await db.query('SELECT COUNT(*) FROM page_studio_business_owners WHERE workspace_id IS NOT NULL')).rows[0].count).toBe('0')
    } finally { await db.query('ALTER TABLE page_studio_customer_site_requests DROP CONSTRAINT fixture_failure') }
  })

  it('refuses a legacy-bound workspace rather than creating a second business scope', async () => {
    const input = await siteRequest()
    await db.query(`INSERT INTO page_studio_workspace_client_bindings (workspace_id, client_id, tenant_id) VALUES ($1, $2, 'legacy')`, [input.workspaceId, ids.client])
    await expect(createSite(input)).rejects.toMatchObject({ code: 'CUSTOMER_SITE_ACCESS_DENIED' })
  })
})
