import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: vi.fn(), transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
if (databaseUrl && !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) throw new Error('Disposable localhost database required')
const migration = (name: string) => readFileSync(`server/database/migrations/${name}`, 'utf8')

describe.runIf(Boolean(databaseUrl))('native production editor lifecycle', () => {
  const schema = `native_production_editor_${randomUUID().replaceAll('-', '')}`
  const actorId = randomUUID()
  let db: pg.Client
  let fixture: { workspaceId: string, businessId: string, tenantId: string, site: { id: string } }
  let sessionToken: string
  let planId: string
  let loginSessionHash: string
  let body: Record<string, unknown>
  const runTransaction = async <T>(work: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { await client.end() }
  }
  const grant = async (changes = {}, actor = actorId) => {
    const { grantCustomerPublishingPlan } = await import('~~/server/utils/pageStudio/customerPlanGrants')
    return grantCustomerPublishingPlan({ actorId: actor, body: { ...body, ...changes } }, { runTransaction })
  }
  const config = { enabled: true, environment: 'production', dashboardOrigin: 'https://customers.example.test', editorOrigin: 'https://editor.example.test' }
  const ticket = async (overrides = {}) => {
    const { issueCustomerEditorHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    return issueCustomerEditorHandoff(sessionToken, { ...config, ...overrides }, { runTransaction })
  }
  const exchange = async (token: string, overrides = {}) => {
    const { exchangeCustomerEditorSession } = await import('~~/server/utils/pageStudio/customerEditorSessions')
    let claims: unknown
    const result = await exchangeCustomerEditorSession(token, { ...config, ...overrides }, { runTransaction,
      signToken: async (value) => { claims = value; return 'test-signed-token' } })
    return { ...result, claims }
  }
  const session = async () => exchange((await ticket()).token)
  const authorize = async (claims: unknown, capability = 'workspace:status') => {
    const { assertCustomerEditorSessionAuthority } = await import('~~/server/utils/pageStudio/customerEditorSessions')
    return runTransaction(tx => assertCustomerEditorSessionAuthority(claims, capability, tx))
  }
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE agency_clients(id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY, client_id UUID, status TEXT, role TEXT);
      CREATE TABLE team_members(id UUID PRIMARY KEY, is_active BOOLEAN, user_role TEXT, custom_role_id UUID);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups(role_id UUID, permission_group TEXT, UNIQUE(role_id,permission_group));`)
    for (const name of ['402_page_studio_control_plane.sql', '442_page_studio_customer_workspaces.sql',
      '443_page_studio_customer_signup.sql', '444_page_studio_customer_site_ownership.sql', '446_page_studio_customer_editor_handoffs.sql', '447_page_studio_customer_editor_sessions.sql', '448_page_studio_customer_cms_setup.sql', '456_page_studio_customer_editor_environment.sql']) await db.query(migration(name))
  })
  beforeEach(async () => {
    await db.query('TRUNCATE agency_clients, team_members, page_studio_customer_identities, page_studio_customer_accounts CASCADE')
    await db.query('INSERT INTO team_members VALUES ($1,TRUE,\'owner\',NULL)', [actorId])
    const signup = await import('~~/server/utils/pageStudio/customerSignup')
    const requested = await signup.requestCustomerSignIn({ email: 'owner@example.test', name: 'Test owner', mode: 'signup', acceptedTerms: true }, 'preview-v1', runTransaction)
    const login = await signup.verifyCustomerSignIn(requested!.token, runTransaction)
    sessionToken = login.sessionToken
    const { createCustomerWorkspace } = await import('~~/server/utils/pageStudio/customerWorkspaces')
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const workspace = await createCustomerWorkspace({ identityId: login.identityId, requestId: randomUUID(), name: 'Plan test' }, runTransaction)
    fixture = await createCustomerPreviewSite({ workspaceId: workspace.workspace.id, identityId: login.identityId,
      requestId: randomUUID(), name: 'Plan preview', route: 'plan-test', starterVersion: 'floristry-v1' }, { runTransaction,
      previewPolicy: { approvalId: randomUUID(), approvedBy: actorId, expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        pagesPerSiteLimit: 5, storageBytesLimit: 10000, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 10000 } })
    const { digestPortalSessionToken } = await import('~~/server/utils/portalSession')
    loginSessionHash = await digestPortalSessionToken(sessionToken)
    body = { requestId: randomUUID(), workspaceId: fixture.workspaceId,
      expectedEntitlementId: (await db.query('SELECT entitlement_id FROM page_studio_sites')).rows[0].entitlement_id,
      planKey: 'studio_business', pagesPerSiteLimit: 10, storageBytesLimit: 100000, domainLimit: 2,
      aiOperationLimit: 0, buildLimit: 20, trafficBytesLimit: 100000,
      effectiveUntil: null, reason: 'Approved customer publishing access' }
    planId = (await grant()).entitlement.id
    await db.query('INSERT INTO page_studio_customer_setup_drafts (identity_id,workspace_id,draft) VALUES($1,$2,$3::jsonb)',
      [login.identityId,fixture.workspaceId,JSON.stringify({ businessName: 'Plan test', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] })])
  })
  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  it('issues a production ticket and child session pinned to the granted plan', async () => {
    const { claims } = await session()
    expect(claims).toMatchObject({ environment: 'production', siteId: fixture.site.id, workspaceId: fixture.workspaceId })
    const handoff = (await db.query('SELECT environment,entitlement_id,purpose FROM page_studio_customer_editor_handoffs')).rows[0]
    expect(handoff).toEqual({ environment: 'production', entitlement_id: planId, purpose: 'editor' })
    await expect(authorize(claims)).resolves.toMatchObject({ owned: { scope: { environment: 'production' } } })
  })
  it('does not depend on the cancelled preview or its approver', async () => {
    await db.query('UPDATE team_members SET is_active=FALSE')
    await expect(session()).resolves.toHaveProperty('token')
  })
  it('refuses production CMS setup tickets before they can be inserted', async () => {
    const { issueCustomerCmsSetupHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    await expect(issueCustomerCmsSetupHandoff(sessionToken, config, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT count(*) FROM page_studio_customer_editor_handoffs')).rows[0].count).toBe('0')
  })
  it('refuses a production ticket exchanged through the staging configuration without consuming it', async () => {
    const handoff = await ticket()
    await expect(exchange(handoff.token, { environment: 'staging' })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT consumed_at FROM page_studio_customer_editor_handoffs')).rows[0].consumed_at).toBeNull()
    await expect(exchange(handoff.token)).resolves.toHaveProperty('token')
  })
  it.each([
    "UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()",
    "UPDATE page_studio_workspace_memberships SET role='viewer'",
    "UPDATE page_studio_entitlements SET status='cancelled' WHERE status='active'"
  ])('rejects ticket redemption after authority changes: %s', async (sql) => {
    const handoff = await ticket()
    await db.query(sql)
    await expect(exchange(handoff.token)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    "UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()",
    "UPDATE page_studio_workspace_memberships SET role='viewer'",
    "UPDATE page_studio_entitlements SET status='cancelled' WHERE status='active'",
    "UPDATE page_studio_customer_editor_sessions SET revoked_at=clock_timestamp()"
  ])('rejects established child sessions after authority changes: %s', async (sql) => {
    const { claims } = await session()
    await db.query(sql)
    await expect(authorize(claims)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('clamps a child session to the membership deadline', async () => {
    const deadline = (await db.query("UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()+interval '10 minutes' RETURNING expires_at")).rows[0].expires_at
    const { claims } = await session()
    expect(claims).toMatchObject({ expiresAt: Math.floor(deadline.getTime() / 1000) })
  })
  it('preserves immutable environment and plan fields, including after migration replay', async () => {
    await session()
    await db.query(migration('456_page_studio_customer_editor_environment.sql'))
    await expect(db.query("UPDATE page_studio_customer_editor_handoffs SET environment='staging',entitlement_id=NULL")).rejects.toThrow('immutable')
    await expect(db.query('UPDATE page_studio_customer_editor_handoffs SET entitlement_id=$1', [randomUUID()])).rejects.toThrow('immutable')
  })
})
