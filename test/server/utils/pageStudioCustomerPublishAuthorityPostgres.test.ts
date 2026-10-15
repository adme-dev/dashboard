import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn(), transactionWithoutRetry: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
if (databaseUrl && !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('A disposable localhost database is required')
}
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')

describe.runIf(Boolean(databaseUrl))('native customer publishing authority on disposable PostgreSQL', () => {
  const schema = `customer_publish_${randomUUID().replaceAll('-', '')}`
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
  const prepare = async (token = owner.sessionToken, siteId = fixture.site.id) => {
    const { prepareCustomerPublishPrincipal } = await import('~~/server/utils/pageStudio/customerPublishAuthority')
    return prepareCustomerPublishPrincipal(token, siteId, { runTransaction })
  }
  const authorize = async (prepared: Awaited<ReturnType<typeof prepare>>, work = async (_db: pg.Client) => 'published') => {
    const { withCustomerPublishAuthority } = await import('~~/server/utils/pageStudio/customerPublishAuthority')
    return withCustomerPublishAuthority(prepared.scope, prepared.principal, work, { runTransaction })
  }
  const enablePlan = () => db.query(`UPDATE page_studio_entitlements SET status='active', plan_key='studio_business',
    custom_domain_limit=1, plan_metadata='{"publishingEnabled":true}'::jsonb`)
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
    await db.query('CREATE TABLE publication_effects (id INTEGER)')
    signup = await import('~~/server/utils/pageStudio/customerSignup')
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
    sites = await import('~~/server/utils/pageStudio/customerSites')
  })
  beforeEach(async () => {
    await db.query('TRUNCATE publication_effects')
    await db.query('TRUNCATE agency_clients, team_members, page_studio_customer_identities CASCADE')
    await db.query('INSERT INTO team_members VALUES ($1, TRUE)', [staffId])
    await db.query('TRUNCATE page_studio_customer_accounts CASCADE')
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

  it('denies the unchanged preview plan without creating publishing capacity', async () => {
    await expect(prepare()).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    expect((await db.query('SELECT custom_domain_limit, plan_metadata FROM page_studio_entitlements')).rows[0])
      .toMatchObject({ custom_domain_limit: 0, plan_metadata: { publishingEnabled: false } })
  })
  it.each(['owner', 'manager'])('derives the exact native %s principal from a real session', async (value) => {
    await enablePlan()
    await role(value)
    const prepared = await prepare(member.sessionToken)
    const account = await signup.readCustomerSession(member.sessionToken, runTransaction)
    expect(prepared.scope).toEqual({ clientId: fixture.businessId, tenantId: fixture.tenantId, siteId: fixture.site.id })
    expect(prepared.principal).toMatchObject({ kind: 'customer', identityId: member.identityId,
      accountId: account.accountId, workspaceId: fixture.workspaceId })
    expect(JSON.stringify(prepared)).not.toContain(member.sessionToken)
    await expect(authorize(prepared)).resolves.toBe('published')
    expect((await db.query('SELECT count(*) FROM agency_clients')).rows[0].count).toBe('0')
  })
  it.each(['editor', 'viewer'])('does not give an %s publication access', async (value) => {
    await enablePlan()
    await role(value)
    await expect(prepare(member.sessionToken)).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
  })
  const withdrawals = [
    ['logout', 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()'],
    ['expired login', 'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-INTERVAL \'1 second\''],
    ['future login', 'UPDATE page_studio_customer_sessions SET created_at=clock_timestamp()+INTERVAL \'1 day\''],
    ['suspended account', 'UPDATE page_studio_customer_accounts SET status=\'suspended\''],
    ['suspended identity', 'UPDATE page_studio_customer_identities SET status=\'suspended\''],
    ['unverified identity', 'UPDATE page_studio_customer_identities SET verified_at=NULL'],
    ['foreign identity subject', 'UPDATE page_studio_customer_identities SET subject=gen_random_uuid()::text'],
    ['revoked member', 'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()'],
    ['expired member', 'UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-INTERVAL \'1 second\''],
    ['viewer member', 'UPDATE page_studio_workspace_memberships SET role=\'viewer\''],
    ['suspended workspace', 'UPDATE page_studio_customer_workspaces SET status=\'suspended\''],
    ['suspended site', 'UPDATE page_studio_sites SET status=\'suspended\''],
    ['cancelled plan', 'UPDATE page_studio_entitlements SET status=\'cancelled\''],
    ['expired plan', 'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-INTERVAL \'1 second\''],
    ['future plan', 'UPDATE page_studio_entitlements SET effective_from=clock_timestamp()+INTERVAL \'1 hour\''],
    ['missing permission', `UPDATE page_studio_entitlements SET plan_metadata='{}'::jsonb`],
    ['disabled permission', `UPDATE page_studio_entitlements SET plan_metadata='{"publishingEnabled":false}'::jsonb`],
    ['string permission', `UPDATE page_studio_entitlements SET plan_metadata='{"publishingEnabled":"true"}'::jsonb`],
    ['preview-only plan', 'UPDATE page_studio_entitlements SET plan_key=\'customer_preview_v1\''],
    ['no domains', 'UPDATE page_studio_entitlements SET custom_domain_limit=0'],
    ['no sites', 'UPDATE page_studio_entitlements SET active_site_limit=0']
  ]
  it.each(withdrawals)('denies %s before starting publication', async (_name, sql) => {
    await enablePlan()
    const prepared = await prepare()
    await db.query(sql!)
    let called = false
    await expect(authorize(prepared, async () => {
      called = true
      return 'effect'
    }))
      .rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    expect(called).toBe(false)
  })
  it.each(withdrawals)('rolls back if %s occurs inside publication', async (_name, sql) => {
    await enablePlan()
    const prepared = await prepare()
    await expect(authorize(prepared, async (client) => {
      await client.query('INSERT INTO publication_effects VALUES(1)')
      await client.query(sql!)
      return 'effect'
    })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    expect((await db.query('SELECT * FROM publication_effects')).rows).toEqual([])
  })
  it('does not replace the original login with a newer valid session', async () => {
    await enablePlan()
    const prepared = await prepare()
    await signup.revokeCustomerSession(owner.sessionToken, runTransaction)
    const replacement = await login('owner@example.test', 'signin')
    await expect(prepare(replacement.sessionToken)).resolves.toMatchObject({ scope: prepared.scope })
    await expect(authorize(prepared)).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
  })
  it('rolls back when the original session expires while SQL work is running', async () => {
    await enablePlan()
    const prepared = await prepare()
    await expect(authorize(prepared, async (client) => {
      await client.query('INSERT INTO publication_effects VALUES(1)')
      await client.query(`UPDATE page_studio_customer_sessions
        SET expires_at=clock_timestamp()+INTERVAL '50 milliseconds' WHERE token_hash=$1`, [prepared.principal.tokenHash])
      await client.query('SELECT pg_sleep(0.075)')
      return 'effect'
    })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    expect((await db.query('SELECT * FROM publication_effects')).rows).toEqual([])
  })
  it('rejects cross-site, tenant, business, identity and workspace substitutions', async () => {
    await enablePlan()
    const prepared = await prepare()
    for (const key of ['siteId', 'clientId', 'tenantId']) {
      await expect(authorize({ ...prepared, scope: { ...prepared.scope, [key]: randomUUID() } }))
        .rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    }
    for (const key of ['identityId', 'accountId', 'workspaceId']) {
      await expect(authorize({ ...prepared, principal: { ...prepared.principal, [key]: randomUUID() } }))
        .rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    }
    await db.query('DELETE FROM page_studio_workspace_memberships WHERE identity_id=$1', [member.identityId])
    await expect(prepare(member.sessionToken)).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    await expect(prepare(owner.sessionToken, randomUUID())).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
  })
  it('captures primitive authority before the callback can mutate its inputs', async () => {
    await enablePlan()
    const prepared = await prepare()
    await expect(authorize(prepared, async () => {
      prepared.principal.identityId = randomUUID()
      prepared.scope.siteId = randomUUID()
      return 'effect'
    })).resolves.toBe('effect')
  })
  it('fails promptly when current authority is being changed by another transaction', async () => {
    await enablePlan()
    const prepared = await prepare()
    await db.query('BEGIN')
    try {
      await db.query('UPDATE page_studio_workspace_memberships SET role=\'viewer\' WHERE identity_id=$1', [owner.identityId])
      await expect(authorize(prepared)).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_BUSY', statusCode: 503 })
    } finally { await db.query('ROLLBACK') }
  })
})
