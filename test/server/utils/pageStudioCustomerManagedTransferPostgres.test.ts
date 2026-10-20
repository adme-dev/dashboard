import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { grantCustomerPublishingPlan } from '~~/server/utils/pageStudio/customerPlanGrants'
import { contentScopeKey } from '~~/shared/pageStudio/cmsManaged'
import { readCustomerManagedTransfer, recoverCustomerManagedTransfer } from '~~/server/utils/pageStudio/customerManagedTransfer'

const { remote, completion } = vi.hoisted(() => ({ remote: vi.fn(), completion: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/completedManagedTransfer', () => ({ callCompletedManagedTransfer: remote }))
vi.mock('~~/server/utils/pageStudio/managedTransferCompletionRead', () => ({ readCurrentManagedTransferCompletion: completion }))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl && !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) throw new Error('Disposable localhost database required')
const migration = (name: string) => readFileSync(`server/database/migrations/${name}`, 'utf8')
const env = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PRODUCTION_EDITOR_ENABLED: 'true' }
describe.runIf(Boolean(databaseUrl))('customer transfer current native authority on PostgreSQL', () => {
  const schema = `customer_transfer_${randomUUID().replaceAll('-', '')}`
  const actorId = randomUUID()
  let db: pg.Client
  let fixture: { workspaceId: string, businessId: string, tenantId: string, site: { id: string } }
  let sessionToken: string, planId: string, loginSessionHash: string
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
    // Reader-contract tables; immutable terminal constraints have their own real
    // migration suite. Current native signup/ownership/plan tables above are real.
    await db.query(`CREATE TABLE page_studio_managed_transfer_intents(operation_id UUID PRIMARY KEY,site_id UUID,tenant_id TEXT,client_id UUID,entitlement_id UUID,intent_digest TEXT);
      CREATE TABLE page_studio_managed_transfer_completions(operation_id UUID PRIMARY KEY,intent_digest TEXT,destination_scope_key TEXT);`)
    for (const name of ['resource_bindings', 'source_drafts', 'destination_catalogues', 'destination_execution_verifications', 'copy_graph_verifications', 'forms_history_verifications']) {
      await db.query(`CREATE TABLE page_studio_managed_transfer_${name}(operation_id UUID PRIMARY KEY,intent_digest TEXT)`)
    }
  })
  beforeEach(async () => {
    remote.mockReset()
    completion.mockReset().mockResolvedValue(null)
    await db.query('TRUNCATE page_studio_managed_transfer_intents,page_studio_managed_transfer_completions,page_studio_managed_transfer_resource_bindings,page_studio_managed_transfer_source_drafts,page_studio_managed_transfer_destination_catalogues,page_studio_managed_transfer_destination_execution_verifications,page_studio_managed_transfer_copy_graph_verifications,page_studio_managed_transfer_forms_history_verifications')
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
    const body = { requestId: randomUUID(), workspaceId: fixture.workspaceId,
      expectedEntitlementId: (await db.query('SELECT entitlement_id FROM page_studio_sites')).rows[0].entitlement_id,
      planKey: 'studio_business', pagesPerSiteLimit: 10, storageBytesLimit: 100000, domainLimit: 2,
      aiOperationLimit: 0, buildLimit: 20, trafficBytesLimit: 100000,
      effectiveUntil: null, reason: 'Approved customer publishing access' }
    planId = (await grantCustomerPublishingPlan({ actorId, body }, { runTransaction })).entitlement.id
  })
  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  const read = () => readCustomerManagedTransfer(sessionToken, fixture.site.id, { env, runTransaction })
  const intent = async () => {
    const operationId = randomUUID()
    await db.query('INSERT INTO page_studio_managed_transfer_intents VALUES($1,$2,$3,$4,$5,$6)', [operationId, fixture.site.id, fixture.tenantId, fixture.businessId, planId, 'a'.repeat(64)])
    return operationId
  }
  it('selects source or completed destination from current native ownership, never caller environment', async () => {
    const { readCustomerEditorEnvironment } = await import('~~/server/utils/pageStudio/customerPreviewRouting')
    const identity = (await db.query('SELECT identity_id FROM page_studio_customer_accounts')).rows[0].identity_id
    await db.query('INSERT INTO page_studio_customer_setup_drafts(identity_id,workspace_id,draft) VALUES($1,$2,$3::jsonb)', [identity, fixture.workspaceId,
      JSON.stringify({ businessName: 'Plan preview', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] })])
    expect(await readCustomerEditorEnvironment(sessionToken, runTransaction)).toBe('staging')
    const operationId = await intent()
    expect(await readCustomerEditorEnvironment(sessionToken, runTransaction)).toBe('staging')
    await db.query('INSERT INTO page_studio_managed_transfer_completions VALUES($1,$2,$3)', [operationId, 'a'.repeat(64), contentScopeKey({ tenantId: fixture.tenantId, clientId: fixture.businessId, businessId: fixture.businessId, siteId: fixture.site.id, environment: 'production' })])
    expect(await readCustomerEditorEnvironment(sessionToken, runTransaction)).toBe('production')
    await db.query('UPDATE page_studio_workspace_memberships SET role=\'viewer\'')
    await expect(readCustomerEditorEnvironment(sessionToken, runTransaction)).rejects.toMatchObject({ statusCode: 403 })
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
    await expect(readCustomerEditorEnvironment(sessionToken, runTransaction)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('reads exact saved milestones without invoking original-session coordinators', async () => {
    const operationId = await intent()
    expect(await read()).toMatchObject({ completed: false, stage: 'preparing-resources' })
    await db.query('INSERT INTO page_studio_managed_transfer_resource_bindings VALUES($1,$2)', [operationId, 'a'.repeat(64)])
    expect(await read()).toMatchObject({ stage: 'freezing-source' })
    await db.query('INSERT INTO page_studio_managed_transfer_destination_execution_verifications VALUES($1,$2)', [operationId, 'a'.repeat(64)])
    expect(await read()).toMatchObject({ stage: 'copying-content' })
    for (const name of ['copy_graph_verifications', 'forms_history_verifications']) await db.query(`INSERT INTO page_studio_managed_transfer_${name} VALUES($1,$2)`, [operationId, 'a'.repeat(64)])
    expect(await read()).toMatchObject({ stage: 'verifying', canRetryConnection: false, canRetryRetention: false })
    expect(remote).not.toHaveBeenCalled()
  })
  it('ignores another operation or a mismatched evidence digest', async () => {
    const operationId = await intent()
    await db.query('INSERT INTO page_studio_managed_transfer_destination_execution_verifications VALUES($1,$2)', [operationId, 'b'.repeat(64)])
    expect(await read()).toMatchObject({ stage: 'preparing-resources' })
    await db.query('UPDATE page_studio_managed_transfer_intents SET site_id=$1', [randomUUID()])
    expect(await read()).toBeNull()
  })
  it.each(['viewer', 'expired-plan'])('keeps completed fact visible under inspection-only %s authority', async (reason) => {
    const operationId = await intent()
    const key = contentScopeKey({ tenantId: fixture.tenantId, businessId: fixture.businessId, clientId: fixture.businessId, siteId: fixture.site.id, environment: 'production' })
    await db.query('INSERT INTO page_studio_managed_transfer_completions VALUES($1,$2,$3)', [operationId, 'a'.repeat(64), key])
    if (reason === 'viewer') await db.query('UPDATE page_studio_workspace_memberships SET role=\'viewer\'')
    else await db.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval \'1 second\' WHERE id=$1', [planId])
    expect(await read()).toMatchObject({ completed: true, editorConnection: 'unavailable', canRetryConnection: false, canRetryRetention: false })
    await expect(recoverCustomerManagedTransfer(sessionToken, fixture.site.id, { action: 'retry-connection' }, { env, runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(remote).not.toHaveBeenCalled()
    await db.query('UPDATE page_studio_managed_transfer_completions SET destination_scope_key=$1', ['foreign'])
    expect(await read()).toBeNull()
  })
  it('withholds a completed RPC result after revocation of this login', async () => {
    completion.mockResolvedValue({ digest: 'a'.repeat(64) })
    remote.mockImplementation(async () => {
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [loginSessionHash])
      return { siteId: fixture.site.id, completed: true, editorConnection: 'pending', sourceRetention: 'pending', canRetryConnection: true, canRetryRetention: true }
    })
    await expect(read()).rejects.toThrow()
    expect(remote).toHaveBeenCalledOnce()
  })
})
