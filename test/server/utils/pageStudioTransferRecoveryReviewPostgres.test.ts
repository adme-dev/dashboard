import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import type { CmsFreezeReceiptSchema } from '~~/shared/pageStudio/cmsManaged'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => {
    throw new Error('Use disposable transaction')
  },
  transaction: () => {
    throw new Error('Use disposable transaction')
  }
}))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname) ||
    url.search
  )
    throw new Error('Disposable localhost studio_cms database required')
}

describe.runIf(Boolean(databaseUrl))('explicit recovery review and consent on PostgreSQL', { timeout: 20000 }, () => {
  const schema = `review_${randomUUID().replaceAll('-', '')}`
  const actorId = randomUUID()
  const operatorHash = 'a'.repeat(64)
  let db: pg.Client
  let ownerToken: string
  let input: {
    siteId: string
    entitlementId: string
    ownerLoginSessionHash: string
    operator: { actorId: string; loginSessionHash: string }
  }
  let expected: { identityId: string; accountId: string; workspaceId: string; tenantId: string; businessId: string }
  const runTransaction = async <T>(work: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      await client.query("SET LOCAL statement_timeout='6s'")
      await client.query("SET LOCAL TIME ZONE 'UTC'")
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      await client.end()
    }
  }
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN DEFAULT FALSE);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT,role TEXT,revoked_at TIMESTAMPTZ);
      CREATE TABLE transfer_effects(value TEXT);`)
    for (const name of [
      '402_page_studio_control_plane.sql',
      '404_page_studio_documents.sql',
      '420_page_studio_login_sessions.sql',
      '422_page_studio_cms_visibility.sql',
      '425_page_studio_cms_authoring_scope.sql',
      '442_page_studio_customer_workspaces.sql',
      '443_page_studio_customer_signup.sql',
      '444_page_studio_customer_site_ownership.sql'
    ]) {
      await db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
    }
  })
  beforeEach(async () => {
    await db.query(
      'TRUNCATE agency_clients,team_members,page_studio_customer_identities,page_studio_customer_accounts,page_studio_login_sessions,transfer_effects CASCADE'
    )
    await db.query("INSERT INTO team_members VALUES($1,TRUE,'owner',NULL,NULL)", [actorId])
    await db.query(
      `INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,
      [operatorHash, actorId]
    )
    const signup = await import('~~/server/utils/pageStudio/customerSignup')
    const requested = await signup.requestCustomerSignIn(
      { email: 'transfer-owner@example.test', name: 'Transfer owner', mode: 'signup', acceptedTerms: true },
      'preview-v1',
      runTransaction
    )
    const login = await signup.verifyCustomerSignIn(requested!.token, runTransaction)
    ownerToken = login.sessionToken
    const { createCustomerWorkspace } = await import('~~/server/utils/pageStudio/customerWorkspaces')
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const workspace = await createCustomerWorkspace(
      { identityId: login.identityId, requestId: randomUUID(), name: 'Transfer test' },
      runTransaction
    )
    const site = await createCustomerPreviewSite(
      {
        workspaceId: workspace.workspace.id,
        identityId: login.identityId,
        requestId: randomUUID(),
        name: 'Transfer source',
        route: 'transfer-test',
        starterVersion: 'floristry-v1'
      },
      {
        runTransaction,
        previewPolicy: {
          approvalId: randomUUID(),
          approvedBy: actorId,
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
          pagesPerSiteLimit: 5,
          storageBytesLimit: 10000,
          monthlyBuildLimit: 10,
          monthlyTrafficBytesLimit: 10000
        }
      }
    )
    const { grantCustomerPublishingPlan } = await import('~~/server/utils/pageStudio/customerPlanGrants')
    const plan = await grantCustomerPublishingPlan(
      {
        actorId,
        body: {
          requestId: randomUUID(),
          workspaceId: site.workspaceId,
          expectedEntitlementId: (await db.query('SELECT entitlement_id FROM page_studio_sites')).rows[0]
            .entitlement_id,
          planKey: 'studio_business',
          pagesPerSiteLimit: 10,
          storageBytesLimit: 100000,
          domainLimit: 2,
          aiOperationLimit: 0,
          buildLimit: 20,
          trafficBytesLimit: 100000,
          effectiveUntil: null,
          reason: 'Approved publishing plan'
        }
      },
      { runTransaction }
    )
    const { digestPortalSessionToken } = await import('~~/server/utils/portalSession')
    input = {
      siteId: site.site.id,
      entitlementId: plan.entitlement.id,
      ownerLoginSessionHash: await digestPortalSessionToken(login.sessionToken),
      operator: { actorId, loginSessionHash: operatorHash }
    }
    expected = {
      identityId: login.identityId,
      accountId: (await db.query('SELECT id FROM page_studio_customer_accounts')).rows[0].id,
      workspaceId: site.workspaceId,
      tenantId: site.tenantId,
      businessId: site.businessId
    }
  })
  afterAll(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await db.end()
    }
  })

  let key: string, generation: string, schemaObject: string, contentObject: string, recordObject: string
  let sourceFreeze: z.infer<typeof CmsFreezeReceiptSchema>
  const pin = (kind: string, version = 1) => ({
    kind,
    collectionId: kind === 'content' ? '' : 'products',
    recordId: kind === 'record' ? 'first' : '',
    version,
    bytes: 30,
    freezeDigest: sourceFreeze.digest,
    operationId: 'adoption_a',
    origin: 'legacy',
    sha256: 'a'.repeat(64)
  })
  beforeAll(async () => {
    await db.query(readFileSync('server/database/migrations/457_page_studio_managed_transfer_intents.sql', 'utf8'))
    for (const name of readdirSync('server/database/migrations')
      .filter((name) => /^(45[89]|46[0-9]|470|471)_/.test(name))
      .sort()) {
      await db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
    }
    await db.query(readFileSync('server/database/migrations/473_page_studio_transfer_recovery_heads.sql', 'utf8'))
    await db.query(readFileSync('server/database/migrations/472_page_studio_transfer_requests.sql', 'utf8'))
    await db.query(
      readFileSync('server/database/migrations/474_page_studio_transfer_recovery_reconciliations.sql', 'utf8')
    )
    await db.query(
      readFileSync('server/database/migrations/474_page_studio_transfer_recovery_reconciliations.sql', 'utf8')
    )
    await db
      .query(readFileSync('server/database/migrations/476_page_studio_transfer_recovery_reviews.sql', 'utf8'))
      .catch((error) => {
        throw new Error(`Migration476 position ${error.position}: ${error.message}`)
      })
    await db
      .query(readFileSync('server/database/migrations/476_page_studio_transfer_recovery_reviews.sql', 'utf8'))
      .catch((error) => {
        throw new Error(`Migration476 position ${error.position}: ${error.message}`)
      })
  })
  beforeEach(async () => {
    const scope = {
      tenantId: expected.tenantId,
      clientId: expected.businessId,
      businessId: expected.businessId,
      siteId: input.siteId,
      environment: 'staging'
    }
    key = JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment])
    generation = randomUUID()
    schemaObject = randomUUID()
    contentObject = randomUUID()
    recordObject = randomUUID()
    const applicationId = randomUUID()
    const manifest = {
      formatVersion: 1,
      scope,
      generation,
      applicationId,
      checkpoint: { id: 'checkpoint_a', digest: 'c'.repeat(64) },
      schemas: [{ collectionId: 'products', objectId: schemaObject }],
      components: [],
      actions: [],
      previousApplicationId: null
    }
    await db.query(
      `INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
        VALUES('checkpoint_a',$1,$2,$3,$4,$5,'fixture',clock_timestamp())`,
      [
        scope.tenantId,
        scope.clientId,
        scope.siteId,
        'c'.repeat(64),
        `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/checkpoint_a.json`
      ]
    )
    await db.query("UPDATE page_studio_sites SET current_checkpoint_id='checkpoint_a' WHERE id=$1", [input.siteId])
    const target = {
      accountId: 'a'.repeat(32),
      databaseId: randomUUID(),
      name: `ps-content-${'b'.repeat(32)}`,
      routeId: 'route_a',
      runtimeDigest: 'a'.repeat(64),
      collectionReceiptDigest: 'b'.repeat(64),
      workflowReceiptDigest: 'c'.repeat(64),
      stagingReceiptDigest: 'd'.repeat(64)
    }
    const freezeBody = {
      createdAt: '2026-10-15T00:00:00.000Z',
      state: 'frozen' as const,
      request: {
        formatVersion: 1 as const,
        adoptionId: 'adoption_a',
        actor: { kind: 'agency-user' as const, userId: actorId, loginSessionHash: operatorHash },
        scope,
        target
      }
    }
    sourceFreeze = { ...freezeBody, digest: await collectionDigest(freezeBody) }
    await db.query(
      `INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest)
        VALUES($1,$2,$3,$3,$4,'staging','legacy','adoption_a',$5,$6,$7)`,
      [key, scope.tenantId, scope.clientId, scope.siteId, generation, target, sourceFreeze.digest]
    )
    await db.query(
      `INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id)
        VALUES($1,$2,$3,$4,$5,'adoption_a')`,
      [key, generation, applicationId, await collectionDigest(manifest), manifest]
    )
    for (const [kind, id] of [
      ['schema', schemaObject],
      ['content', contentObject],
      ['record', recordObject]
    ]) {
      await db.query(
        `INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id)
          VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,clock_timestamp(),'adoption_a')`,
        [
          key,
          generation,
          id,
          kind,
          kind === 'content' ? '' : 'products',
          kind === 'record' ? 'first' : '',
          pin(kind!),
          kind === 'record' ? schemaObject : null,
          kind === 'record' ? false : null,
          expected.identityId
        ]
      )
    }
    await db.query(
      `INSERT INTO page_studio_cms_application_schemas(scope_key,generation,application_id,collection_id,object_id)
        VALUES($1,$2,$3,'products',$4)`,
      [key, generation, applicationId, schemaObject]
    )
    await db.query(
      `INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id)
        VALUES($1,$2,'products','first',$3)`,
      [key, generation, recordObject]
    )
    await db.query(
      "UPDATE page_studio_cms_scopes SET state='managed',current_application_id=$2,current_content_id=$3 WHERE scope_key=$1",
      [key, applicationId, contentObject]
    )
  })

  let requestId: string
  beforeEach(() => {
    requestId = randomUUID()
  })
  async function control(action: string, revision?: number, changes = {}, run = runTransaction) {
    const { executeTransferControls } = await import('~~/workers/page-studio-management/src/transferControls')
    return executeTransferControls(
      {
        expectedEnvironment: 'production',
        action,
        siteId: input.siteId,
        ...(action === 'owner-status' ? {} : { requestId }),
        ...(['review', 'reserve', 'operator-status'].includes(action)
          ? { operator: input.operator }
          : { ownerLoginSessionHash: input.ownerLoginSessionHash }),
        ...(revision === undefined ? {} : { expectedRevision: revision }),
        ...changes
      },
      { runTransaction: run }
    )
  }
  async function approved() {
    await control('request')
    await control('review', 1)
    return control('approve', 2)
  }

  async function fixture(expiringPlan = false, recoveryMillis = 3600000) {
    if (expiringPlan)
      await db.query(
        "UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+interval '5 seconds' WHERE id=$1",
        [input.entitlementId]
      )
    await approved()
    await control('reserve', 3)
    const stored = (
      await db.query('SELECT operation_id,intent_digest,intent FROM page_studio_managed_transfer_intents')
    ).rows[0]
    const reference = { operationId: stored.operation_id, intentDigest: stored.intent_digest }
    const resources = await import('~~/server/utils/pageStudio/managedTransferResources')
    const artifacts = {
      runtimeDigest: 'd'.repeat(64),
      schemaDigest: 'e'.repeat(64),
      policyVersion: 'content-attachment-v1'
    }
    const prepared = await resources.prepareManagedTransferResources(reference, { runTransaction, artifacts })
    const attachment = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
    const databaseId = randomUUID()
    const physical = {
      version: 1,
      ...reference,
      resourceIdentity: prepared.resourceIdentity,
      preparationId: randomUUID(),
      preparationDigest: '1'.repeat(64),
      database: {
        accountId: 'a'.repeat(32),
        databaseId,
        name: `ps-content-${'3'.repeat(32)}`,
        schemaDigest: artifacts.schemaDigest
      },
      worker: {
        accountId: 'a'.repeat(32),
        databaseId,
        scope: attachment.scope,
        namespace: 'xeroflow-page-studio-dispatch-production',
        scriptName: `ps-content-${'4'.repeat(32)}`,
        ownerTag: `ps-owner-${'5'.repeat(32)}`,
        compatibilityDate: '2026-08-18',
        runtimeDigest: artifacts.runtimeDigest,
        setupDigest: await collectionDigest({ attachmentIdentity: prepared.resourceIdentity, mode: attachment.mode }),
        etag: 'fixture-etag'
      }
    }
    await resources.bindManagedTransferResources(reference, {
      runTransaction,
      provider: { accountId: 'a'.repeat(32), compatibilityDate: '2026-08-18' },
      inspect: async () => physical
    })
    const { prepareManagedTransferDestinationCatalogue } =
      await import('~~/server/utils/pageStudio/managedTransferDestinationCatalogue')
    const env = { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
    const catalogueRequest = await prepareManagedTransferDestinationCatalogue(reference, { runTransaction, env })
    const { planManagedTransferDestinationCatalogue } =
      await import('~~/shared/pageStudio/managed-transfer-destination-catalogue-result')
    const plan = await planManagedTransferDestinationCatalogue(catalogueRequest)
    const { coordinateManagedTransferDestinationCatalogue } =
      await import('~~/server/utils/pageStudio/managedTransferDestinationCatalogueCoordinator')
    await coordinateManagedTransferDestinationCatalogue(
      { ...reference, action: 'verify' },
      {
        runTransaction,
        env: {
          ...env,
          PAGE_STUDIO_PROVISIONER: {
            inspectManagedTransferDestinationCatalogue: async () => ({
              ...reference,
              requestDigest: plan.requestDigest,
              planDigest: plan.planDigest,
              state: 'ready',
              completedPhases: ['collection', 'workflow', 'staging', 'forms'],
              receipt: plan.receipt
            })
          }
        }
      }
    )
    const recoveryId = randomUUID(),
      deadline = new Date(Date.now() + recoveryMillis).toISOString()
    const { changeCustomerTransferRecovery } = await import('~~/server/utils/pageStudio/customerTransferRecovery')
    await changeCustomerTransferRecovery(
      {
        siteId: input.siteId,
        requestId,
        operator: input.operator,
        body: { action: 'open', expectedRevision: 5, expectedHeadVersion: null, recoveryId, deadline }
      },
      { runTransaction }
    )
    const request = { ...reference, resourceRequest: attachment }
    return {
      purpose: 'inventory' as const,
      request,
      requestDigest: await collectionDigest(request),
      recovery: { ...reference, recoveryId, epoch: 1, version: 1, mode: 'closed' as const },
      inspection: {
        operatorId: actorId,
        loginSessionHash: operatorHash,
        pg: { requestId, requestRevision: 5, recoveryId, epoch: 1, version: 1, deadline }
      },
      source: {
        scope: stored.intent.authority.source,
        target: stored.intent.source.context.state.target,
        freezeDigest: stored.intent.source.context.state.freeze_digest,
        checkpoint: {
          checkpointId: stored.intent.source.checkpoint.id,
          objectKey: stored.intent.source.checkpoint.object_key,
          digest: stored.intent.source.checkpoint.digest
        }
      },
      catalogueRequest
    }
  }
  async function observation(value: Awaited<ReturnType<typeof fixture>>) {
    const { planManagedTransferDestinationCatalogue } =
      await import('~~/shared/pageStudio/managed-transfer-destination-catalogue-result')
    const plan = await planManagedTransferDestinationCatalogue(value.catalogueRequest)
    const digest = 'd'.repeat(64)
    const registry = { executions: 0, uploads: 0, destinations: 0, authoring: 0 }
    const physical = {
      transferSchema: 0,
      transferFences: 0,
      importSchema: 0,
      imports: 0,
      preparations: 0,
      preparedObjects: 0
    }
    // Trusted observer fixture only. Studio separately tests actual provider/D1 observations.
    return {
      kind: 'completed-early-phase-inventory',
      version: 1,
      envelopeDigest: await collectionDigest(value),
      recovery: value.recovery,
      resources: {
        digest: await collectionDigest(value.catalogueRequest.baseline),
        resourceIdentity: value.catalogueRequest.baseline.resourceIdentity,
        databaseId: value.catalogueRequest.baseline.database.databaseId
      },
      catalogue: {
        requestDigest: plan.requestDigest,
        planDigest: plan.planDigest,
        receiptDigest: plan.receipt.digest,
        verifiedPhases: ['collection', 'workflow', 'staging', 'forms'],
        snapshotDigest: digest
      },
      source: {
        scope: value.source.scope,
        target: value.source.target,
        freezeDigest: value.source.freezeDigest,
        checkpointDigest: value.source.checkpoint.digest,
        registryDigest: digest,
        workerDigest: digest,
        physicalDigest: digest,
        historyDigest: digest
      },
      destination: { registryDigest: digest, physicalDigest: digest, historyDigest: digest },
      later: {
        sourceRegistry: registry,
        destinationRegistry: registry,
        sourcePhysical: physical,
        destinationPhysical: { ...physical, cutovers: 0 }
      },
      noninterference: {
        version: 1,
        resources: 'complete-one-shot-effects',
        catalogue: 'complete-four-phase-effects',
        catalogueBarrierDigest: digest,
        source: 'exact-adoption-freeze',
        later: 'fresh-pg-admission-and-physical-absence'
      }
    }
  }
  async function capture(
    value: unknown,
    observe: (value: Awaited<ReturnType<typeof fixture>>) => Promise<unknown>,
    run = runTransaction
  ) {
    const { captureCustomerTransferRecoveryReconciliation } =
      await import('~~/server/utils/pageStudio/customerTransferRecoveryReconciliation')
    return captureCustomerTransferRecoveryReconciliation(value, { observe, runTransaction: run })
  }
  async function reviewFixture() {
    const inventory = await fixture(true)
    await db.query(
      'SELECT pg_sleep(GREATEST(0,extract(epoch FROM effective_until-clock_timestamp())+0.02)) FROM page_studio_entitlements WHERE id=$1',
      [input.entitlementId]
    )
    const { renewCustomerTransferPlan } = await import('~~/server/utils/pageStudio/customerTransferPlanRenewal')
    const renewalId = randomUUID()
    await renewCustomerTransferPlan(
      {
        operator: input.operator,
        body: {
          requestId: renewalId,
          transferRequestId: requestId,
          operationId: inventory.request.operationId,
          intentDigest: inventory.request.intentDigest,
          recoveryId: inventory.recovery.recoveryId,
          epoch: 1,
          expectedHeadVersion: 1,
          expectedEntitlementId: input.entitlementId,
          effectiveUntil: new Date(Date.now() + 86400000).toISOString(),
          reason: 'Explicit bounded renewal'
        }
      },
      { runTransaction }
    )
    const api = await import('~~/server/utils/pageStudio/customerTransferRecoveryReview')
    const { TransferRecoveryInspectInputSchema } = await import('~~/shared/pageStudio/transferRecoveryCoordinator')
    const dependencies = {
      runTransaction,
      recapture: vi.fn(async (value: unknown) => {
        const parsed = TransferRecoveryInspectInputSchema.parse(value),
          next = structuredClone(inventory)
        next.inspection.loginSessionHash = parsed.operator.loginSessionHash
        return capture({ captureId: parsed.body.captureId, inventory: next }, observation)
      })
    }
    const route = { siteId: input.siteId, requestId, expectedRevision: 5 }
    const create = {
      ...route,
      operator: input.operator,
      body: {
        reviewId: randomUUID(),
        expectedReviewRevision: 0,
        recoveryId: inventory.recovery.recoveryId,
        expectedHeadVersion: 1,
        renewalRequestId: renewalId,
        captureId: randomUUID(),
        maximumDeadline: new Date(Date.now() + 1800000).toISOString()
      }
    }
    const reviewed = await api.createCustomerTransferRecoveryReview(create, dependencies)
    const consent = { ...route, review: reviewed.reference, consentId: randomUUID() }
    const approve = {
      ...route,
      operator: input.operator,
      review: reviewed.reference,
      approvalId: randomUUID(),
      captureId: randomUUID()
    }
    return { api, dependencies, route, create, reviewed, consent, approve, inventory }
  }
  it('requires explicit both-party consent and leaves an approved head non-admitting', async () => {
    const f = await reviewFixture()
    await expect(f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)).rejects.toThrow()
    await f.api.consentCustomerTransferRecoveryReview(f.consent, { ownerToken }, { runTransaction })
    await expect(f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)).rejects.toThrow()
    await f.api.consentCustomerTransferRecoveryReview(
      { ...f.consent, consentId: randomUUID() },
      { operator: input.operator },
      { runTransaction }
    )
    const result = await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    expect(result.historical).toBe(false)
    expect(
      (
        await db.query(
          'SELECT mode,cas_version,admission_id,d1_prepared_digest,applied_grant_digest FROM page_studio_transfer_recovery_heads'
        )
      ).rows[0]
    ).toEqual({
      mode: 'approved',
      cas_version: 2,
      admission_id: null,
      d1_prepared_digest: null,
      applied_grant_digest: null
    })
    const { withManagedTransferIntentAuthority } = await import('~~/server/utils/pageStudio/managedTransferIntent')
    const effect = vi.fn()
    await expect(
      withManagedTransferIntentAuthority(
        { operationId: f.inventory.request.operationId, intentDigest: f.inventory.request.intentDigest },
        effect,
        { runTransaction }
      )
    ).rejects.toThrow()
    expect(effect).not.toHaveBeenCalled()
  })
  async function both(f: Awaited<ReturnType<typeof reviewFixture>>) {
    await f.api.consentCustomerTransferRecoveryReview(f.consent, { ownerToken }, { runTransaction })
    await f.api.consentCustomerTransferRecoveryReview(
      { ...f.consent, consentId: randomUUID() },
      { operator: input.operator },
      { runTransaction }
    )
  }
  it('retains raw captures separately and compares only three named transport fields', async () => {
    const f = await reviewFixture()
    const { recoveryReviewEvidence } = await import('~~/shared/pageStudio/transferRecoveryReview')
    const row = (
      await db.query('SELECT invariant FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1', [
        f.create.body.captureId
      ])
    ).rows[0].invariant
    const first = {
      invariant: row,
      digest: 'a'.repeat(64),
      observedStartedAt: new Date().toISOString(),
      observedCompletedAt: new Date().toISOString()
    }
    const second = structuredClone(first)
    second.invariant.captureId = randomUUID()
    second.invariant.invocationDigest = 'b'.repeat(64)
    second.invariant.observation.envelopeDigest = 'c'.repeat(64)
    expect(recoveryReviewEvidence(second)).toEqual(recoveryReviewEvidence(first))
    second.invariant.observation.source.historyDigest = 'e'.repeat(64)
    expect(recoveryReviewEvidence(second)).not.toEqual(recoveryReviewEvidence(first))
    for (const section of ['sourceRegistry', 'destinationRegistry', 'sourcePhysical', 'destinationPhysical']) {
      for (const field of Object.keys(row.observation.later[section])) {
        const changed = structuredClone(first)
        changed.invariant.observation.later[section][field] = 1
        expect(() => recoveryReviewEvidence(changed)).toThrow()
        Reflect.deleteProperty(changed.invariant.observation.later[section], field)
        expect(() => recoveryReviewEvidence(changed)).toThrow()
      }
    }
    for (const field of Object.keys(row.pg.later)) {
      for (const invalid of [1, null, undefined]) {
        const changed = structuredClone(first)
        if (invalid === undefined) Reflect.deleteProperty(changed.invariant.pg.later, field)
        else changed.invariant.pg.later[field] = invalid
        expect(() => recoveryReviewEvidence(changed)).toThrow()
      }
    }
    const unknown = structuredClone(first)
    unknown.invariant.observation.later.sourceRegistry.unrecognized = 0
    expect(() => recoveryReviewEvidence(unknown)).toThrow()
    await both(f)
    const approved = await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    expect(approved.approval.originalCapture).toEqual(f.reviewed.review.originalCapture)
    expect(approved.approval.freshCapture).not.toEqual(approved.approval.originalCapture)
    expect(
      (
        await db.query('SELECT invariant FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1', [
          f.create.body.captureId
        ])
      ).rows[0].invariant
    ).toEqual(row)
  })
  it.each([
    'owner-revoked',
    'operator-revoked',
    'membership-revoked',
    'account-suspended',
    'operator-role',
    'pointer-changed',
    'limits-changed',
    'source-changed',
    'head-revoked'
  ])('denies finalization after %s without promoting the head', async (kind) => {
    const f = await reviewFixture()
    await both(f)
    if (kind === 'owner-revoked')
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
    if (kind === 'membership-revoked')
      await db.query('UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()')
    if (kind === 'account-suspended') await db.query("UPDATE page_studio_customer_accounts SET status='suspended'")
    if (kind === 'operator-role') await db.query("UPDATE team_members SET user_role='member'")
    if (kind === 'operator-revoked')
      await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    if (kind === 'pointer-changed')
      await db.query('UPDATE page_studio_sites SET entitlement_id=$1 WHERE id=$2', [input.entitlementId, input.siteId])
    if (kind === 'limits-changed')
      await db.query(
        "UPDATE page_studio_entitlements SET pages_per_site_limit=pages_per_site_limit+1 WHERE status='active'"
      )
    if (kind === 'source-changed')
      await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL WHERE id=$1', [input.siteId])
    if (kind === 'head-revoked')
      await db.query("UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=2")
    await expect(f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)).rejects.toThrow()
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_approvals')).rows[0].n
    ).toBe(0)
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).not.toBe('approved')
  })
  it('owner consent is pending and does not dispatch through retained operator credentials', async () => {
    const f = await reviewFixture(),
      calls = f.dependencies.recapture.mock.calls.length
    await f.api.consentCustomerTransferRecoveryReview(f.consent, { ownerToken }, { runTransaction })
    expect(f.dependencies.recapture).toHaveBeenCalledTimes(calls)
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('reconciling')
    await expect(
      f.api.consentCustomerTransferRecoveryReview(
        { ...f.consent, consentId: randomUUID() },
        { ownerToken: 'x'.repeat(64) },
        { runTransaction }
      )
    ).rejects.toThrow()
  })
  it('replays exact review/approval as history and never reinstates a revoked head', async () => {
    const f = await reviewFixture()
    const calls = f.dependencies.recapture.mock.calls.length
    expect((await f.api.createCustomerTransferRecoveryReview(f.create, f.dependencies)).historical).toBe(true)
    expect(f.dependencies.recapture).toHaveBeenCalledTimes(calls)
    await both(f)
    const result = await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    const { changeCustomerTransferRecovery, readCustomerTransferRecovery } =
      await import('~~/server/utils/pageStudio/customerTransferRecovery')
    const view = await readCustomerTransferRecovery(
      { ...f.route, operator: input.operator, query: { expectedRevision: 5 } },
      { runTransaction }
    )
    expect(view.recovery?.state).toBe('approved')
    expect(view.allowedActions).toEqual(['revoke'])
    await changeCustomerTransferRecovery(
      {
        ...f.route,
        operator: input.operator,
        body: {
          action: 'revoke',
          expectedRevision: 5,
          recoveryId: f.inventory.recovery.recoveryId,
          expectedHeadVersion: 2
        }
      },
      { runTransaction }
    )
    expect(await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)).toEqual({
      ...result,
      historical: true
    })
    const history = await f.api.readCustomerTransferRecoveryReview(
      { ...f.route, review: f.reviewed.reference },
      { ownerToken },
      { runTransaction }
    )
    expect(history.historical).toBe(true)
    expect(history.review).toEqual(f.reviewed.review)
    expect(JSON.stringify(history)).not.toContain(input.ownerLoginSessionHash)
    expect(await f.api.consentCustomerTransferRecoveryReview(f.consent, { ownerToken }, { runTransaction })).toEqual({
      historical: true,
      consentId: f.consent.consentId,
      party: 'owner'
    })
    await expect(
      f.api.readCustomerTransferRecoveryReview(
        { ...f.route, siteId: randomUUID(), review: f.reviewed.reference },
        { ownerToken },
        { runTransaction }
      )
    ).rejects.toThrow()
    await expect(
      f.api.readCustomerTransferRecoveryReview(
        { ...f.route, review: f.reviewed.reference },
        { ownerToken: 'x'.repeat(64) },
        { runTransaction }
      )
    ).rejects.toThrow()
    await expect(
      f.api.createCustomerTransferRecoveryReview(
        { ...f.create, body: { ...f.create.body, captureId: randomUUID() } },
        f.dependencies
      )
    ).rejects.toThrow()
    expect((await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows[0]).toEqual({
      mode: 'revoked',
      cas_version: 3
    })
    await expect(
      f.api.approveCustomerTransferRecoveryReview({ ...f.approve, captureId: randomUUID() }, f.dependencies)
    ).rejects.toThrow()
    for (const table of ['reviews', 'consents', 'approvals']) {
      await expect(db.query(`DELETE FROM page_studio_transfer_recovery_${table}`)).rejects.toThrow()
    }
    await db.query(readFileSync('server/database/migrations/476_page_studio_transfer_recovery_reviews.sql', 'utf8'))
    expect((await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows[0]).toEqual({
      mode: 'revoked',
      cas_version: 3
    })
  })
  it('requires a new exact consent pair for a successor review and rejects stale review CAS', async () => {
    const f = await reviewFixture()
    await both(f)
    const next = {
      ...f.create,
      body: { ...f.create.body, reviewId: randomUUID(), captureId: randomUUID(), expectedReviewRevision: 1 }
    }
    const competing = { ...next, body: { ...next.body, reviewId: randomUUID(), captureId: randomUUID() } }
    const outcomes = await Promise.allSettled([
      f.api.createCustomerTransferRecoveryReview(next, f.dependencies),
      f.api.createCustomerTransferRecoveryReview(competing, f.dependencies)
    ])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const winner = outcomes.find((result) => result.status === 'fulfilled')!
    if (winner.status !== 'fulfilled') throw new Error('Expected exactly one review CAS')
    const newer = winner.value
    expect(newer.review.revision).toBe(2)
    await expect(f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)).rejects.toThrow()
    await expect(
      f.api.approveCustomerTransferRecoveryReview({ ...f.approve, review: newer.reference }, f.dependencies)
    ).rejects.toThrow()
    await expect(
      f.api.createCustomerTransferRecoveryReview(
        { ...next, body: { ...next.body, reviewId: randomUUID(), captureId: randomUUID() } },
        f.dependencies
      )
    ).rejects.toThrow()
    expect((await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_reviews')).rows[0].n).toBe(
      2
    )
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('reconciling')
  })
  it('rejects direct approval or admission and preserves every immutable row', async () => {
    const f = await reviewFixture()
    await both(f)
    await expect(
      db.query(
        "UPDATE page_studio_transfer_recovery_heads SET mode='approved',cas_version=2,review_revision=1,review_digest=$1,reconciliation_digest=$2",
        [f.reviewed.reference.reviewDigest, f.reviewed.review.originalCapture.digest]
      )
    ).rejects.toThrow()
    await expect(
      db.query("UPDATE page_studio_transfer_recovery_heads SET mode='pending',cas_version=2,admission_id=$1", [
        randomUUID()
      ])
    ).rejects.toThrow()
    for (const table of ['reviews', 'consents'])
      await expect(
        db.query(`UPDATE page_studio_transfer_recovery_${table} SET review_digest=$1`, ['e'.repeat(64)])
      ).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('reconciling')
  })
  it('bounds approved deadline by explicit review and both genuine consent sessions', async () => {
    const f = await reviewFixture()
    await db.query("UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()+interval '10 minutes'")
    await both(f)
    const result = await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    const row = (await db.query('SELECT min(expires_at) AS deadline FROM page_studio_transfer_recovery_consents'))
      .rows[0]
    expect(new Date(result.approval.deadline as string).getTime()).toBe(row.deadline.getTime())
    expect(new Date(result.approval.deadline as string).getTime()).toBeLessThan(
      new Date(f.reviewed.review.maximumDeadline).getTime()
    )
    const { changeCustomerTransferRecovery } = await import('~~/server/utils/pageStudio/customerTransferRecovery')
    const original = (await db.query('SELECT deadline FROM page_studio_transfer_recovery_events WHERE cas_version=1'))
      .rows[0].deadline
    const replay = await changeCustomerTransferRecovery(
      {
        ...f.route,
        operator: input.operator,
        body: {
          action: 'open',
          expectedRevision: 5,
          expectedHeadVersion: null,
          recoveryId: f.inventory.recovery.recoveryId,
          deadline: original.toISOString()
        }
      },
      { runTransaction }
    )
    expect(replay.recovery?.state).toBe('approved')
  })
  it('rejects changed physical observation and preserves closed state', async () => {
    const f = await reviewFixture()
    await both(f)
    const { TransferRecoveryInspectInputSchema } = await import('~~/shared/pageStudio/transferRecoveryCoordinator')
    f.dependencies.recapture.mockImplementation(async (value) => {
      const parsed = TransferRecoveryInspectInputSchema.parse(value)
      return capture({ captureId: parsed.body.captureId, inventory: f.inventory }, async (next) => {
        const result = await observation(next)
        result.source.historyDigest = 'f'.repeat(64)
        return result
      })
    })
    await expect(f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('reconciling')
  })
  it('rolls approval back if the source changes during the final writes', async () => {
    const f = await reviewFixture()
    await both(f)
    const guarded = async <T>(work: (client: pg.Client) => Promise<T>) =>
      runTransaction(async (client) => {
        const query = client.query.bind(client)
        client.query = (async (sql: string, args?: unknown[]) => {
          const result = await query(sql, args)
          if (sql.includes('INSERT INTO page_studio_transfer_recovery_approvals'))
            await query('UPDATE page_studio_sites SET current_checkpoint_id=NULL WHERE id=$1', [input.siteId])
          return result
        }) as typeof client.query
        return work(client)
      })
    await expect(
      f.api.approveCustomerTransferRecoveryReview(f.approve, { ...f.dependencies, runTransaction: guarded })
    ).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('reconciling')
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_approvals')).rows[0].n
    ).toBe(0)
    expect(
      (await db.query('SELECT current_checkpoint_id FROM page_studio_sites WHERE id=$1', [input.siteId])).rows[0]
        .current_checkpoint_id
    ).toBe('checkpoint_a')
  })
  it.each(['owner', 'operator'])('rolls back when the %s session expires after the head CAS', async (party) => {
    const f = await reviewFixture()
    await both(f)
    const guarded = async <T>(work: (client: pg.Client) => Promise<T>) =>
      runTransaction(async (client) => {
        const query = client.query.bind(client)
        client.query = (async (sql: string, args?: unknown[]) => {
          const result = await query(sql, args)
          if (sql.includes("UPDATE page_studio_transfer_recovery_heads SET mode='approved'")) {
            await query(
              `UPDATE ${party === 'owner' ? 'page_studio_customer_sessions' : 'page_studio_login_sessions'} SET expires_at=clock_timestamp()+interval '0.05 seconds'`
            )
            await query('SELECT pg_sleep(0.08)')
          }
          return result
        }) as typeof client.query
        return work(client)
      })
    await expect(
      f.api.approveCustomerTransferRecoveryReview(f.approve, { ...f.dependencies, runTransaction: guarded })
    ).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('reconciling')
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_approvals')).rows[0].n
    ).toBe(0)
  })
  it('rechecks consent expiry at the actual head CAS after a delayed approval insert', async () => {
    const f = await reviewFixture()
    await db.query("UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()+interval '2 seconds'")
    await both(f)
    const guarded = async <T>(work: (client: pg.Client) => Promise<T>) =>
      runTransaction(async (client) => {
        const query = client.query.bind(client)
        client.query = (async (sql: string, args?: unknown[]) => {
          const result = await query(sql, args)
          if (sql.includes('INSERT INTO page_studio_transfer_recovery_approvals'))
            await query(
              "SELECT pg_sleep(GREATEST(0,extract(epoch FROM expires_at-clock_timestamp())+0.02)) FROM page_studio_transfer_recovery_consents WHERE party='owner'"
            )
          return result
        }) as typeof client.query
        return work(client)
      })
    await expect(
      f.api.approveCustomerTransferRecoveryReview(f.approve, { ...f.dependencies, runTransaction: guarded })
    ).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('reconciling')
  })
  it('checks the genuine operator clock after historical approval digest verification', async () => {
    const f = await reviewFixture()
    await both(f)
    await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    await db.query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+interval '0.5 seconds'")
    const canonical = await import('~~/shared/pageStudio/collectionApi')
    const digest = canonical.collectionDigest
    const delayed = vi.spyOn(canonical, 'collectionDigest').mockImplementation(async (value) => {
      const result = await digest(value)
      if ((value as { approvalId?: string })?.approvalId === f.approve.approvalId) {
        await db.query(
          'SELECT pg_sleep(GREATEST(0,extract(epoch FROM expires_at-clock_timestamp())+0.02)) FROM page_studio_login_sessions'
        )
      }
      return result
    })
    try {
      await expect(f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)).rejects.toThrow()
    } finally {
      delayed.mockRestore()
    }
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('approved')
  })
})
