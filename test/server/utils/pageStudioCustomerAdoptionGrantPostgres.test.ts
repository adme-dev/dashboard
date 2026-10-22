import type { CustomerEditorClaims } from '~~/server/utils/pageStudio/customerEditorToken'
import type { z } from 'zod'
import { CmsFreezeReceiptSchema } from '~~/shared/pageStudio/cmsManaged'
import { CustomerCmsAdoptionStatusSchema } from '~~/shared/pageStudio/customerCmsSetup'
import graphFixture from '../../fixtures/pageStudioCmsGraph.json'
import { attachCmsManagement, nativeSourceCmsEnvironment } from '../../helpers/pageStudioCmsManagement'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { CollectionUpgradeOperationSchema as Collection } from '~~/shared/pageStudio/collection-upgrade'
import { WorkflowUpgradeOperationSchema as Workflow } from '~~/shared/pageStudio/workflow-upgrade'
import { CollectionStagingUpgradeOperationSchema as Staging } from '~~/shared/pageStudio/collection-staging-upgrade'
import { FormDraftsUpgradeReceiptSchema as Forms } from '~~/shared/pageStudio/form-drafts-upgrade'

const native = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: native.transaction, transactionWithoutRetry: native.transaction }))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const u = new URL(databaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    u.hostname !== '127.0.0.1' ||
    !/^\/studio_cms_[a-z0-9_]+$/.test(u.pathname) ||
    u.search
  )
    throw new Error('Disposable localhost required')
}
const migration = (name: string) => readFileSync(`server/database/migrations/${name}`, 'utf8')
describe.runIf(Boolean(databaseUrl))('existing-source adoption grants on PostgreSQL', () => {
  const schema = `adoption_grant_${randomUUID().replaceAll('-', '')}`,
    actorId = randomUUID(),
    operatorHash = 'a'.repeat(64)
  const operator = { actorId, loginSessionHash: operatorHash }
  let db: pg.Client, fixture: Awaited<ReturnType<typeof seed>>
  const runTransaction = async <T>(work: (db: pg.Client) => Promise<T>) => {
    const c = new pg.Client({ connectionString: databaseUrl })
    await c.connect()
    try {
      await c.query('BEGIN')
      await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`)
      await c.query("SET LOCAL statement_timeout='6s'")
      const value = await work(c)
      await c.query('COMMIT')
      return value
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    } finally {
      await c.end()
    }
  }
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}",pg_catalog`)
    await db.query(`CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
   CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
   CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
   CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN DEFAULT FALSE);
   CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
   CREATE TABLE page_studio_sessions(nonce TEXT,role TEXT,revoked_at TIMESTAMPTZ);`)
    for (const name of [
      '402_page_studio_control_plane.sql',
      '404_page_studio_documents.sql',
      '420_page_studio_login_sessions.sql',
      '422_page_studio_cms_visibility.sql',
      '425_page_studio_cms_authoring_scope.sql',
      '442_page_studio_customer_workspaces.sql',
      '443_page_studio_customer_signup.sql',
      '444_page_studio_customer_site_ownership.sql',
      '445_page_studio_customer_provisioning.sql',
      '446_page_studio_customer_editor_handoffs.sql',
      '447_page_studio_customer_editor_sessions.sql',
      '448_page_studio_customer_cms_setup.sql',
      '456_page_studio_customer_editor_environment.sql',
      '457_page_studio_managed_transfer_intents.sql'
    ])
      await db.query(migration(name))
    for (const name of readdirSync('server/database/migrations')
      .filter((n) => /^(45[89]|46[0-9]|470|471|472)_/.test(n))
      .sort())
      await db.query(migration(name))
    await db.query(migration('475_page_studio_customer_adoption_grants.sql'))
    await db.query(migration('475_page_studio_customer_adoption_grants.sql'))
  })
  const seed = async () => {
    await db.query(
      'TRUNCATE agency_clients,team_members,page_studio_customer_identities,page_studio_customer_accounts,page_studio_login_sessions CASCADE'
    )
    await db.query("INSERT INTO team_members VALUES($1,TRUE,'owner',NULL,NULL)", [actorId])
    await db.query(
      "INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES('agency',$1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '2 days')",
      [operatorHash, actorId]
    )
    native.transaction.mockImplementation(runTransaction)
    const signup = await import('~~/server/utils/pageStudio/customerSignup')
    const request = await signup.requestCustomerSignIn(
      { email: 'adoption-owner@example.test', name: 'Owner', mode: 'signup', acceptedTerms: true },
      'v1',
      runTransaction
    )
    const login = await signup.verifyCustomerSignIn(request!.token, runTransaction)
    const { createCustomerWorkspace } = await import('~~/server/utils/pageStudio/customerWorkspaces')
    const workspace = await createCustomerWorkspace(
      { identityId: login.identityId, requestId: randomUUID(), name: 'Existing source' },
      runTransaction
    )
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const policy = {
      approvalId: randomUUID(),
      approvedBy: actorId,
      expiresAt: new Date(
        Date.now() + (expect.getState().currentTestName?.includes('unexpired preview') ? 86400_000 : 1500)
      ).toISOString(),
      pagesPerSiteLimit: 5,
      storageBytesLimit: 10000,
      monthlyBuildLimit: 10,
      monthlyTrafficBytesLimit: 10000
    }
    const site = await createCustomerPreviewSite(
      {
        workspaceId: workspace.workspace.id,
        identityId: login.identityId,
        requestId: randomUUID(),
        name: 'Existing source',
        route: 'existing-source',
        starterVersion: 'floristry-v1'
      },
      { runTransaction, previewPolicy: policy }
    )
    await db.query('INSERT INTO page_studio_customer_setup_drafts(identity_id,workspace_id,draft) VALUES($1,$2,$3)', [
      login.identityId,
      site.workspaceId,
      { businessName: 'Existing source', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] }
    ])
    const { prepareCustomerProvisioning } = await import('~~/server/utils/pageStudio/customerProvisioning')
    const job = await prepareCustomerProvisioning(
      { sessionToken: login.sessionToken, siteId: site.site.id },
      { runTransaction }
    )
    const scope = job.scope,
      accountId = (await db.query('SELECT id FROM page_studio_customer_accounts')).rows[0].id
    await db.query(
      `INSERT INTO page_studio_customer_cms_setup_approvals(tenant_id,business_id,workspace_id,site_id,identity_id,approved_by,preview_policy,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        scope.tenantId,
        scope.businessId,
        site.workspaceId,
        scope.siteId,
        login.identityId,
        actorId,
        policy,
        policy.expiresAt
      ]
    )
    const { builderLibrary: _, ...baseManifest } = structuredClone(graphFixture.base.checkpoint.manifest)
    const manifest = { ...baseManifest, id: scope.siteId },
      digest = await collectionDigest(manifest),
      objectKey = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/initial.json`
    await db.query(
      "INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at) VALUES('initial',$1,$2,$3,$4,$5,'initial',clock_timestamp())",
      [scope.tenantId, scope.clientId, scope.siteId, digest, objectKey]
    )
    await db.query("UPDATE page_studio_sites SET current_checkpoint_id='initial' WHERE id=$1", [scope.siteId])
    const base = { accountId: 'a'.repeat(32), databaseId: randomUUID(), name: `ps-content-${'b'.repeat(32)}`, scope }
    const collection = {
      ...base,
      operationId: 'collection_a',
      sourceDigest: Collection.shape.sourceDigest.value,
      targetDigest: Collection.shape.targetDigest.value
    }
    const workflow = {
      ...base,
      operationId: 'workflow_a',
      collectionOperationId: collection.operationId,
      sourceDigest: Workflow.shape.sourceDigest.value,
      targetDigest: Workflow.shape.targetDigest.value
    }
    const staging = {
      ...base,
      operationId: 'staging_a',
      collectionOperationId: collection.operationId,
      workflowOperationId: workflow.operationId,
      sourceDigest: Staging.shape.sourceDigest.value,
      targetDigest: Staging.shape.targetDigest.value
    }
    const form = {
      ...base,
      operationId: 'forms_a',
      collectionOperationId: collection.operationId,
      workflowOperationId: workflow.operationId,
      stagingOperationId: staging.operationId,
      sourceDigest: Forms.shape.sourceDigest.value,
      targetDigest: Forms.shape.targetDigest.value
    }
    const target = {
      accountId: base.accountId,
      databaseId: base.databaseId,
      name: base.name,
      routeId: randomUUID(),
      runtimeDigest: 'e'.repeat(64),
      collectionReceiptDigest: await collectionDigest(collection),
      workflowReceiptDigest: await collectionDigest(workflow),
      stagingReceiptDigest: await collectionDigest(staging)
    }
    const selection = {
      activationId: target.routeId,
      scope,
      namespace: 'xeroflow-page-studio-dispatch-staging',
      scriptName: base.name,
      target,
      receipts: { collection, workflow, staging },
      formDrafts: { receipt: form, digest: await collectionDigest(form) }
    }
    const storage = {
      kind: 'existing-native-adoption-source',
      version: 1,
      selection,
      selectionDigest: await collectionDigest(selection)
    }
    const providerJob = {
      ...structuredClone(job),
      phase: 'complete',
      resources: { database: base.databaseId, contentBinding: base.name, site: scope.siteId }
    }
    const bucket = {
      get: vi.fn(async () => ({
        body: new Response(JSON.stringify({ schemaVersion: 1, checkpointId: 'initial', scope, manifest, digest })).body!
      }))
    }
    const legacyClaims: CustomerEditorClaims[] = []
    if (
      expect.getState().currentTestName?.includes('legacy handoffs') ||
      expect.getState().currentTestName?.includes('reapplies the additive migration') ||
      expect.getState().currentTestName?.includes('old pre-expiry')
    ) {
      const h = await import('~~/server/utils/pageStudio/customerEditorHandoff')
      const { exchangeCustomerEditorSession } = await import('~~/server/utils/pageStudio/customerEditorSessions')
      for (const issue of [h.issueCustomerEditorHandoff, h.issueCustomerCmsSetupHandoff]) {
        const ticket = await issue(login.sessionToken, config, { runTransaction })
        await exchangeCustomerEditorSession(ticket.token, config, {
          runTransaction,
          signToken: async (claims) => {
            legacyClaims.push(claims)
            return 'legacy-signed'
          }
        })
      }
    }
    if (!expect.getState().currentTestName?.includes('unexpired preview'))
      await db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp())+0.02))', [
        policy.expiresAt
      ])
    return {
      legacyClaims,
      siteId: scope.siteId,
      scope,
      accountId,
      login,
      workspaceId: site.workspaceId,
      job,
      storage,
      providerJob,
      bucket,
      policy,
      objectKey,
      digest
    }
  }
  beforeEach(async () => {
    fixture = await seed()
  })
  afterAll(async () => {
    if (db) {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await db.end()
    }
  })
  const dependencies = () => ({
    runTransaction,
    readSource: vi.fn(async () => ({ storage: fixture.storage, job: fixture.providerJob })),
    bucket: fixture.bucket
  })
  const inspect = async (
    deps: Parameters<
      typeof import('~~/server/utils/pageStudio/customerAdoptionGrant').inspectCustomerAdoptionGrant
    >[1] = dependencies()
  ) =>
    (await import('~~/server/utils/pageStudio/customerAdoptionGrant')).inspectCustomerAdoptionGrant(
      { siteId: fixture.siteId, operator },
      deps
    )
  const request = async () => ({
    grantId: randomUUID(),
    expectedGrantId: null,
    expectedRevision: 0,
    sourceDigest: (await inspect()).sourceDigest,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    reason: 'Existing source adoption only'
  })
  const grant = async (
    body: unknown,
    deps: Parameters<
      typeof import('~~/server/utils/pageStudio/customerAdoptionGrant').grantCustomerAdoption
    >[1] = dependencies()
  ) =>
    (await import('~~/server/utils/pageStudio/customerAdoptionGrant')).grantCustomerAdoption(
      { siteId: fixture.siteId, operator, body },
      deps
    )
  it('retains the unchanged preview plan and issues an independent scoped grant', async () => {
    const before = (await db.query('SELECT to_jsonb(e) AS value FROM page_studio_entitlements e')).rows
    const body = await request(),
      result = await grant(body)
    expect(result).toMatchObject({ grant: { grantId: body.grantId, revision: 1 }, historical: false })
    expect((await db.query('SELECT to_jsonb(e) AS value FROM page_studio_entitlements e')).rows).toEqual(before)
    expect((await db.query('SELECT grant_id,revision FROM page_studio_customer_adoption_selections')).rows).toEqual([
      { grant_id: body.grantId, revision: 1 }
    ])
    const replay = await grant(body)
    expect(replay).toMatchObject({ historical: true, grant: result.grant })
    expect((await db.query('SELECT count(*)::int AS n FROM page_studio_customer_adoption_grants')).rows[0].n).toBe(1)
  })
  const withdraw = async (grantId: string, expectedRevision = 1) =>
    (await import('~~/server/utils/pageStudio/customerAdoptionGrant')).withdrawCustomerAdoptionGrant(
      { siteId: fixture.siteId, operator, grantId, expectedRevision },
      { runTransaction }
    )
  it('withdraws once and never reinstates through exact historical replay', async () => {
    const body = await request()
    const first = await grant(body)
    await withdraw(body.grantId)
    const deps = dependencies()
    const replay = await grant(body, deps)
    expect(replay).toEqual({ ...first, historical: true })
    expect(deps.readSource).not.toHaveBeenCalled()
    expect((await db.query('SELECT enabled FROM page_studio_customer_adoption_grants')).rows[0].enabled).toBe(false)
    await expect(
      db.query('UPDATE page_studio_customer_adoption_grants SET enabled=TRUE,withdrawn_at=NULL')
    ).rejects.toThrow()
    await expect(db.query('DELETE FROM page_studio_customer_adoption_grants')).rejects.toThrow()
  })
  it('rejects conflicting replay and active predecessor, then selects exact withdrawn successor', async () => {
    const body = await request()
    await grant(body)
    await expect(grant({ ...body, reason: 'Changed request' })).rejects.toThrow()
    const next = { ...body, grantId: randomUUID(), expectedGrantId: body.grantId, expectedRevision: 1 }
    await expect(grant(next)).rejects.toThrow()
    await withdraw(body.grantId)
    await expect(grant({ ...next, expectedRevision: 2 })).rejects.toThrow()
    await expect(grant(next)).resolves.toMatchObject({ grant: { revision: 2 } })
    expect((await db.query('SELECT count(*)::int AS n FROM page_studio_customer_adoption_grants')).rows[0].n).toBe(2)
  })
  it.each(['owner', 'staff', 'login', 'mapping', 'approval', 'checkpoint', 'entitlement'])(
    'denies %s authority or source drift after remote proof',
    async (kind) => {
      const body = await request(),
        deps = dependencies()
      let changed = false
      deps.readSource.mockImplementation(async () => {
        if (!changed) {
          changed = true
          if (kind === 'owner') await db.query("UPDATE page_studio_customer_accounts SET status='suspended'")
          if (kind === 'staff') await db.query('UPDATE team_members SET is_active=FALSE')
          if (kind === 'login') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
          if (kind === 'mapping')
            await db.query('UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()')
          if (kind === 'approval') await db.query('UPDATE page_studio_customer_cms_setup_approvals SET enabled=FALSE')
          if (kind === 'checkpoint') await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
          if (kind === 'entitlement') await db.query("UPDATE page_studio_entitlements SET status='cancelled'")
        }
        return { storage: fixture.storage, job: fixture.providerJob }
      })
      await expect(grant(body, deps)).rejects.toThrow()
      expect((await db.query('SELECT count(*)::int AS n FROM page_studio_customer_adoption_grants')).rows[0].n).toBe(0)
    }
  )
  it.each([
    'requested',
    'foreign-job',
    'missing-forms',
    'changed-selection',
    'missing-checkpoint',
    'corrupt-checkpoint'
  ])('rejects actual source proof failure: %s', async (kind) => {
    const body = await request(),
      deps = dependencies()
    if (kind === 'requested') fixture.providerJob.phase = 'requested'
    if (kind === 'foreign-job') fixture.providerJob.actor.userId = randomUUID()
    if (kind === 'missing-forms') Reflect.deleteProperty(fixture.storage.selection, 'formDrafts')
    if (kind === 'changed-selection') {
      let n = 0
      deps.readSource.mockImplementation(async () => {
        if (++n === 2) fixture.storage.selection.target.runtimeDigest = 'f'.repeat(64)
        return { storage: fixture.storage, job: fixture.providerJob }
      })
    }
    if (kind === 'missing-checkpoint') fixture.bucket.get.mockResolvedValue(null)
    if (kind === 'corrupt-checkpoint') fixture.bucket.get.mockResolvedValue({ body: new Response('{}').body! })
    await expect(grant(body, deps)).rejects.toThrow()
  })
  it.each([0, -1000, 90000_000])('rejects invalid finite grant duration %s', async (ms) => {
    const body = await request()
    await expect(grant({ ...body, expiresAt: new Date(Date.now() + ms).toISOString() })).rejects.toThrow()
  })
  it('rolls back grant and selection if trigger audit fails', async () => {
    const body = await request()
    await db.query(`CREATE FUNCTION fail_adoption_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.action='customer.adoption-grant.issued' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_adoption_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION fail_adoption_audit();`)
    try {
      await expect(grant(body)).rejects.toThrow()
      expect((await db.query('SELECT count(*)::int AS n FROM page_studio_customer_adoption_grants')).rows[0].n).toBe(0)
    } finally {
      await db.query('DROP FUNCTION fail_adoption_audit() CASCADE')
    }
  })
  const config = {
    enabled: true,
    dashboardOrigin: 'https://customers.example.test',
    editorOrigin: 'https://editor.example.test'
  }
  const child = async (grantId: string) => {
    const { issueCustomerCmsAdoptionHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    const ticket = await issueCustomerCmsAdoptionHandoff(
      fixture.login.sessionToken,
      config,
      { grantId, revision: 1 },
      { runTransaction }
    )
    const { exchangeCustomerEditorSession } = await import('~~/server/utils/pageStudio/customerEditorSessions')
    let claims: CustomerEditorClaims | undefined
    await exchangeCustomerEditorSession(ticket.token, config, {
      runTransaction,
      signToken: async (value) => {
        claims = value
        return 'signed-test-token'
      }
    })
    return claims!
  }
  it('uses expired preview only as history and grants exactly a fifteen-minute adoption child', async () => {
    await db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp())+0.02))', [
      fixture.policy.expiresAt
    ])
    const plan = (await db.query('SELECT to_jsonb(e) AS value FROM page_studio_entitlements e')).rows
    const body = await request()
    await grant(body)
    const claims = await child(body.grantId)
    expect(claims.capabilities).toEqual(['cms:adopt'])
    expect(claims.expiresAt - claims.issuedAt).toBeLessThanOrEqual(900)
    const { assertCustomerEditorSessionAuthority } =
      await import('~~/server/utils/pageStudio/customerEditorSessionAuthority')
    await expect(
      runTransaction((c) => assertCustomerEditorSessionAuthority(claims, 'cms:adopt', c))
    ).resolves.toBeTruthy()
    for (const capability of [
      'cms:prepare',
      'workspace:create',
      'workspace:checkpoint',
      'workspace:reconnect',
      'workspace:publish',
      'workspace:discard',
      'workspace:heartbeat'
    ])
      await expect(runTransaction((c) => assertCustomerEditorSessionAuthority(claims, capability, c))).rejects.toThrow()
    expect((await db.query('SELECT to_jsonb(e) AS value FROM page_studio_entitlements e')).rows).toEqual(plan)
    const { issueCustomerEditorHandoff, issueCustomerCmsSetupHandoff } =
      await import('~~/server/utils/pageStudio/customerEditorHandoff')
    await expect(issueCustomerEditorHandoff(fixture.login.sessionToken, config, { runTransaction })).rejects.toThrow()
    await expect(issueCustomerCmsSetupHandoff(fixture.login.sessionToken, config, { runTransaction })).rejects.toThrow()
  })
  it('withdrawal denies an already issued adoption child', async () => {
    const body = await request()
    await grant(body)
    const claims = await child(body.grantId)
    await withdraw(body.grantId)
    const { assertCustomerEditorSessionAuthority } =
      await import('~~/server/utils/pageStudio/customerEditorSessionAuthority')
    await expect(runTransaction((c) => assertCustomerEditorSessionAuthority(claims, 'cms:adopt', c))).rejects.toThrow()
  })

  const setupOptions = () => {
    let freeze: z.infer<typeof CmsFreezeReceiptSchema> | null = null
    const router = {
      readManagedCmsTarget: vi.fn(async () => fixture.storage.selection.target),
      freezeManagedCms: vi.fn(async (request: unknown) => {
        if (!freeze) {
          const body = { state: 'frozen' as const, createdAt: new Date().toISOString(), request }
          freeze = CmsFreezeReceiptSchema.parse({ ...body, digest: await collectionDigest(body) })
        }
        return freeze
      }),
      readManagedCmsFreeze: vi.fn(async () => freeze),
      readFrozenCmsPage: vi.fn(async (request: { cursor: unknown; limit: number }) => {
        const counts = { content: 0, schema: 0, record: 0 },
          inventoryIdentity = await collectionDigest({ counts, formatVersion: 1, freezeDigest: freeze.digest })
        return {
          counts,
          inventoryIdentity,
          items: [],
          nextCursor: null,
          pageDigest: await collectionDigest({
            cursor: request.cursor,
            limit: request.limit,
            inventoryIdentity,
            formatVersion: 1,
            items: [],
            nextCursor: null
          })
        }
      }),
      readManagedCmsObjects: vi.fn(async () => [])
    }
    const env: Record<string, unknown> = {
      ...nativeSourceCmsEnvironment(router, fixture.bucket, config.editorOrigin),
      PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED: 'true'
    }
    attachCmsManagement(env, runTransaction)
    return { ...dependencies(), configuration: config, env, signToken: async () => 'signed-test-token', router }
  }
  it('continues only the unchanged adoption protocol through managed state after expired preview', async () => {
    await db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp())+0.02))', [
      fixture.policy.expiresAt
    ])
    const body = await request()
    await grant(body)
    const options = setupOptions(),
      ref = { grantId: body.grantId, revision: 1 }
    const api = await import('~~/server/utils/pageStudio/customerAdoptionSetup')
    expect(await api.readCustomerAdoptionSetup(fixture.login.sessionToken, ref, options)).toEqual({
      resumeRequired: true,
      adoption: null
    })
    expect(
      await api.mutateCustomerAdoptionSetup(fixture.login.sessionToken, { operation: 'resume', grant: ref }, options)
    ).toEqual({ resumed: true })
    let value = CustomerCmsAdoptionStatusSchema.parse(
      await api.mutateCustomerAdoptionSetup(
        fixture.login.sessionToken,
        { operation: 'adoption', grant: ref, request: { action: 'start' } },
        options
      )
    )
    expect(value.phase).toBe('freezing')
    for (let n = 0; n < 5 && value.phase !== 'managed'; n++)
      value = CustomerCmsAdoptionStatusSchema.parse(
        await api.mutateCustomerAdoptionSetup(
          fixture.login.sessionToken,
          {
            operation: 'adoption',
            grant: ref,
            request: { action: 'advance', adoptionId: value.adoptionId, expectedProgressDigest: value.progressDigest }
          },
          options
        )
      )
    expect(value.phase).toBe('managed')
    expect((await api.readCustomerAdoptionSetup(fixture.login.sessionToken, ref, options)).adoption?.phase).toBe(
      'managed'
    )
    expect(
      (await db.query('SELECT plan_key,status,monthly_ai_operation_limit FROM page_studio_entitlements')).rows
    ).toEqual([{ plan_key: 'customer_preview_v1', status: 'trial', monthly_ai_operation_limit: 0 }])
    await expect(
      grant({ ...body, grantId: randomUUID(), expectedGrantId: body.grantId, expectedRevision: 1 })
    ).rejects.toThrow()
  })
  it('rejects schema operations and foreign grant references before any adoption effect', async () => {
    const body = await request()
    await grant(body)
    const options = setupOptions(),
      api = await import('~~/server/utils/pageStudio/customerAdoptionSetup')
    await expect(
      api.mutateCustomerAdoptionSetup(
        fixture.login.sessionToken,
        {
          operation: 'schema',
          grant: { grantId: body.grantId, revision: 1 },
          request: { action: 'start', kind: 'collection' }
        },
        options
      )
    ).rejects.toThrow()
    await expect(
      api.mutateCustomerAdoptionSetup(
        fixture.login.sessionToken,
        { operation: 'resume', grant: { grantId: randomUUID(), revision: 1 } },
        options
      )
    ).rejects.toThrow()
    expect(options.router.freezeManagedCms).not.toHaveBeenCalled()
  })
  it('reuses an active linked child, never an unrelated setup or editor child', async () => {
    const body = await request()
    await grant(body)
    const options = setupOptions(),
      api = await import('~~/server/utils/pageStudio/customerAdoptionSetup')
    const input = { operation: 'resume', grant: { grantId: body.grantId, revision: 1 } }
    await api.mutateCustomerAdoptionSetup(fixture.login.sessionToken, input, options)
    await api.mutateCustomerAdoptionSetup(fixture.login.sessionToken, input, options)
    expect((await db.query('SELECT count(*)::int AS n FROM page_studio_customer_editor_sessions')).rows[0].n).toBe(1)
  })

  it('denies operator expiry during the final child read', async () => {
    const body = await request()
    await grant(body)
    const claims = await child(body.grantId)
    const { assertCustomerEditorSessionAuthority } =
      await import('~~/server/utils/pageStudio/customerEditorSessionAuthority')
    await expect(
      runTransaction(async (c) =>
        assertCustomerEditorSessionAuthority(claims, 'cms:adopt', {
          query: async (sql: string, args?: unknown[]) => {
            const result = await c.query(sql, args)
            if (sql.includes('WHERE nonce = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()'))
              await c.query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval '1 second'")
            return result
          }
        })
      )
    ).rejects.toThrow()
  })

  it('serializes competing reviewed grants without duplicate selection or audit', async () => {
    const body = await request(),
      next = { ...body, grantId: randomUUID() }
    const results = await Promise.allSettled([grant(body), grant(next)])
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1)
    expect((await db.query('SELECT count(*)::int AS n FROM page_studio_customer_adoption_grants')).rows[0].n).toBe(1)
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM page_studio_audit_events WHERE action='customer.adoption-grant.issued'"
        )
      ).rows[0].n
    ).toBe(1)
  })
  it('keeps grant selection and payload immutable and rejects orphan or skipped revisions', async () => {
    const body = await request()
    await grant(body)
    for (const sql of [
      'UPDATE page_studio_customer_adoption_grants SET source=source || \'{"unexpected":true}\'::jsonb',
      "UPDATE page_studio_customer_adoption_grants SET expires_at=expires_at+interval '1 second'",
      'DELETE FROM page_studio_customer_adoption_selections',
      'UPDATE page_studio_customer_adoption_selections SET revision=revision+2'
    ])
      await expect(db.query(sql)).rejects.toThrow()
    await expect(
      db.query('UPDATE page_studio_customer_adoption_selections SET grant_id=$1,revision=2', [randomUUID()])
    ).rejects.toThrow()
  })
  it('keeps legacy handoffs unlinked and rejects null, foreign and mutable adoption linkage', async () => {
    const body = await request()
    await grant(body)
    const { issueCustomerCmsAdoptionHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    await issueCustomerCmsAdoptionHandoff(
      fixture.login.sessionToken,
      config,
      { grantId: body.grantId, revision: 1 },
      { runTransaction }
    )
    expect(
      (
        await db.query(
          "SELECT adoption_grant_id,adoption_grant_revision FROM page_studio_customer_editor_handoffs WHERE purpose='editor'"
        )
      ).rows[0]
    ).toEqual({ adoption_grant_id: null, adoption_grant_revision: null })
    for (const suffix of [
      'adoption_grant_id=NULL',
      'adoption_grant_revision=2',
      "purpose='editor'",
      "environment='production'"
    ])
      await expect(
        db.query(`UPDATE page_studio_customer_editor_handoffs SET ${suffix} WHERE purpose='cms-adoption'`)
      ).rejects.toThrow()
    // INSERT constraints independently deny malformed links, not only immutable UPDATE.
    const insert = (purpose: string, grantId: string | null, revision: number | null) =>
      db.query(
        `INSERT INTO page_studio_customer_editor_handoffs
    (token_hash,login_session_hash,identity_id,workspace_id,site_id,tenant_id,business_id,dashboard_origin,editor_origin,expires_at,purpose,adoption_grant_id,adoption_grant_revision)
    SELECT $1,login_session_hash,identity_id,workspace_id,site_id,tenant_id,business_id,dashboard_origin,editor_origin,clock_timestamp()+interval '1 minute',$2,$3,$4 FROM page_studio_customer_editor_handoffs WHERE purpose='editor'`,
        [randomUUID().replaceAll('-', '').repeat(2), purpose, grantId, revision]
      )
    await expect(insert('cms-adoption', null, null)).rejects.toThrow()
    await expect(insert('cms-adoption', body.grantId, 2)).rejects.toThrow()
    await expect(insert('cms-adoption', randomUUID(), 1)).rejects.toThrow()
    await expect(insert('editor', body.grantId, 1)).rejects.toThrow()
  })
  it.each([
    'staff-revoked',
    'login-revoked',
    'owner-revoked',
    'membership-revoked',
    'source-changed',
    'foreign-grant',
    'overlong'
  ])('denies linked child after %s', async (kind) => {
    const body = await request()
    await grant(body)
    const claims = await child(body.grantId)
    if (kind === 'staff-revoked') await db.query('UPDATE team_members SET is_active=FALSE')
    if (kind === 'login-revoked') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    if (kind === 'owner-revoked')
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
    if (kind === 'membership-revoked')
      await db.query('UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()')
    if (kind === 'source-changed') await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
    if (kind === 'foreign-grant') claims.nonce = randomUUID()
    if (kind === 'overlong') claims.expiresAt = claims.issuedAt + 901
    const { assertCustomerEditorSessionAuthority } =
      await import('~~/server/utils/pageStudio/customerEditorSessionAuthority')
    await expect(runTransaction((c) => assertCustomerEditorSessionAuthority(claims, 'cms:adopt', c))).rejects.toThrow()
  })
  it('fresh owner login uses existing explicit adoption recovery without relabelling old children', async () => {
    const body = await request()
    await grant(body)
    const options = setupOptions(),
      api = await import('~~/server/utils/pageStudio/customerAdoptionSetup'),
      ref = { grantId: body.grantId, revision: 1 }
    await api.mutateCustomerAdoptionSetup(fixture.login.sessionToken, { operation: 'resume', grant: ref }, options)
    const first = CustomerCmsAdoptionStatusSchema.parse(
      await api.mutateCustomerAdoptionSetup(
        fixture.login.sessionToken,
        { operation: 'adoption', grant: ref, request: { action: 'start' } },
        options
      )
    )
    const old = (await db.query('SELECT to_jsonb(h) AS row FROM page_studio_customer_editor_handoffs h')).rows
    const signup = await import('~~/server/utils/pageStudio/customerSignup'),
      email = await signup.requestCustomerSignIn(
        { email: 'adoption-owner@example.test', mode: 'signin' },
        'v1',
        runTransaction
      )
    const fresh = await signup.verifyCustomerSignIn(email!.token, runTransaction)
    await api.mutateCustomerAdoptionSetup(fresh.sessionToken, { operation: 'resume', grant: ref }, options)
    expect((await api.readCustomerAdoptionSetup(fresh.sessionToken, ref, options)).adoption?.recoveryRequired).toBe(
      true
    )
    const recovered = await api.mutateCustomerAdoptionSetup(
      fresh.sessionToken,
      {
        operation: 'adoption',
        grant: ref,
        request: {
          action: 'recover',
          adoptionId: first.adoptionId,
          recoveryId: 'explicit_recovery',
          expectedRecoveryId: null
        }
      },
      options
    )
    expect(recovered).toMatchObject({ recoveryRequired: false, recoveryId: 'explicit_recovery' })
    expect(
      (
        await db.query('SELECT to_jsonb(h) AS row FROM page_studio_customer_editor_handoffs h WHERE id=$1', [
          old[0].row.id
        ])
      ).rows
    ).toEqual(old)
  })
  it('rejects an unexpired preview rather than adding parallel adoption authority', async () => {
    await expect(inspect()).rejects.toThrow()
  })

  it('old pre-expiry editor and setup children cannot adopt after a linked renewal', async () => {
    const body = await request()
    await grant(body)
    await child(body.grantId)
    const { assertCustomerEditorSessionAuthority } =
      await import('~~/server/utils/pageStudio/customerEditorSessionAuthority')
    expect(fixture.legacyClaims).toHaveLength(2)
    for (const claims of fixture.legacyClaims)
      await expect(
        runTransaction((c) =>
          assertCustomerEditorSessionAuthority(
            claims,
            claims.capabilities.includes('cms:adopt') ? 'cms:adopt' : 'workspace:create',
            c
          )
        )
      ).rejects.toThrow()
  })
  it('uses only the fixed native read bindings and rejects mid-read configuration substitution', async () => {
    const body = await request()
    const provisioner = { readProvisioning: vi.fn(async () => fixture.providerJob) }
    const router = { readExistingSourceAdoptionProof: vi.fn(async () => fixture.storage) }
    const env: Record<string, unknown> = {
      PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
      PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: provisioner,
      PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: router,
      PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: fixture.bucket
    }
    await expect(inspect({ runTransaction, env })).resolves.toMatchObject({ sourceDigest: body.sourceDigest })
    expect(provisioner.readProvisioning).toHaveBeenCalledWith(fixture.job.requestKey, fixture.scope)
    expect(router.readExistingSourceAdoptionProof).toHaveBeenCalledWith({ scope: fixture.scope })
    const original = fixture.bucket.get.getMockImplementation()!
    fixture.bucket.get.mockImplementation(async () => {
      env.PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER = { readExistingSourceAdoptionProof: async () => fixture.storage }
      return original()
    })
    await expect(grant(body, { runTransaction, env })).rejects.toThrow()
    expect((await db.query('SELECT count(*)::int AS n FROM page_studio_customer_adoption_grants')).rows[0].n).toBe(0)
  })
  it('stops the next native dispatch when the job read withdraws configuration', async () => {
    const body = await request()
    const router = { readExistingSourceAdoptionProof: vi.fn(async () => fixture.storage) }
    const env: Record<string, unknown> = {
      PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
      PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: router,
      PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: fixture.bucket
    }
    env.PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER = {
      readProvisioning: async () => {
        env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED = 'false'
        return fixture.providerJob
      }
    }
    await expect(grant(body, { runTransaction, env })).rejects.toThrow()
    expect(router.readExistingSourceAdoptionProof).not.toHaveBeenCalled()
  })
  it('denies missing native bindings without falling back to a shared provisioner', async () => {
    const body = await request(),
      fallback = vi.fn(async () => fixture.providerJob)
    await expect(
      grant(body, {
        runTransaction,
        env: {
          PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
          PAGE_STUDIO_PROVISIONER: { readProvisioning: fallback },
          PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget: async () => fixture.storage.selection.target },
          PAGE_STUDIO_CHECKPOINTS: fixture.bucket
        }
      })
    ).rejects.toThrow()
    expect(fallback).not.toHaveBeenCalled()
  })
  it('checks actual grant expiry for an already linked child', async () => {
    const body = await request()
    body.expiresAt = new Date(Date.now() + 2500).toISOString()
    await grant(body)
    const claims = await child(body.grantId)
    await db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp())+0.02))', [
      body.expiresAt
    ])
    const { assertCustomerEditorSessionAuthority } =
      await import('~~/server/utils/pageStudio/customerEditorSessionAuthority')
    await expect(runTransaction((c) => assertCustomerEditorSessionAuthority(claims, 'cms:adopt', c))).rejects.toThrow()
  })
  it('reapplies the additive migration without changing retained legacy or adoption rows', async () => {
    const body = await request()
    await grant(body)
    await child(body.grantId)
    const before = (await db.query('SELECT to_jsonb(h) AS row FROM page_studio_customer_editor_handoffs h ORDER BY id'))
      .rows
    await db.query(migration('475_page_studio_customer_adoption_grants.sql'))
    expect(
      (await db.query('SELECT to_jsonb(h) AS row FROM page_studio_customer_editor_handoffs h ORDER BY id')).rows
    ).toEqual(before)
  })
  it('rejects an existing foreign-environment CMS scope instead of treating staging absence as new adoption', async () => {
    const body = await request(),
      scope = { ...fixture.scope, environment: 'production' }
    await db.query(
      `INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,target,adoption_id)
      VALUES($1,$2,$3,$3,$4,'production','legacy',$5::jsonb,'foreign-adoption')`,
      [
        JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment]),
        scope.tenantId,
        scope.clientId,
        scope.siteId,
        JSON.stringify(fixture.storage.selection.target)
      ]
    )
    await expect(grant(body)).rejects.toThrow()
  })
  it('rejects a valid foreign site handoff through the composite grant scope key', async () => {
    const body = await request()
    await grant(body)
    const { createCustomerWorkspace } = await import('~~/server/utils/pageStudio/customerWorkspaces')
    const workspace = await createCustomerWorkspace(
      { identityId: fixture.login.identityId, requestId: randomUUID(), name: 'Other workspace' },
      runTransaction
    )
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const other = await createCustomerPreviewSite(
      {
        workspaceId: workspace.workspace.id,
        identityId: fixture.login.identityId,
        requestId: randomUUID(),
        name: 'Other site',
        route: 'other-site',
        starterVersion: 'floristry-v1'
      },
      {
        runTransaction,
        previewPolicy: {
          ...fixture.policy,
          approvalId: randomUUID(),
          expiresAt: new Date(Date.now() + 60000).toISOString()
        }
      }
    )
    const loginHash = (await db.query('SELECT token_hash FROM page_studio_customer_sessions')).rows[0].token_hash
    await expect(
      db.query(
        `INSERT INTO page_studio_customer_editor_handoffs
      (token_hash,login_session_hash,identity_id,workspace_id,site_id,tenant_id,business_id,dashboard_origin,editor_origin,expires_at,purpose,adoption_grant_id,adoption_grant_revision)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+interval '1 minute','cms-adoption',$10,1)`,
        [
          'f'.repeat(64),
          loginHash,
          fixture.login.identityId,
          other.workspaceId,
          other.site.id,
          other.tenantId,
          other.businessId,
          config.dashboardOrigin,
          config.editorOrigin,
          body.grantId
        ]
      )
    ).rejects.toMatchObject({ constraint: 'customer_handoff_adoption_scope' })
  })
})
