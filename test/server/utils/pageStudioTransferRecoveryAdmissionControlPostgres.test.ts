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

describe.runIf(Boolean(databaseUrl))(
  'explicit private recovery admission control on PostgreSQL',
  { timeout: 20000 },
  () => {
    const schema = `admission_control_${randomUUID().replaceAll('-', '')}`
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
    let expected: {
      identityId: string
      accountId: string
      workspaceId: string
      tenantId: string
      businessId: string
    }
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
      await db.query(
        readFileSync('server/database/migrations/457_page_studio_managed_transfer_intents.sql', 'utf8')
      )
      for (const name of readdirSync('server/database/migrations')
        .filter((name) => /^(45[89]|46[0-9]|470|471)_/.test(name))
        .sort()) {
        await db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
      }
      await db.query(
        readFileSync('server/database/migrations/473_page_studio_transfer_recovery_heads.sql', 'utf8')
      )
      await db.query(readFileSync('server/database/migrations/472_page_studio_transfer_requests.sql', 'utf8'))
      await db.query(
        readFileSync(
          'server/database/migrations/474_page_studio_transfer_recovery_reconciliations.sql',
          'utf8'
        )
      )
      await db.query(
        readFileSync(
          'server/database/migrations/474_page_studio_transfer_recovery_reconciliations.sql',
          'utf8'
        )
      )
      await db
        .query(
          readFileSync('server/database/migrations/476_page_studio_transfer_recovery_reviews.sql', 'utf8')
        )
        .catch((error) => {
          throw new Error(`Migration476 position ${error.position}: ${error.message}`)
        })
      await db
        .query(
          readFileSync('server/database/migrations/476_page_studio_transfer_recovery_reviews.sql', 'utf8')
        )
        .catch((error) => {
          throw new Error(`Migration476 position ${error.position}: ${error.message}`)
        })
    })
    beforeAll(async () => {
      await db.query(
        readFileSync('server/database/migrations/477_page_studio_transfer_recovery_admissions.sql', 'utf8')
      )
      await db.query(
        readFileSync('server/database/migrations/477_page_studio_transfer_recovery_admissions.sql', 'utf8')
      )
    })
    beforeEach(async () => {
      const scope = {
        tenantId: expected.tenantId,
        clientId: expected.businessId,
        businessId: expected.businessId,
        siteId: input.siteId,
        environment: 'staging'
      }
      key = JSON.stringify([
        scope.tenantId,
        scope.clientId,
        scope.businessId,
        scope.siteId,
        scope.environment
      ])
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
      await db.query("UPDATE page_studio_sites SET current_checkpoint_id='checkpoint_a' WHERE id=$1", [
        input.siteId
      ])
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
      const { executeTransferControls } =
        await import('~~/workers/page-studio-management/src/transferControls')
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
      const prepared = await resources.prepareManagedTransferResources(reference, {
        runTransaction,
        artifacts
      })
      const attachment = (await db.query('SELECT request FROM page_studio_managed_transfer_resources'))
        .rows[0].request
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
          setupDigest: await collectionDigest({
            attachmentIdentity: prepared.resourceIdentity,
            mode: attachment.mode
          }),
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
      const catalogueRequest = await prepareManagedTransferDestinationCatalogue(reference, {
        runTransaction,
        env
      })
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
      const { changeCustomerTransferRecovery } =
        await import('~~/server/utils/pageStudio/customerTransferRecovery')
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
      const { renewCustomerTransferPlan } =
        await import('~~/server/utils/pageStudio/customerTransferPlanRenewal')
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
      const { TransferRecoveryInspectInputSchema } =
        await import('~~/shared/pageStudio/transferRecoveryCoordinator')
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

    type MutableReceipt = {
      envelopeDigest: string
      head: { recoveryId: string }
      prepare?: { eventId: string }
      enable?: { eventId: string }
      observation: { envelopeDigest: string; source: { physicalDigest: string } }
      extra?: boolean
    }
    async function coordinatorFixture() {
      const f = await admissionFixture()
      const { controlCustomerTransferRecoveryAdmission } =
        await import('~~/server/utils/pageStudio/customerTransferRecoveryAdmissionControl')
      const authority = await import('~~/server/utils/pageStudio/customerTransferRecoveryAdmissionAuthority')
      const { TransferRecoveryAdmissionRequestSchema } =
        await import('~~/shared/pageStudio/transferRecoveryAdmission')
      let nativeState: 'closed' | 'prepared' | 'enabled' = 'closed'
      // Trusted native boundary is explicitly mocked here; actual D1/factory proof
      // is separately covered in Studio. All PG authority is the real helper.
      const receipt = async (raw: unknown, stage: 'prepared' | 'enabled', write: boolean) => {
        const wire = TransferRecoveryAdmissionRequestSchema.parse(raw)
        await authority.authorizeCustomerTransferRecoveryAdmission(wire, { runTransaction })
        const heads = await authority.recoveryAdmissionHeads(wire.pending, wire.applied ?? undefined)
        if (stage === 'prepared') {
          if (nativeState === 'enabled' || (!write && nativeState !== 'prepared'))
            throw new Error('Native stage denied')
          if (write) nativeState = 'prepared'
        } else {
          if (nativeState === 'closed') throw new Error('Native stage denied')
          if (write) nativeState = 'enabled'
        }
        const head = stage === 'prepared' ? heads.prepared : heads.enabled!
        const post = { ...wire, recovery: head }
        await authority.authorizeCustomerTransferRecoveryAdmission(post, { runTransaction })
        const envelopeDigest = await collectionDigest(post)
        const observation = {
          ...structuredClone(wire.approvedObservation),
          envelopeDigest,
          recovery: {
            operationId: head.operationId,
            intentDigest: head.intentDigest,
            recoveryId: head.recoveryId,
            epoch: 1,
            version: head.version,
            mode: head.mode
          }
        }
        return stage === 'prepared'
          ? { purpose: 'prepared-admission', envelopeDigest, head, prepare: heads.prepare, observation }
          : {
              purpose: 'enabled-admission',
              envelopeDigest,
              head,
              enable: {
                purpose: 'enable',
                eventId: wire.pending.body.enableEventId,
                previous: heads.prepared,
                appliedDigest: wire.applied!.digest
              },
              observation
            }
      }
      const service = {
        prepareManagedTransferRecoveryAdmission: vi.fn((wire: unknown) => receipt(wire, 'prepared', true)),
        verifyPreparedManagedTransferRecoveryAdmission: vi.fn((wire: unknown) =>
          receipt(wire, 'prepared', false)
        ),
        enableManagedTransferRecoveryAdmission: vi.fn((wire: unknown) => receipt(wire, 'enabled', true))
      }
      const env = {
        PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
        PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
        PAGE_STUDIO_PROVISIONER: service
      }
      const value = (action: 'read' | 'begin' | 'prepare' | 'apply' | 'enable') => ({
        ...f.route,
        operator: input.operator,
        request:
          action === 'read'
            ? { action }
            : action === 'begin'
              ? { action, ...f.pending.body }
              : {
                  action,
                  admissionId: f.pending.body.admissionId,
                  expectedHeadVersion: action === 'enable' ? 4 : 3
                }
      })
      const control = (action: Parameters<typeof value>[0], run = runTransaction) =>
        controlCustomerTransferRecoveryAdmission(value(action), { env, runTransaction: run })
      const reach = async (stage: 'pending' | 'prepared' | 'applied') => {
        await control('begin')
        if (stage !== 'pending') await control('prepare')
        if (stage === 'applied') await control('apply')
      }
      return {
        ...f,
        authority,
        env,
        service,
        value,
        control,
        reach,
        raw: controlCustomerTransferRecoveryAdmission,
        nativeState: () => nativeState
      }
    }
    it('runs four separately requested steps and reads only proven PG state', async () => {
      const f = await coordinatorFixture()
      expect(await f.control('read')).toMatchObject({
        pgState: 'approved',
        d1State: 'unverified',
        admissionId: null
      })
      expect(await f.control('begin')).toMatchObject({
        pgState: 'pending',
        d1State: 'unverified',
        admissionId: f.pending.body.admissionId
      })
      expect(f.service.prepareManagedTransferRecoveryAdmission).not.toHaveBeenCalled()
      expect(await f.control('read')).toMatchObject({ pgState: 'pending', d1State: 'unverified' })
      expect(await f.control('prepare')).toMatchObject({ pgState: 'pending', d1State: 'prepared' })
      expect(await f.control('read')).toMatchObject({ pgState: 'pending', d1State: 'unverified' })
      expect(await f.control('apply')).toMatchObject({ pgState: 'applied', d1State: 'unverified' })
      expect(f.nativeState()).toBe('prepared')
      expect(f.service.enableManagedTransferRecoveryAdmission).not.toHaveBeenCalled()
      expect(await f.control('enable')).toMatchObject({ pgState: 'applied', d1State: 'enabled' })
      expect(await f.control('read')).toMatchObject({ pgState: 'applied', d1State: 'unverified' })
      expect((await db.query('SELECT count(*)::integer n FROM transfer_effects')).rows[0].n).toBe(0)
    })
    it('replays exact original event inputs explicitly without auto advancing', async () => {
      const f = await coordinatorFixture()
      const begun = await f.control('begin')
      expect(await f.control('begin')).toEqual(begun)
      const prepared = await f.control('prepare')
      expect(await f.control('prepare')).toEqual(prepared)
      expect(f.service.prepareManagedTransferRecoveryAdmission.mock.calls[0]).toEqual(
        f.service.prepareManagedTransferRecoveryAdmission.mock.calls[1]
      )
      const applied = await f.control('apply')
      expect(await f.control('apply')).toEqual(applied)
      expect(f.service.verifyPreparedManagedTransferRecoveryAdmission).toHaveBeenCalledTimes(1)
      const enabled = await f.control('enable')
      expect(await f.control('enable')).toEqual(enabled)
      expect(f.service.enableManagedTransferRecoveryAdmission.mock.calls[0]).toEqual(
        f.service.enableManagedTransferRecoveryAdmission.mock.calls[1]
      )
      await expect(f.control('begin')).rejects.toThrow()
      await expect(f.control('prepare')).rejects.toThrow()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_transfer_recovery_admissions')).rows[0].n
      ).toBe(1)
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_transfer_recovery_applications')).rows[0]
          .n
      ).toBe(1)
    })
    it.each(['prepare', 'enable'] as const)(
      'does not retry a lost %s acknowledgment and reuses original input on explicit replay',
      async (action) => {
        const f = await coordinatorFixture()
        await f.reach(action === 'prepare' ? 'pending' : 'applied')
        const method =
          action === 'prepare'
            ? f.service.prepareManagedTransferRecoveryAdmission
            : f.service.enableManagedTransferRecoveryAdmission
        const original = method.getMockImplementation()!
        method.mockImplementationOnce(async (wire) => {
          await original(wire)
          throw new Error('Lost acknowledgment')
        })
        await expect(f.control(action)).rejects.toThrow('Lost acknowledgment')
        expect(method).toHaveBeenCalledTimes(1)
        expect((await f.control('read')).d1State).toBe('unverified')
        expect((await f.control(action)).d1State).toBe(action === 'prepare' ? 'prepared' : 'enabled')
        expect(method.mock.calls[0]).toEqual(method.mock.calls[1])
      }
    )
    it.each(['prepare', 'enable'] as const)('rejects malformed or foreign %s receipts', async (action) => {
      const f = await coordinatorFixture()
      await f.reach(action === 'prepare' ? 'pending' : 'applied')
      const method =
        action === 'prepare'
          ? f.service.prepareManagedTransferRecoveryAdmission
          : f.service.enableManagedTransferRecoveryAdmission
      const original = method.getMockImplementation()!
      for (const mutate of [
        (v: MutableReceipt) => {
          v.envelopeDigest = '0'.repeat(64)
        },
        (v: MutableReceipt) => {
          v.head.recoveryId = randomUUID()
        },
        (v: MutableReceipt) => {
          ;(v.prepare ?? v.enable)!.eventId = randomUUID()
        },
        (v: MutableReceipt) => {
          v.observation.envelopeDigest = '0'.repeat(64)
        },
        (v: MutableReceipt) => {
          v.observation.source.physicalDigest = '0'.repeat(64)
        },
        (v: MutableReceipt) => {
          v.extra = true
        }
      ]) {
        method.mockImplementationOnce(async (wire) => {
          const result = await original(wire)
          mutate(result)
          return result
        })
        await expect(f.control(action)).rejects.toThrow()
      }
      expect((await f.control('read')).d1State).toBe('unverified')
    })
    it.each(['read', 'prepare', 'enable'] as const)(
      'denies wrong original caller or route for %s',
      async (action) => {
        const f = await coordinatorFixture()
        await f.reach(action === 'enable' ? 'applied' : 'pending')
        for (const changed of [
          { ...f.value(action), siteId: randomUUID() },
          { ...f.value(action), requestId: randomUUID() },
          { ...f.value(action), expectedRevision: f.route.expectedRevision + 1 },
          { ...f.value(action), operator: { ...input.operator, actorId: randomUUID() } },
          { ...f.value(action), operator: { ...input.operator, loginSessionHash: '0'.repeat(64) } }
        ])
          await expect(f.raw(changed, { env: f.env, runTransaction })).rejects.toThrow()
      }
    )
    it.each(['prepare', 'enable'] as const)(
      'denies revocation during remote %s after releasing SQL locks',
      async (action) => {
        const f = await coordinatorFixture()
        await f.reach(action === 'prepare' ? 'pending' : 'applied')
        const method =
          action === 'prepare'
            ? f.service.prepareManagedTransferRecoveryAdmission
            : f.service.enableManagedTransferRecoveryAdmission
        const original = method.getMockImplementation()!
        method.mockImplementationOnce(async (wire) => {
          const result = await original(wire)
          // Independent connection must acquire the site lock: no outer PG transaction.
          await db.query('BEGIN')
          await db.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE NOWAIT', [
            input.siteId
          ])
          await db.query(
            'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',
            [input.ownerLoginSessionHash]
          )
          await db.query('COMMIT')
          return result
        })
        await expect(f.control(action)).rejects.toThrow()
      }
    )
    it.each(['prepare', 'apply', 'enable'] as const)(
      'denies missing selected %s binding before any dispatch',
      async (action) => {
        const f = await coordinatorFixture()
        await f.reach(action === 'enable' ? 'applied' : action === 'apply' ? 'prepared' : 'pending')
        const name =
          action === 'prepare'
            ? 'prepareManagedTransferRecoveryAdmission'
            : action === 'enable'
              ? 'enableManagedTransferRecoveryAdmission'
              : 'verifyPreparedManagedTransferRecoveryAdmission'
        const env = { ...f.env, PAGE_STUDIO_PROVISIONER: { ...f.service, [name]: undefined } }
        await expect(f.raw(f.value(action), { env, runTransaction })).rejects.toThrow()
      }
    )
    it.each(['read', 'begin', 'prepare', 'apply', 'enable'] as const)(
      'checks captured configuration after final %s SQL await',
      async (action) => {
        const f = await coordinatorFixture()
        if (action === 'prepare') await f.reach('pending')
        if (action === 'apply') await f.reach('prepared')
        if (action === 'enable') await f.reach('applied')
        const before = (await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads'))
          .rows
        let clocks = 0
        const swap = <T>(work: (client: pg.Client) => Promise<T>) =>
          runTransaction((client) => {
            const query = client.query.bind(client)
            client.query = (async (sql: string, values?: unknown[]) => {
              const result = await query(sql, values)
              const target =
                action === 'apply'
                  ? 3
                  : action === 'begin'
                    ? 2
                    : action === 'prepare' || action === 'enable'
                      ? 2
                      : 1
              if (sql.includes('SELECT to_char(LEAST(') && ++clocks === target)
                f.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'staging'
              return result
            }) as typeof client.query
            return work(client)
          })
        await expect(f.control(action, swap)).rejects.toThrow()
        expect(
          (await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows
        ).toEqual(before)
      }
    )
    it.each(['source', 'plan', 'head'] as const)(
      'denies %s drift after the remote prepare observation',
      async (kind) => {
        const f = await coordinatorFixture()
        await f.reach('pending')
        const original = f.service.prepareManagedTransferRecoveryAdmission.getMockImplementation()!
        f.service.prepareManagedTransferRecoveryAdmission.mockImplementationOnce(async (wire) => {
          const result = await original(wire)
          if (kind === 'source') await db.query('UPDATE page_studio_cms_scopes SET current_content_id=NULL')
          if (kind === 'plan')
            await db.query(
              "UPDATE page_studio_entitlements SET status='cancelled' WHERE id=(SELECT entitlement_id FROM page_studio_sites WHERE id=$1)",
              [input.siteId]
            )
          if (kind === 'head') {
            const { changeCustomerTransferRecovery } =
              await import('~~/server/utils/pageStudio/customerTransferRecovery')
            await changeCustomerTransferRecovery(
              {
                siteId: f.route.siteId,
                requestId: f.route.requestId,
                operator: input.operator,
                body: {
                  action: 'revoke',
                  expectedRevision: f.route.expectedRevision,
                  recoveryId: (await db.query('SELECT recovery_id FROM page_studio_transfer_recovery_heads'))
                    .rows[0].recovery_id,
                  expectedHeadVersion: 3
                }
              },
              { runTransaction }
            )
          }
          return result
        })
        await expect(f.control('prepare')).rejects.toThrow()
        if (kind === 'head')
          expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_heads')).rows[0].mode).toBe(
            'revoked'
          )
        expect(
          (await db.query('SELECT count(*)::integer n FROM page_studio_transfer_recovery_applications'))
            .rows[0].n
        ).toBe(0)
      }
    )
    it('denies read when operator login expires in its final SQL clock', async () => {
      const f = await coordinatorFixture()
      const expire = <T>(work: (client: pg.Client) => Promise<T>) =>
        runTransaction((client) => {
          const query = client.query.bind(client)
          client.query = (async (sql: string, values?: unknown[]) => {
            if (sql.includes('SELECT to_char(LEAST('))
              await query(
                'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp() WHERE token_hash=$1',
                [operatorHash]
              )
            return query(sql, values)
          }) as typeof client.query
          return work(client)
        })
      await expect(f.control('read', expire)).rejects.toThrow()
    })
    it.each(['prepare', 'enable'] as const)(
      'denies selected %s method replacement during the last SQL query',
      async (action) => {
        const f = await coordinatorFixture()
        await f.reach(action === 'prepare' ? 'pending' : 'applied')
        let clocks = 0
        const swap = <T>(work: (client: pg.Client) => Promise<T>) =>
          runTransaction((client) => {
            const query = client.query.bind(client)
            client.query = (async (sql: string, values?: unknown[]) => {
              const result = await query(sql, values)
              if (sql.includes('SELECT to_char(LEAST(') && ++clocks === 2) {
                if (action === 'prepare') f.service.prepareManagedTransferRecoveryAdmission = vi.fn()
                else f.service.enableManagedTransferRecoveryAdmission = vi.fn()
              }
              return result
            }) as typeof client.query
            return work(client)
          })
        await expect(f.control(action, swap)).rejects.toThrow()
      }
    )
    it.each(['prepare', 'enable'] as const)(
      'invokes callable RPC proxy for %s without call/bind properties',
      async (action) => {
        const f = await coordinatorFixture()
        await f.reach(action === 'prepare' ? 'pending' : 'applied')
        const name =
          action === 'prepare'
            ? 'prepareManagedTransferRecoveryAdmission'
            : 'enableManagedTransferRecoveryAdmission'
        const original = f.service[name],
          properties: PropertyKey[] = []
        let calls = 0
        f.service[name] = new Proxy(original, {
          get(target, property, receiver) {
            if (property === 'call' || property === 'bind') {
              properties.push(property)
              throw new Error('Named RPC function property is a remote method')
            }
            return Reflect.get(target, property, receiver)
          },
          apply(target, receiver, args) {
            calls++
            expect(receiver).toBe(f.service)
            expect(args).toHaveLength(1)
            return Reflect.apply(target, receiver, args)
          }
        })
        expect((await f.control(action)).d1State).toBe(action === 'prepare' ? 'prepared' : 'enabled')
        expect(calls).toBe(1)
        expect(properties).toEqual([])
      }
    )
  }
)
