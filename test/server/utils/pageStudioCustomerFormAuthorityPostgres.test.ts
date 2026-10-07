import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')

describe.runIf(Boolean(databaseUrl))('current native customer form authority on disposable PostgreSQL', () => {
  const schema = `customer_forms_${randomUUID().replaceAll('-', '')}`
  const staffId = randomUUID()
  let db: pg.Client
  let signup: typeof import('~~/server/utils/pageStudio/customerSignup')
  let workspaces: typeof import('~~/server/utils/pageStudio/customerWorkspaces')
  let sites: typeof import('~~/server/utils/pageStudio/customerSites')
  let owner: { sessionToken: string, identityId: string }
  let member: { sessionToken: string, identityId: string }
  let fixture: { workspaceId: string, businessId: string, tenantId: string, site: { id: string } }
  const runTransaction = async <T>(callback: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { await client.end() }
  }
  const login = async (email: string, mode: 'signup' | 'signin' = 'signup') => {
    const delivery = await signup.requestCustomerSignIn({ email, name: 'Native customer', mode, acceptedTerms: true }, 'preview-v1', runTransaction)
    return signup.verifyCustomerSignIn(delivery!.token, runTransaction)
  }
  const authorize = async (writing = false, token = owner.sessionToken, overrides: Record<string, unknown> = {}) => {
    const { resolveCustomerFormAuthority } = await import('~~/server/utils/pageStudio/customerFormAuthority')
    return resolveCustomerFormAuthority({ sessionToken: token, siteId: fixture.site.id, environment: 'staging', writing, ...overrides }, { runTransaction })
  }
  const role = (value: string) => db.query('UPDATE page_studio_workspace_memberships SET role = $1 WHERE workspace_id = $2 AND identity_id = $3', [value, fixture.workspaceId, member.identityId])
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
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
    for (const name of ['402_page_studio_control_plane.sql', '442_page_studio_customer_workspaces.sql',
      '443_page_studio_customer_signup.sql', '444_page_studio_customer_site_ownership.sql']) await db.query(migration(name))
    signup = await import('~~/server/utils/pageStudio/customerSignup')
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
    sites = await import('~~/server/utils/pageStudio/customerSites')
  })
  beforeEach(async () => {
    await db.query('TRUNCATE agency_clients, team_members, page_studio_customer_identities CASCADE')
    await db.query('INSERT INTO team_members VALUES ($1, TRUE)', [staffId])
    owner = await login('owner@example.test')
    member = await login('member@example.test')
    const workspace = await workspaces.createCustomerWorkspace({ identityId: owner.identityId, requestId: randomUUID(), name: 'Flowers' }, runTransaction)
    fixture = await sites.createCustomerPreviewSite({ workspaceId: workspace.workspace.id, identityId: owner.identityId,
      requestId: randomUUID(), name: 'Flowers preview', route: 'flowers', starterVersion: 'floristry-v1' }, {
      runTransaction, previewPolicy: { approvalId: randomUUID(), approvedBy: staffId,
        expiresAt: new Date(Date.now() + 86400_000).toISOString(), pagesPerSiteLimit: 5,
        storageBytesLimit: 104857600, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 1073741824 }
    })
    await db.query(`INSERT INTO page_studio_workspace_memberships (workspace_id, identity_id, role) VALUES ($1, $2, 'editor')`, [fixture.workspaceId, member.identityId])
  })
  afterAll(async () => {
    if (!db) return
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  // Removing current-role checks or deriving scope from supplied pins must break these cases.
  it('derives native scope and actor without returning login material or requiring setup completion', async () => {
    const authority = await authorize(true)
    const account = await signup.readCustomerSession(owner.sessionToken, runTransaction)
    expect(authority).toEqual({ workspaceId: fixture.workspaceId,
      scope: { businessId: fixture.businessId, clientId: fixture.businessId, tenantId: fixture.tenantId, siteId: fixture.site.id, environment: 'staging' },
      actor: { kind: 'customer-user', userId: owner.identityId, accountId: account.accountId }, canEdit: true })
    expect(JSON.stringify(authority)).not.toContain(owner.sessionToken)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_customer_setup_drafts')).rows[0].count).toBe('0')
    expect((await db.query('SELECT COUNT(*) FROM client_users')).rows[0].count).toBe('0')
    expect((await db.query('SELECT COUNT(*) FROM agency_clients')).rows[0].count).toBe('0')
  })
  it.each(['owner', 'manager', 'editor'])('allows a current %s member to read and write', async (value) => {
    await role(value)
    expect(await authorize(false, member.sessionToken)).toMatchObject({ canEdit: true, actor: { userId: member.identityId } })
    expect(await authorize(true, member.sessionToken)).toMatchObject({ canEdit: true })
  })
  it('allows viewer reads and rejects viewer writes', async () => {
    await role('viewer')
    expect(await authorize(false, member.sessionToken)).toMatchObject({ canEdit: false })
    await expect(authorize(true, member.sessionToken)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('uses a new current login after revocation of the original login', async () => {
    const current = await login('owner@example.test', 'signin')
    await signup.revokeCustomerSession(owner.sessionToken, runTransaction)
    await expect(authorize(true, current.sessionToken)).resolves.toMatchObject({ actor: { userId: owner.identityId } })
    await expect(authorize(true)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('admits the current editor when the immutable setup actor and old login are inactive', async () => {
    await signup.revokeCustomerSession(owner.sessionToken, runTransaction)
    await db.query(`UPDATE page_studio_customer_accounts SET status = 'suspended' WHERE identity_id = $1`, [owner.identityId])
    await db.query(`UPDATE page_studio_customer_identities SET status = 'suspended' WHERE id = $1`, [owner.identityId])
    await db.query('UPDATE page_studio_workspace_memberships SET revoked_at = clock_timestamp() WHERE identity_id = $1', [owner.identityId])
    await expect(authorize(true, member.sessionToken)).resolves.toMatchObject({ actor: { userId: member.identityId }, canEdit: true })
    expect((await db.query('SELECT actor_identity_id FROM page_studio_customer_site_requests')).rows[0].actor_identity_id).toBe(owner.identityId)
  })
  it.each(['missing-site', 'other-workspace', 'same-business-unretained-site', 'legacy-site'])('rejects %s instead of adopting caller scope', async (reason) => {
    let siteId = randomUUID()
    if (reason === 'other-workspace') {
      const workspace = await workspaces.createCustomerWorkspace({ identityId: member.identityId, requestId: randomUUID(), name: 'Other' }, runTransaction)
      const result = await sites.createCustomerPreviewSite({ identityId: member.identityId, workspaceId: workspace.workspace.id, requestId: randomUUID(), name: 'Other', route: 'other', starterVersion: 'v1' }, {
        runTransaction, previewPolicy: (await db.query('SELECT preview_policy FROM page_studio_customer_site_requests WHERE site_id = $1', [fixture.site.id])).rows[0].preview_policy
      })
      siteId = result.site.id
    }
    if (reason === 'same-business-unretained-site') {
      const result = await db.query(`INSERT INTO page_studio_sites (tenant_id, client_id, entitlement_id, name, route, starter_version)
        SELECT tenant_id, client_id, entitlement_id, 'Unretained', 'unretained', starter_version FROM page_studio_sites WHERE id = $1 RETURNING id`, [fixture.site.id])
      siteId = result.rows[0].id
    }
    if (reason === 'legacy-site') {
      const clientId = randomUUID()
      await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
      const entitlement = await db.query(`INSERT INTO page_studio_entitlements (tenant_id, client_id) VALUES ('legacy', $1) RETURNING id`, [clientId])
      const site = await db.query(`INSERT INTO page_studio_sites (tenant_id, client_id, entitlement_id, name, route, starter_version)
        VALUES ('legacy', $1, $2, 'Legacy', 'legacy', 'v1') RETURNING id`, [clientId, entitlement.rows[0].id])
      siteId = site.rows[0].id
      await db.query(`INSERT INTO page_studio_workspace_client_bindings (workspace_id, tenant_id, client_id)
        VALUES ($1, 'legacy', $2)`, [(await workspaces.createCustomerWorkspace({ identityId: owner.identityId, requestId: randomUUID(), name: 'Legacy' }, runTransaction)).workspace.id, clientId])
    }
    await expect(authorize(false, owner.sessionToken, { siteId })).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['sessionToken', 'siteId', 'environment', 'writing', 'workspaceId', 'identityId', 'businessId', 'tenantId', 'clientId', 'policy'])('rejects invalid or caller-supplied %s', async (key) => {
    const replacements: Record<string, unknown> = { sessionToken: 'portal-token', siteId: 'invalid', environment: 'production', writing: 'true' }
    await expect(authorize(false, owner.sessionToken, { [key]: replacements[key] ?? randomUUID() })).rejects.toMatchObject({ statusCode: 400 })
  })
  it.each([
    ['expired-session', 'UPDATE page_studio_customer_sessions SET expires_at = clock_timestamp() - INTERVAL \'1 second\'', 401],
    ['revoked-session', 'UPDATE page_studio_customer_sessions SET revoked_at = clock_timestamp()', 401],
    ['inactive-account', 'UPDATE page_studio_customer_accounts SET status = \'suspended\'', 401],
    ['inactive-identity', 'UPDATE page_studio_customer_identities SET status = \'suspended\'', 401],
    ['unverified-identity', 'UPDATE page_studio_customer_identities SET verified_at = NULL', 401],
    ['future-verification', 'UPDATE page_studio_customer_identities SET verified_at = clock_timestamp() + INTERVAL \'1 day\'', 401],
    ['wrong-native-subject', 'UPDATE page_studio_customer_identities SET subject = \'foreign-\' || id::text', 401],
    ['inactive-workspace', 'UPDATE page_studio_customer_workspaces SET status = \'suspended\'', 403],
    ['archived-workspace', 'UPDATE page_studio_customer_workspaces SET status = \'archived\'', 403],
    ['revoked-membership', 'UPDATE page_studio_workspace_memberships SET revoked_at = clock_timestamp()', 403],
    ['expired-membership', 'UPDATE page_studio_workspace_memberships SET expires_at = clock_timestamp() - INTERVAL \'1 second\'', 403],
    ['expired-entitlement', 'UPDATE page_studio_entitlements SET effective_until = clock_timestamp() - INTERVAL \'1 second\'', 403],
    ['future-entitlement', 'UPDATE page_studio_entitlements SET effective_from = clock_timestamp() + INTERVAL \'1 hour\', effective_until = clock_timestamp() + INTERVAL \'2 days\'', 403],
    ['cancelled-entitlement', 'UPDATE page_studio_entitlements SET status = \'cancelled\'', 403],
    ['mismatched-plan', 'UPDATE page_studio_entitlements SET plan_key = \'other\'', 403],
    ['mismatched-expiry', 'UPDATE page_studio_entitlements SET effective_until = effective_until + INTERVAL \'1 hour\'', 403],
    ['mismatched-limits', 'UPDATE page_studio_entitlements SET pages_per_site_limit = pages_per_site_limit + 1', 403],
    ['mismatched-metadata', `UPDATE page_studio_entitlements SET plan_metadata = plan_metadata || '{"publishingEnabled":true}'::jsonb`, 403],
    ['inactive-approver', 'UPDATE team_members SET is_active = FALSE', 403],
    ['archived-site', 'UPDATE page_studio_sites SET status = \'archived\'', 403]
  ])('freshly denies %s after previously valid authority', async (_reason, sql, statusCode) => {
    await expect(authorize(true)).resolves.toMatchObject({ canEdit: true })
    await db.query(sql as string)
    await expect(authorize(true)).rejects.toMatchObject({ statusCode })
    await expect(authorize(false)).rejects.toMatchObject({ statusCode })
  })
  it('catches role revocation on the next authority check around awaited work', async () => {
    await expect(authorize(true, member.sessionToken)).resolves.toMatchObject({ canEdit: true })
    await role('viewer')
    await expect(authorize(true, member.sessionToken)).rejects.toMatchObject({ statusCode: 403 })
    expect(await authorize(false, member.sessionToken)).toMatchObject({ canEdit: false })
  })
  it.each(['session', 'membership'])('rechecks %s expiry after waiting for a site lock', async (reason) => {
    const holder = new pg.Client({ connectionString: databaseUrl })
    const reader = new pg.Client({ connectionString: databaseUrl })
    await Promise.all([holder.connect(), reader.connect()])
    let outcome: Promise<PromiseSettledResult<unknown>[]> | undefined
    try {
      for (const client of [holder, reader]) {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
        await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      }
      const holderPid = (await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id
      const readerPid = (await reader.query('SELECT pg_backend_pid() AS id')).rows[0].id
      if (reason === 'session') await db.query(`UPDATE page_studio_customer_sessions SET expires_at = clock_timestamp() + INTERVAL '700 milliseconds'`)
      if (reason === 'membership') await db.query(`UPDATE page_studio_workspace_memberships SET expires_at = clock_timestamp() + INTERVAL '700 milliseconds'`)
      await holder.query('SELECT id FROM page_studio_sites WHERE id = $1 FOR UPDATE', [fixture.site.id])
      const { resolveCustomerFormAuthority } = await import('~~/server/utils/pageStudio/customerFormAuthority')
      outcome = Promise.allSettled([resolveCustomerFormAuthority({ sessionToken: owner.sessionToken,
        siteId: fixture.site.id, environment: 'staging', writing: true }, { runTransaction: callback => callback(reader) })])
      await vi.waitFor(async () => {
        expect((await db.query('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', [readerPid, holderPid])).rows[0].blocked).toBe(true)
      }, { timeout: 3000, interval: 10 })
      const query = reason === 'session'
        ? 'SELECT BOOL_AND(expires_at < clock_timestamp()) AS expired FROM page_studio_customer_sessions'
        : 'SELECT BOOL_AND(expires_at < clock_timestamp()) AS expired FROM page_studio_workspace_memberships'
      await vi.waitFor(async () => {
        expect((await db.query(query)).rows[0].expired).toBe(true)
      }, { timeout: 3000, interval: 10 })
      await holder.query('COMMIT')
      expect((await outcome)[0]).toMatchObject({ status: 'rejected', reason: { statusCode: 403 } })
    } finally {
      await holder.query('ROLLBACK')
      await outcome
      await reader.query('ROLLBACK')
      await Promise.all([holder.end(), reader.end()])
    }
  })
})
