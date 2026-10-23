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

describe.runIf(Boolean(databaseUrl))('exact recovery admission on PostgreSQL', { timeout: 20000 }, () => {
  const schema = `admission_${randomUUID().replaceAll('-', '')}`
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
  beforeAll(async () => {
    await db.query(readFileSync('server/database/migrations/477_page_studio_transfer_recovery_admissions.sql', 'utf8'))
    await db.query(readFileSync('server/database/migrations/477_page_studio_transfer_recovery_admissions.sql', 'utf8'))
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
  async function admissionFixture() {
    const f = await reviewFixture()
    await f.api.consentCustomerTransferRecoveryReview(f.consent, { ownerToken }, { runTransaction })
    await f.api.consentCustomerTransferRecoveryReview(
      { ...f.consent, consentId: randomUUID() },
      { operator: input.operator },
      { runTransaction }
    )
    const approved = await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    const api = await import('~~/server/utils/pageStudio/customerTransferRecoveryAdmission')
    const pending = {
      ...f.route,
      operator: input.operator,
      body: {
        admissionId: randomUUID(),
        review: f.reviewed.reference,
        expectedHeadVersion: 2,
        prepareEventId: randomUUID(),
        enableEventId: randomUUID()
      }
    }
    return { ...f, api, approved, pending }
  }
  it('persists one pending grant without D1 or phase dispatch', async () => {
    const f = await admissionFixture()
    const result = await f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction })
    expect(result.pending.body.pgVersion).toBe(3)
    expect(
      (
        await db.query(
          'SELECT mode,cas_version,d1_prepared_digest,applied_grant_digest FROM page_studio_transfer_recovery_heads'
        )
      ).rows[0]
    ).toEqual({ mode: 'pending', cas_version: 3, d1_prepared_digest: null, applied_grant_digest: null })
  })
  async function pendingFixture() {
    const f = await admissionFixture()
    const begun = await f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction })
    const apply = {
      ...f.route,
      operator: input.operator,
      body: { admissionId: f.pending.body.admissionId, expectedHeadVersion: 3 }
    }
    const authority = await import('~~/server/utils/pageStudio/customerTransferRecoveryAdmissionAuthority')
    const verifyPrepared = vi.fn(async (value: unknown) => {
      const { TransferRecoveryAdmissionRequestSchema } = await import('~~/shared/pageStudio/transferRecoveryAdmission')
      const envelope = TransferRecoveryAdmissionRequestSchema.parse(value)
      await authority.authorizeCustomerTransferRecoveryAdmission(envelope, { runTransaction })
      const heads = await authority.recoveryAdmissionHeads(envelope.pending)
      const envelopeDigest = await collectionDigest(envelope)
      const observation = {
        ...structuredClone(envelope.approvedObservation),
        envelopeDigest,
        recovery: {
          operationId: heads.prepared.operationId,
          intentDigest: heads.prepared.intentDigest,
          recoveryId: heads.prepared.recoveryId,
          epoch: 1,
          version: 2,
          mode: 'prepared'
        }
      }
      return {
        purpose: 'prepared-admission',
        envelopeDigest,
        head: heads.prepared,
        prepare: heads.prepare,
        observation
      }
    })
    return { ...f, begun, apply, authority, verifyPrepared }
  }
  it('replays A1 exactly without changing the grant or head and denies a conflicting request', async () => {
    const f = await admissionFixture(),
      first = await f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction })
    const next = await f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction })
    expect(next.historical).toBe(true)
    expect(next.pending).toEqual(first.pending)
    await expect(
      f.api.beginCustomerTransferRecoveryAdmission(
        { ...f.pending, body: { ...f.pending.body, enableEventId: randomUUID() } },
        { runTransaction }
      )
    ).rejects.toThrow()
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_admissions')).rows[0].n
    ).toBe(1)
  })
  it('persists applied only after trusted prepared verification, then replays without another remote read', async () => {
    const f = await pendingFixture()
    const result = await f.api.applyCustomerTransferRecoveryAdmission(f.apply, {
      runTransaction,
      verifyPrepared: f.verifyPrepared
    })
    expect(result.historical).toBe(false)
    expect(result.applied.body.pgVersion).toBe(4)
    expect((await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows[0]).toEqual({
      mode: 'applied',
      cas_version: 4
    })
    const replay = await f.api.applyCustomerTransferRecoveryAdmission(f.apply, {
      runTransaction,
      verifyPrepared: f.verifyPrepared
    })
    expect(replay.historical).toBe(true)
    expect(replay.applied).toEqual(result.applied)
    expect(f.verifyPrepared).toHaveBeenCalledTimes(1)
    const ack = await f.authority.authorizeCustomerTransferRecoveryAdmission(result.envelope, { runTransaction })
    expect(ack).toEqual({ purpose: 'admission-applied', envelopeDigest: await collectionDigest(result.envelope) })
    const heads = await f.authority.recoveryAdmissionHeads(result.pending, result.applied)
    await expect(
      f.authority.authorizeCustomerTransferRecoveryAdmission(
        { ...result.envelope, recovery: heads.enabled },
        { runTransaction }
      )
    ).resolves.toMatchObject({ purpose: 'admission-applied' })
    await expect(
      f.authority.authorizeCustomerTransferRecoveryAdmission(f.begun.envelope, { runTransaction })
    ).rejects.toThrow()
    expect((await db.query('SELECT count(*)::integer AS n FROM transfer_effects')).rows[0].n).toBe(0)
  })
  it('accepts exact closed/prepared pending acknowledgments and rejects foreign or changed envelope fields', async () => {
    const f = await pendingFixture(),
      e = f.begun.envelope,
      heads = await f.authority.recoveryAdmissionHeads(f.begun.pending)
    for (const recovery of [heads.closed, heads.prepared])
      await expect(
        f.authority.authorizeCustomerTransferRecoveryAdmission({ ...e, recovery }, { runTransaction })
      ).resolves.toMatchObject({ purpose: 'admission-pending' })
    const changed = [
      { ...e, requestDigest: 'b'.repeat(64) },
      { ...e, inspection: { ...e.inspection, pg: { ...e.inspection.pg, version: 4 } } },
      { ...e, inspection: { ...e.inspection, loginSessionHash: 'b'.repeat(64) } },
      { ...e, source: { ...e.source, freezeDigest: 'b'.repeat(64) } },
      { ...e, pending: { ...e.pending, digest: 'b'.repeat(64) } },
      { ...e, recovery: { ...e.recovery, recoveryId: randomUUID() } },
      {
        ...e,
        approvedObservation: {
          ...e.approvedObservation,
          destination: { ...e.approvedObservation.destination, physicalDigest: 'b'.repeat(64) }
        }
      },
      { ...e, catalogueRequest: { ...e.catalogueRequest, operationId: randomUUID() } },
      {
        ...e,
        inspection: { ...e.inspection, pg: { ...e.inspection.pg, deadline: new Date(Date.now() + 1000).toISOString() } }
      }
    ]
    for (const value of changed)
      await expect(f.authority.authorizeCustomerTransferRecoveryAdmission(value, { runTransaction })).rejects.toThrow()
  })
  it.each(['digest', 'event', 'head', 'physical', 'observationIdentity', 'observationDigest', 'missing'] as const)(
    'rejects %s prepared evidence without applying',
    async (kind) => {
      const f = await pendingFixture()
      const verifyPrepared = async (value: unknown) => {
        const result = await f.verifyPrepared(value)
        if (kind === 'digest') result.envelopeDigest = 'b'.repeat(64)
        if (kind === 'event') result.prepare.eventId = randomUUID()
        if (kind === 'head') result.head.preparedDigest = 'b'.repeat(64)
        if (kind === 'physical') result.observation.source.historyDigest = 'b'.repeat(64)
        if (kind === 'observationIdentity') result.observation.recovery.recoveryId = randomUUID()
        if (kind === 'observationDigest') result.observation.envelopeDigest = 'b'.repeat(64)
        if (kind === 'missing') return { purpose: result.purpose, head: result.head }
        return result
      }
      await expect(
        f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction, verifyPrepared })
      ).rejects.toThrow()
      expect((await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows[0]).toEqual({
        mode: 'pending',
        cas_version: 3
      })
      expect(
        (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_applications')).rows[0].n
      ).toBe(0)
    }
  )
  it('does not hold PG locks during remote verification and denies revoked head afterwards', async () => {
    const f = await pendingFixture()
    const verifyPrepared = async (value: unknown) => {
      const result = await f.verifyPrepared(value)
      // This would fail NOWAIT if A3 kept its site lock across the remote read.
      await runTransaction(async (client) => {
        await client.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [input.siteId])
        await client.query("UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=4")
      })
      return result
    }
    await expect(
      f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction, verifyPrepared })
    ).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('revoked')
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_applications')).rows[0].n
    ).toBe(0)
  })
  it.each(['operator', 'owner', 'plan', 'source'] as const)(
    'denies %s drift across prepared verification',
    async (kind) => {
      const f = await pendingFixture()
      const verifyPrepared = async (value: unknown) => {
        const result = await f.verifyPrepared(value)
        if (kind === 'operator')
          await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [
            operatorHash
          ])
        if (kind === 'owner')
          await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [
            input.ownerLoginSessionHash
          ])
        if (kind === 'plan')
          await db.query(
            "UPDATE page_studio_entitlements SET status='cancelled' WHERE id=(SELECT entitlement_id FROM page_studio_sites WHERE id=$1)",
            [input.siteId]
          )
        if (kind === 'source')
          await db.query("UPDATE page_studio_sites SET status='archived' WHERE id=$1", [input.siteId])
        return result
      }
      await expect(
        f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction, verifyPrepared })
      ).rejects.toThrow()
      expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('pending')
    }
  )
  it('fails closed with no binding and when the captured trusted adapter changes', async () => {
    const f = await pendingFixture()
    await expect(
      f.api.applyCustomerTransferRecoveryAdmission(f.apply, {
        runTransaction,
        env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
      })
    ).rejects.toThrow()
    const dependencies = { runTransaction, verifyPrepared: f.verifyPrepared }
    dependencies.verifyPrepared = vi.fn(async (value) => {
      const r = await f.verifyPrepared(value)
      dependencies.verifyPrepared = vi.fn()
      return r
    })
    await expect(f.api.applyCustomerTransferRecoveryAdmission(f.apply, dependencies)).rejects.toThrow()
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_applications')).rows[0].n
    ).toBe(0)
  })
  it('uses the captured production service method and denies its replacement during final SQL', async () => {
    const f = await pendingFixture(),
      service = { verifyPreparedManagedTransferRecoveryAdmission: f.verifyPrepared }
    const env = { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONER: service }
    let changed = false
    const guardedRun: typeof runTransaction = (work) =>
      runTransaction(async (client) => {
        const query = client.query.bind(client)
        client.query = (async (...args: unknown[]) => {
          const result = await (query as (...a: unknown[]) => Promise<unknown>)(...args)
          if (String(args[0]).includes('INSERT INTO page_studio_transfer_recovery_applications')) {
            changed = true
            env.PAGE_STUDIO_PROVISIONER = { verifyPreparedManagedTransferRecoveryAdmission: vi.fn() }
          }
          return result
        }) as typeof client.query
        return work(client)
      })
    await expect(
      f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction: guardedRun, env })
    ).rejects.toThrow()
    expect(changed).toBe(true)
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('pending')
  })
  it('rolls back A1 when principal expiry occurs after its insert', async () => {
    const f = await admissionFixture()
    const changedRun: typeof runTransaction = (work) =>
      runTransaction(async (client) => {
        const query = client.query.bind(client)
        client.query = (async (...args: unknown[]) => {
          const result = await (query as (...a: unknown[]) => Promise<unknown>)(...args)
          if (String(args[0]).includes('INSERT INTO page_studio_transfer_recovery_admissions'))
            await query(
              "UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",
              [operatorHash]
            )
          return result
        }) as typeof client.query
        return work(client)
      })
    await expect(
      f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction: changedRun })
    ).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('approved')
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_admissions')).rows[0].n
    ).toBe(0)
  })
  it('does not authorize A1 or its replay after owner revocation', async () => {
    const f = await admissionFixture()
    await f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction })
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [
      input.ownerLoginSessionHash
    ])
    await expect(f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction })).rejects.toThrow()
  })
  it('rejects a genuine approved sub-millisecond deadline without truncation', async () => {
    const f = await reviewFixture()
    await f.api.consentCustomerTransferRecoveryReview(f.consent, { ownerToken }, { runTransaction })
    await f.api.consentCustomerTransferRecoveryReview(
      { ...f.consent, consentId: randomUUID() },
      { operator: input.operator },
      { runTransaction }
    )
    await db.query(
      "UPDATE page_studio_login_sessions SET expires_at=date_trunc('milliseconds',clock_timestamp()+interval '10 minutes')+interval '123 microseconds' WHERE token_hash=$1",
      [operatorHash]
    )
    const approval = await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    expect(approval.approval.deadline).toMatch(/123Z$/)
    const api = await import('~~/server/utils/pageStudio/customerTransferRecoveryAdmission')
    await expect(
      api.beginCustomerTransferRecoveryAdmission(
        {
          ...f.route,
          operator: input.operator,
          body: {
            admissionId: randomUUID(),
            review: f.reviewed.reference,
            expectedHeadVersion: 2,
            prepareEventId: randomUUID(),
            enableEventId: randomUUID()
          }
        },
        { runTransaction }
      )
    ).rejects.toThrow('Unsupported recovery deadline precision')
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('approved')
  })
  it('retains immutable grants and history across migration replay and revocation', async () => {
    const f = await pendingFixture()
    const result = await f.api.applyCustomerTransferRecoveryAdmission(f.apply, {
      runTransaction,
      verifyPrepared: f.verifyPrepared
    })
    for (const table of ['page_studio_transfer_recovery_admissions', 'page_studio_transfer_recovery_applications']) {
      await expect(db.query(`UPDATE ${table} SET digest=$1`, ['b'.repeat(64)])).rejects.toThrow()
      await expect(db.query(`DELETE FROM ${table}`)).rejects.toThrow()
    }
    await db.query("UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=5")
    await db.query(readFileSync('server/database/migrations/477_page_studio_transfer_recovery_admissions.sql', 'utf8'))
    expect((await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows[0]).toEqual({
      mode: 'revoked',
      cas_version: 5
    })
    await expect(
      f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction, verifyPrepared: f.verifyPrepared })
    ).rejects.toThrow()
    await expect(
      f.authority.authorizeCustomerTransferRecoveryAdmission(result.envelope, { runTransaction })
    ).rejects.toThrow()
  })

  it('rejects direct missing/null grant JSON and stale head CAS under database constraints', async () => {
    const f = await admissionFixture()
    const pending = await runTransaction(async (client) => {
      await client.query('SAVEPOINT candidate')
      const candidate = await f.api.beginCustomerTransferRecoveryAdmission(f.pending, {
        runTransaction: (work) => work(client)
      })
      await client.query('ROLLBACK TO SAVEPOINT candidate')
      return candidate.pending
    })
    for (const field of [
      'intentDigest',
      'deadline',
      'reconciliationDigest',
      'reviewDigest',
      'revision',
      'epoch',
      'pgVersion',
      'prepareEventId'
    ]) {
      for (const missing of [true, false]) {
        const body = { ...pending.body } as Record<string, unknown>
        if (missing) Reflect.deleteProperty(body, field)
        else body[field] = null
        await expect(
          db.query(
            `INSERT INTO page_studio_transfer_recovery_admissions(admission_id,operation_id,recovery_id,review_id,revision,review_digest,body,digest,request)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              pending.body.admissionId,
              pending.body.operationId,
              pending.body.recoveryId,
              pending.body.reviewId,
              pending.body.revision,
              pending.body.reviewDigest,
              body,
              pending.digest,
              f.pending
            ]
          )
        ).rejects.toThrow()
      }
    }
    await expect(
      db.query("UPDATE page_studio_transfer_recovery_heads SET mode='pending',cas_version=4,admission_id=$1", [
        pending.body.admissionId
      ])
    ).rejects.toThrow()
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_admissions')).rows[0].n
    ).toBe(0)
  })
  it('serializes competing pending grants for the same approved operation', async () => {
    const f = await admissionFixture()
    const other = {
      ...f.pending,
      body: { ...f.pending.body, admissionId: randomUUID(), prepareEventId: randomUUID(), enableEventId: randomUUID() }
    }
    const results = await Promise.allSettled([
      f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction }),
      f.api.beginCustomerTransferRecoveryAdmission(other, { runTransaction })
    ])
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1)
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_admissions')).rows[0].n
    ).toBe(1)
  })
  it('rechecks consent expiry at the actual pending head write after a delayed insert', async () => {
    const f = await reviewFixture()
    await db.query('UPDATE page_studio_customer_sessions SET expires_at=$1 WHERE token_hash=$2', [
      new Date(Date.now() + 2500).toISOString(),
      input.ownerLoginSessionHash
    ])
    await f.api.consentCustomerTransferRecoveryReview(f.consent, { ownerToken }, { runTransaction })
    await f.api.consentCustomerTransferRecoveryReview(
      { ...f.consent, consentId: randomUUID() },
      { operator: input.operator },
      { runTransaction }
    )
    await f.api.approveCustomerTransferRecoveryReview(f.approve, f.dependencies)
    const api = await import('~~/server/utils/pageStudio/customerTransferRecoveryAdmission')
    const changedRun: typeof runTransaction = (work) =>
      runTransaction(async (client) => {
        const query = client.query.bind(client)
        client.query = (async (sql: string, args?: unknown[]) => {
          const result = await query(sql, args)
          if (sql.includes('INSERT INTO page_studio_transfer_recovery_admissions'))
            await query(
              "SELECT pg_sleep(GREATEST(0,extract(epoch FROM expires_at-clock_timestamp())+0.02)) FROM page_studio_transfer_recovery_consents WHERE party='owner'"
            )
          return result
        }) as typeof client.query
        return work(client)
      })
    await expect(
      api.beginCustomerTransferRecoveryAdmission(
        {
          ...f.route,
          operator: input.operator,
          body: {
            admissionId: randomUUID(),
            review: f.reviewed.reference,
            expectedHeadVersion: 2,
            prepareEventId: randomUUID(),
            enableEventId: randomUUID()
          }
        },
        { runTransaction: changedRun }
      )
    ).rejects.toThrow()
    expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe('approved')
    expect(
      (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_admissions')).rows[0].n
    ).toBe(0)
  })
  it('keeps legacy execution denied in pending and applied, with no phase effects', async () => {
    const f = await pendingFixture()
    const { withManagedTransferIntentAuthority } = await import('~~/server/utils/pageStudio/managedTransferIntent')
    const effect = vi.fn(),
      reference = { operationId: f.inventory.request.operationId, intentDigest: f.inventory.request.intentDigest }
    await expect(withManagedTransferIntentAuthority(reference, effect, { runTransaction })).rejects.toThrow()
    await f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction, verifyPrepared: f.verifyPrepared })
    await expect(withManagedTransferIntentAuthority(reference, effect, { runTransaction })).rejects.toThrow()
    expect(effect).not.toHaveBeenCalled()
  })
  it.each(['new', 'replay'] as const)(
    'rejects a captured service swap during the last applied clock on %s',
    async (phase) => {
      const f = await pendingFixture(),
        service = { verifyPreparedManagedTransferRecoveryAdmission: f.verifyPrepared }
      const env = { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONER: service }
      if (phase === 'replay') await f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction, env })
      let changed = false
      const changedRun: typeof runTransaction = (work) =>
        runTransaction(async (client) => {
          const query = client.query.bind(client)
          client.query = (async (sql: string, args?: unknown[]) => {
            const result = await query(sql, args)
            if (sql.includes('WITH instant AS MATERIALIZED') && args?.[4] === 'applied') {
              changed = true
              env.PAGE_STUDIO_PROVISIONER = { verifyPreparedManagedTransferRecoveryAdmission: vi.fn() }
            }
            return result
          }) as typeof client.query
          return work(client)
        })
      await expect(
        f.api.applyCustomerTransferRecoveryAdmission(f.apply, { runTransaction: changedRun, env })
      ).rejects.toThrow()
      expect(changed).toBe(true)
      expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe(
        phase === 'new' ? 'pending' : 'applied'
      )
      expect(
        (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_applications')).rows[0].n
      ).toBe(phase === 'new' ? 0 : 1)
    }
  )
})
