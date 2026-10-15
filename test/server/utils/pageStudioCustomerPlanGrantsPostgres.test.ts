import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: vi.fn(), transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
if (databaseUrl && !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) throw new Error('Disposable localhost database required')
const migration = (name: string) => readFileSync(`server/database/migrations/${name}`, 'utf8')

describe.runIf(Boolean(databaseUrl))('native preview to publishing plan grants', () => {
  const schema = `native_plan_${randomUUID().replaceAll('-', '')}`
  const actorId = randomUUID()
  let db: pg.Client
  let fixture: { workspaceId: string, businessId: string, tenantId: string, site: { id: string } }
  let sessionToken: string
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
  const state = async () => (await db.query(`SELECT jsonb_build_object(
    'plans', (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM page_studio_entitlements e),
    'sites', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM page_studio_sites s),
    'receipts', (SELECT jsonb_agg(to_jsonb(r) ORDER BY workspace_id) FROM page_studio_customer_site_requests r),
    'audit', (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM page_studio_audit_events a)) AS value`)).rows[0].value
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
    body = { requestId: randomUUID(), workspaceId: fixture.workspaceId,
      expectedEntitlementId: (await db.query('SELECT entitlement_id FROM page_studio_sites')).rows[0].entitlement_id,
      planKey: 'studio_business', pagesPerSiteLimit: 10, storageBytesLimit: 100000, domainLimit: 2,
      aiOperationLimit: 0, buildLimit: 20, trafficBytesLimit: 100000,
      effectiveUntil: null, reason: 'Approved customer publishing access' }
  })
  afterAll(async () => {
    if (!db) return
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  it('grants a separate plan, preserves the original policy and enables the real native publishing authority', async () => {
    const before = await state()
    const result = await grant()
    const after = await state()
    expect(result.replayed).toBe(false)
    expect(result.entitlement).toMatchObject({ workspaceId: fixture.workspaceId, siteId: fixture.site.id, planKey: 'studio_business' })
    expect(after.receipts).toEqual(before.receipts)
    const previous = after.plans.find((e: { id: string }) => e.id === body.expectedEntitlementId)
    expect(previous).toMatchObject({ ...before.plans[0], status: 'cancelled' })
    expect(after.sites[0]).toMatchObject({ ...before.sites[0], entitlement_id: result.entitlement.id })
    expect(after.audit).toHaveLength(1)
    expect(after.audit[0]).toMatchObject({ actor_id: actorId, actor_role: 'agency', action: 'customer_publishing_plan_granted' })
    expect(after.audit[0].metadata.previousEntitlement).toEqual(before.plans[0])
    const { prepareCustomerPublishPrincipal } = await import('~~/server/utils/pageStudio/customerPublishAuthority')
    await expect(prepareCustomerPublishPrincipal(sessionToken, fixture.site.id, { runTransaction })).resolves.toMatchObject({ scope: { siteId: fixture.site.id } })
    expect((await db.query('SELECT count(*) FROM agency_clients')).rows[0].count).toBe('0')
  })
  it('allows a current built-in platform administrator', async () => {
    await db.query('UPDATE team_members SET user_role=\'admin\'')
    await expect(grant()).resolves.toMatchObject({ replayed: false })
  })
  it('replays an identical request without granting twice', async () => {
    const first = await grant()
    const snapshot = await state()
    expect(await grant()).toEqual({ ...first, replayed: true })
    expect(await state()).toEqual(snapshot)
  })
  it('does not republish or reactivate access on replay after cancellation', async () => {
    const first = await grant()
    await db.query('UPDATE page_studio_entitlements SET status=\'cancelled\' WHERE id=$1', [first.entitlement.id])
    const snapshot = await state()
    expect((await grant()).replayed).toBe(true)
    expect(await state()).toEqual(snapshot)
  })
  it.each(['reason', 'planKey', 'domainLimit'])('rejects reused request ID with different %s', async (field) => {
    await grant()
    const snapshot = await state()
    await expect(grant({ [field]: field === 'domainLimit' ? 3 : 'different-value' })).rejects.toMatchObject({ statusCode: 409 })
    expect(await state()).toEqual(snapshot)
  })
  it('does not replay after the approving staff member loses authority', async () => {
    await grant()
    await db.query('UPDATE team_members SET is_active=FALSE')
    const before = await state()
    await expect(grant()).rejects.toMatchObject({ statusCode: 403 })
    expect(await state()).toEqual(before)
  })
  it('rejects a receipt replay by a different privileged actor', async () => {
    await grant()
    const other = randomUUID()
    await db.query('INSERT INTO team_members VALUES ($1,TRUE,\'owner\',NULL)', [other])
    await expect(grant({}, other)).rejects.toMatchObject({ statusCode: 409 })
  })
  it.each([
    { expectedEntitlementId: randomUUID() }, { workspaceId: randomUUID() },
    { pagesPerSiteLimit: 4 }, { storageBytesLimit: 9999 }, { buildLimit: 9 }, { trafficBytesLimit: 9999 }
  ])('rejects stale scope or a capacity downgrade: %j', async (changes) => {
    const before = await state()
    await expect(grant(changes)).rejects.toMatchObject({ statusCode: expect.any(Number) })
    expect(await state()).toEqual(before)
  })
  it.each([
    { tenantId: 'forged' }, { clientId: randomUUID() }, { publishingEnabled: false },
    { planKey: 'customer_preview_v1' }, { domainLimit: 0 }, { aiOperationLimit: -1 },
    { effectiveUntil: '2020-01-01T00:00:00Z' }, { reason: '' }
  ])('rejects invalid or caller-controlled authority: %j', async (changes) => {
    const before = await state()
    await expect(grant(changes)).rejects.toMatchObject({ statusCode: 400 })
    expect(await state()).toEqual(before)
  })
  it.each([
    'UPDATE team_members SET is_active=FALSE', 'UPDATE team_members SET user_role=\'project_manager\'',
    'UPDATE team_members SET custom_role_id=gen_random_uuid()',
    'UPDATE page_studio_customer_workspaces SET status=\'suspended\'',
    'UPDATE page_studio_sites SET status=\'active\''
  ])('does not grant under withdrawn or unsupported authority: %s', async (sql) => {
    await db.query(sql)
    const before = await state()
    await expect(grant()).rejects.toMatchObject({ statusCode: expect.any(Number) })
    expect(await state()).toEqual(before)
  })
  it('allows an expired preview to be replaced without changing its expiry', async () => {
    await db.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval \'1 second\'')
    const before = await state()
    await grant()
    const after = await state()
    expect(after.receipts).toEqual(before.receipts)
    expect(after.plans.find((e: { id: string }) => e.id === body.expectedEntitlementId).effective_until).toBe(before.plans[0].effective_until)
  })
  it('rejects another grant when the site has already left preview', async () => {
    const first = await grant()
    const before = await state()
    await expect(grant({ requestId: randomUUID(), expectedEntitlementId: first.entitlement.id })).rejects.toMatchObject({ statusCode: 409 })
    expect(await state()).toEqual(before)
  })
  it('rolls back the plan and site pointer if recording the audit fails', async () => {
    const before = await state()
    await db.query(`CREATE FUNCTION fail_plan_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test audit failure'; END; $$;
      CREATE TRIGGER fail_plan_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION fail_plan_audit()`)
    try {
      await expect(grant()).rejects.toThrow('Test audit failure')
      expect(await state()).toEqual(before)
    } finally { await db.query('DROP TRIGGER fail_plan_audit ON page_studio_audit_events; DROP FUNCTION fail_plan_audit()') }
  })
  it('keeps grant evidence append-only', async () => {
    await grant()
    await expect(db.query('UPDATE page_studio_audit_events SET metadata=\'{}\'::jsonb')).rejects.toThrow('append-only')
    await expect(db.query('DELETE FROM page_studio_audit_events')).rejects.toThrow('append-only')
  })
  it('refuses an in-flight workspace withdrawal and allows a retry after rollback', async () => {
    await runTransaction(async (client) => {
      await client.query('UPDATE page_studio_customer_workspaces SET status=\'suspended\' WHERE id=$1', [fixture.workspaceId])
      await expect(grant()).rejects.toMatchObject({ statusCode: 503 })
      await client.query('ROLLBACK')
    })
    await expect(grant()).resolves.toMatchObject({ replayed: false })
  })
  it('refuses an in-flight staff revocation', async () => {
    const before = await state()
    await runTransaction(async (client) => {
      await client.query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [actorId])
      await expect(grant()).rejects.toMatchObject({ statusCode: 503 })
      await client.query('ROLLBACK')
    })
    expect(await state()).toEqual(before)
  })
  it('rolls back when approval expires while the audit is being recorded', async () => {
    const before = await state()
    await db.query(`CREATE FUNCTION expire_plan_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      PERFORM pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ((NEW.metadata->'request'->>'effectiveUntil')::timestamptz-clock_timestamp())))+0.02);
      RETURN NEW; END; $$;
      CREATE TRIGGER expire_plan_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION expire_plan_audit()`)
    try {
      await expect(grant({ effectiveUntil: new Date(Date.now() + 2000).toISOString() })).rejects.toMatchObject({
        statusCode: 400, statusMessage: 'Plan access expired during approval'
      })
      expect(await state()).toEqual(before)
    } finally { await db.query('DROP TRIGGER expire_plan_audit ON page_studio_audit_events; DROP FUNCTION expire_plan_audit()') }
  })
  it('cannot apply two competing requests concurrently', async () => {
    const results = await Promise.allSettled([grant(), grant({ requestId: randomUUID() })])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const after = await state()
    expect(after.plans).toHaveLength(2)
    expect(after.audit).toHaveLength(1)
  })
})
