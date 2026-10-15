import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: vi.fn(), transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
if (databaseUrl && !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) throw new Error('Disposable localhost database required')
const migration = (name: string) => readFileSync(`server/database/migrations/${name}`, 'utf8')

describe.runIf(Boolean(databaseUrl))('native production authoring authority', () => {
  const schema = `native_authoring_${randomUUID().replaceAll('-', '')}`
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
  const author = async (changes = {}, work = async (_db: pg.Client, authority: unknown) => authority) => {
    const { withCustomerProductionAuthoringAuthority } = await import('~~/server/utils/pageStudio/customerAuthoringAuthority')
    return withCustomerProductionAuthoringAuthority({ loginSessionHash, siteId: fixture.site.id, entitlementId: planId, ...changes }, work, { runTransaction })
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
      '443_page_studio_customer_signup.sql', '444_page_studio_customer_site_ownership.sql']) await db.query(migration(name))
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
  })
  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  it('derives exact native ownership under the current non-preview plan', async () => {
    const result = await author()
    expect(result).toMatchObject({ workspaceId: fixture.workspaceId, entitlementId: planId,
      scope: { tenantId: fixture.tenantId, businessId: fixture.businessId, clientId: fixture.businessId,
        siteId: fixture.site.id, environment: 'production' } })
    expect(JSON.stringify(result)).not.toContain(loginSessionHash)
    expect((await db.query('SELECT count(*) FROM agency_clients')).rows[0].count).toBe('0')
  })
  it('does not rely on an expired preview or its former approving staff member', async () => {
    await db.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval \'1 second\' WHERE id=$1', [body.expectedEntitlementId])
    await db.query('UPDATE team_members SET is_active=FALSE')
    await expect(author()).resolves.toMatchObject({ entitlementId: planId })
  })
  it.each([
    'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-interval \'1 second\'',
    'UPDATE page_studio_customer_accounts SET status=\'suspended\'',
    'UPDATE page_studio_customer_identities SET status=\'suspended\'',
    'UPDATE page_studio_customer_identities SET verified_at=NULL',
    'UPDATE page_studio_customer_workspaces SET status=\'suspended\'',
    'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval \'1 second\'',
    'UPDATE page_studio_workspace_memberships SET role=\'manager\'',
    'UPDATE page_studio_sites SET status=\'archived\'',
    'UPDATE page_studio_entitlements SET status=\'cancelled\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval \'1 second\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET effective_from=clock_timestamp()+interval \'1 hour\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_key=\'customer_preview_v1\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET active_site_limit=0 WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=\'{}\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=jsonb_set(plan_metadata,\'{publishingEnabled}\',\'false\') WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=jsonb_set(plan_metadata,\'{managedBy}\',\'"customer"\') WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=jsonb_set(plan_metadata,\'{allowedModules}\',\'[]\') WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=jsonb_set(plan_metadata,\'{allowedModules}\',\'"business-content"\') WHERE status=\'active\''
  ])('refuses withdrawn or malformed access: %s', async (sql) => {
    await db.query(sql)
    const work = vi.fn()
    await expect(author({}, work)).rejects.toMatchObject({ statusCode: 403 })
    expect(work).not.toHaveBeenCalled()
  })
  it.each([{ siteId: randomUUID() }, { entitlementId: randomUUID() }, { loginSessionHash: '0'.repeat(64) },
    { tenantId: 'forged' }, { workspaceId: randomUUID() }, { entitlementId: null }])('rejects stale or caller-selected scope %j', async (changes) => {
    await expect(author(changes)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('pins the exact plan rather than accepting a replacement', async () => {
    const replacement = randomUUID()
    await db.query('UPDATE page_studio_entitlements SET status=\'cancelled\' WHERE id=$1', [planId])
    await db.query(`INSERT INTO page_studio_entitlements SELECT
      (jsonb_populate_record(NULL::page_studio_entitlements, to_jsonb(e) || jsonb_build_object('id',$2::text,'status','active'))).*
      FROM page_studio_entitlements e WHERE id=$1`, [planId, replacement])
    await db.query('UPDATE page_studio_sites SET entitlement_id=$1', [replacement])
    await expect(author()).rejects.toMatchObject({ statusCode: 403 })
    await expect(author({ entitlementId: replacement })).resolves.toMatchObject({ entitlementId: replacement })
  })
  it('rejects another verified native account accessing this site', async () => {
    const signup = await import('~~/server/utils/pageStudio/customerSignup')
    const requested = await signup.requestCustomerSignIn({ email: 'other@example.test', name: 'Other owner', mode: 'signup', acceptedTerms: true }, 'preview-v1', runTransaction)
    const login = await signup.verifyCustomerSignIn(requested!.token, runTransaction)
    const { digestPortalSessionToken } = await import('~~/server/utils/portalSession')
    await expect(author({ loginSessionHash: await digestPortalSessionToken(login.sessionToken) })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('retains the original authorization inputs throughout the callback', async () => {
    const { withCustomerProductionAuthoringAuthority } = await import('~~/server/utils/pageStudio/customerAuthoringAuthority')
    const input = { loginSessionHash, siteId: fixture.site.id, entitlementId: planId }
    await expect(withCustomerProductionAuthoringAuthority(input, async (_tx, authority) => {
      input.entitlementId = randomUUID()
      input.siteId = randomUUID()
      input.loginSessionHash = '0'.repeat(64)
      return authority
    }, { runTransaction })).resolves.toMatchObject({ entitlementId: planId, scope: { siteId: fixture.site.id } })
  })
  it('permits an active site without changing its publication state', async () => {
    await db.query('UPDATE page_studio_sites SET status=\'active\'')
    await expect(author()).resolves.toMatchObject({ entitlementId: planId })
    expect((await db.query('SELECT status FROM page_studio_sites')).rows[0].status).toBe('active')
  })
  it.each([
    'UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()+interval \'10 minutes\' RETURNING expires_at',
    'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()+interval \'10 minutes\' RETURNING expires_at',
    'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+interval \'10 minutes\' WHERE status=\'active\' RETURNING effective_until AS expires_at'
  ])('clamps the authoring deadline to the earliest authority expiry: %s', async (sql) => {
    const deadline = (await db.query(sql)).rows[0].expires_at
    expect(await author()).toMatchObject({ expiresAt: deadline.toISOString() })
  })
  it('does not let a replacement login renew the revoked original session', async () => {
    const replacementHash = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash,account_id,expires_at)
      SELECT $1,account_id,expires_at FROM page_studio_customer_sessions WHERE token_hash=$2`, [replacementHash, loginSessionHash])
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [loginSessionHash])
    await expect(author()).rejects.toMatchObject({ statusCode: 403 })
    await expect(author({ loginSessionHash: replacementHash })).resolves.toMatchObject({ entitlementId: planId })
  })
  it('rechecks actual clock expiry while SQL work is running', async () => {
    const work = vi.fn(async (tx: pg.Client) => {
      await tx.query('UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()+interval \'30 milliseconds\'')
      await tx.query('SELECT pg_sleep(0.06)')
    })
    await expect(author({}, work)).rejects.toMatchObject({ statusCode: 403 })
    expect(work).toHaveBeenCalledOnce()
    expect((await db.query('SELECT expires_at FROM page_studio_workspace_memberships')).rows[0].expires_at).toBeNull()
  })
  it('rolls back SQL work if the membership expires before completion', async () => {
    const before = (await db.query('SELECT name FROM page_studio_sites')).rows[0].name
    await expect(author({}, async (tx) => {
      await tx.query('UPDATE page_studio_sites SET name=\'Should roll back\'')
      await tx.query('UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval \'1 second\'')
    })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT name FROM page_studio_sites')).rows[0].name).toBe(before)
  })
  it.each([
    'SELECT workspace_id FROM page_studio_workspace_memberships FOR UPDATE',
    'SELECT id FROM page_studio_entitlements FOR UPDATE',
    'SELECT id FROM page_studio_sites FOR UPDATE'
  ])('refuses in-flight authority changes instead of waiting: %s', async (lock) => {
    await db.query('BEGIN')
    try {
      await db.query(lock)
      const work = vi.fn()
      await expect(author({}, work)).rejects.toMatchObject({ statusCode: 503 })
      expect(work).not.toHaveBeenCalled()
    } finally { await db.query('ROLLBACK') }
  })
})
