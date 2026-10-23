import { prepareCustomerTransferRecoverySourceExecution } from '~~/server/utils/pageStudio/customerTransferRecoverySourceExecution'
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
  'recovery source request retention on PostgreSQL',
  { timeout: 20000 },
  () => {
    const schema = `phase_${randomUUID().replaceAll('-', '')}`
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
        {
          email: 'transfer-owner@example.test',
          name: 'Transfer owner',
          mode: 'signup',
          acceptedTerms: true
        },
        'preview-v1',
        runTransaction
      )
      const login = await signup.verifyCustomerSignIn(requested!.token, runTransaction)
      ownerToken = login.sessionToken
      const { createCustomerWorkspace } = await import('~~/server/utils/pageStudio/customerWorkspaces')
      const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
      const workspace = await createCustomerWorkspace(
        {
          identityId: login.identityId,
          requestId: randomUUID(),
          name: 'Transfer test'
        },
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
    beforeAll(async () => {
      await db.query(
        readFileSync(
          'server/database/migrations/478_page_studio_transfer_recovery_source_execution.sql',
          'utf8'
        )
      )
      await db.query(
        readFileSync(
          'server/database/migrations/478_page_studio_transfer_recovery_source_execution.sql',
          'utf8'
        )
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
          actor: {
            kind: 'agency-user' as const,
            userId: actorId,
            loginSessionHash: operatorHash
          },
          scope,
          target
        }
      }
      sourceFreeze = {
        ...freezeBody,
        digest: await collectionDigest(freezeBody)
      }
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
      const reference = {
        operationId: stored.operation_id,
        intentDigest: stored.intent_digest
      }
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
        provider: {
          accountId: 'a'.repeat(32),
          compatibilityDate: '2026-08-18'
        },
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
          body: {
            action: 'open',
            expectedRevision: 5,
            expectedHeadVersion: null,
            recoveryId,
            deadline
          }
        },
        { runTransaction }
      )
      const request = { ...reference, resourceRequest: attachment }
      return {
        purpose: 'inventory' as const,
        request,
        requestDigest: await collectionDigest(request),
        recovery: {
          ...reference,
          recoveryId,
          epoch: 1,
          version: 1,
          mode: 'closed' as const
        },
        inspection: {
          operatorId: actorId,
          loginSessionHash: operatorHash,
          pg: {
            requestId,
            requestRevision: 5,
            recoveryId,
            epoch: 1,
            version: 1,
            deadline
          }
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
      const registry = {
        executions: 0,
        uploads: 0,
        destinations: 0,
        authoring: 0
      }
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
        destination: {
          registryDigest: digest,
          physicalDigest: digest,
          historyDigest: digest
        },
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
      return captureCustomerTransferRecoveryReconciliation(value, {
        observe,
        runTransaction: run
      })
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
      const consent = {
        ...route,
        review: reviewed.reference,
        consentId: randomUUID()
      }
      const approve = {
        ...route,
        operator: input.operator,
        review: reviewed.reference,
        approvalId: randomUUID(),
        captureId: randomUUID()
      }
      return {
        api,
        dependencies,
        route,
        create,
        reviewed,
        consent,
        approve,
        inventory
      }
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
    async function pendingFixture() {
      const f = await admissionFixture()
      const begun = await f.api.beginCustomerTransferRecoveryAdmission(f.pending, { runTransaction })
      const apply = {
        ...f.route,
        operator: input.operator,
        body: {
          admissionId: f.pending.body.admissionId,
          expectedHeadVersion: 3
        }
      }
      const authority = await import('~~/server/utils/pageStudio/customerTransferRecoveryAdmissionAuthority')
      const verifyPrepared = vi.fn(async (value: unknown) => {
        const { TransferRecoveryAdmissionRequestSchema } =
          await import('~~/shared/pageStudio/transferRecoveryAdmission')
        const envelope = TransferRecoveryAdmissionRequestSchema.parse(value)
        await authority.authorizeCustomerTransferRecoveryAdmission(envelope, {
          runTransaction
        })
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

    async function phaseFixture() {
      const f = await pendingFixture()
      const applied = await f.api.applyCustomerTransferRecoveryAdmission(f.apply, {
        runTransaction,
        verifyPrepared: f.verifyPrepared
      })
      const value = {
        ...f.route,
        operator: input.operator,
        body: {
          admissionId: applied.applied.body.admissionId,
          invocationId: randomUUID()
        }
      }
      const scope = sourceFreeze.request.scope,
        target = sourceFreeze.request.target
      const policy = {
        version: 1,
        kind: 'managed-draft-transfer',
        accountId: target.accountId,
        namespace: 'xeroflow-page-studio-dispatch-staging',
        from: { compatibilityDate: '2026-08-18', digest: target.runtimeDigest },
        to: { compatibilityDate: '2026-08-18', digest: '9'.repeat(64) }
      }
      const predecessor = {
        accountId: target.accountId,
        databaseId: target.databaseId,
        scope,
        namespace: policy.namespace,
        scriptName: `ps-content-${'5'.repeat(32)}`,
        ownerTag: `ps-owner-${'6'.repeat(32)}`,
        runtimeDigest: target.runtimeDigest,
        compatibilityDate: policy.from.compatibilityDate,
        setupDigest: '7'.repeat(64)
      }
      const formReceipt = {
        operationId: 'forms_a',
        collectionOperationId: 'collection_a',
        workflowOperationId: 'workflow_a',
        stagingOperationId: 'staging_a',
        scope,
        accountId: target.accountId,
        databaseId: target.databaseId,
        name: target.name,
        sourceDigest: '863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e',
        targetDigest: 'c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2'
      }
      const discover = vi.fn(async (wire: unknown) => {
        const { TransferRecoverySourceDiscoveryRequestSchema } =
          await import('~~/shared/pageStudio/transferRecoveryPhase')
        const captured = TransferRecoverySourceDiscoveryRequestSchema.parse(wire)
        const { authorizeCustomerTransferRecoveryPhase } =
          await import('~~/server/utils/pageStudio/customerTransferRecoveryPhaseAuthority')
        await authorizeCustomerTransferRecoveryPhase(captured, {
          runTransaction,
          env
        })
        return {
          purpose: 'source-execution-discovery',
          envelopeDigest: await collectionDigest(captured),
          discovery: {
            ...captured.command.request,
            predecessor,
            freeze: sourceFreeze,
            formReceipt
          }
        }
      })
      const env = {
        PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
        PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
        MANAGED_TRANSFER_EXECUTION_POLICY: JSON.stringify(policy),
        MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY: JSON.stringify({
          formatVersion: 1,
          kind: 'managed-transfer-recovery-source-v1',
          layoutDigest: 'e'.repeat(64),
          execution: { ...policy, to: { ...policy.to, digest: 'c'.repeat(64) } }
        }),
        PAGE_STUDIO_PROVISIONER: {
          discoverManagedTransferRecoveryExecution: discover
        }
      }
      return { ...f, applied, value, policy, discover, env }
    }
    it('retains exact request plus applied recovery association atomically without provider effects', async () => {
      const f = await phaseFixture()
      const result = await prepareCustomerTransferRecoverySourceExecution(f.value, {
        runTransaction,
        env: f.env
      })
      expect(result.state).toBe('execution-reserved')
      expect(
        (await db.query('SELECT count(*)::integer AS n FROM page_studio_managed_transfer_executions')).rows[0]
          .n
      ).toBe(1)
      expect(
        (await db.query('SELECT count(*)::integer AS n FROM page_studio_transfer_recovery_source_executions'))
          .rows[0].n
      ).toBe(1)
      expect(
        (await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows[0]
      ).toEqual({ mode: 'applied', cas_version: 4 })
      expect(f.discover).toHaveBeenCalledTimes(1)
      expect(
        await prepareCustomerTransferRecoverySourceExecution(f.value, {
          runTransaction,
          env: f.env
        })
      ).toEqual(result)
      expect(f.discover).toHaveBeenCalledTimes(1)
    })
    it('keeps legacy and early admission denied after the newly allowed source row', async () => {
      const f = await phaseFixture()
      await prepareCustomerTransferRecoverySourceExecution(f.value, {
        runTransaction,
        env: f.env
      })
      const authority = await import('~~/server/utils/pageStudio/customerTransferRecoveryPhaseAuthority')
      const { readCustomerTransferRecoveryEnabled } =
        await import('~~/server/utils/pageStudio/customerTransferRecoverySourceExecution')
      const enabled = await readCustomerTransferRecoveryEnabled(f.value, {
        runTransaction,
        env: f.env
      })
      expect(
        await authority.authorizeCustomerTransferRecoveryPhase(enabled, {
          runTransaction,
          env: f.env
        })
      ).toEqual({
        purpose: 'recovery-enabled',
        envelopeDigest: await collectionDigest(enabled)
      })
      await expect(
        f.authority.authorizeCustomerTransferRecoveryAdmission(f.applied.envelope, { runTransaction })
      ).rejects.toThrow()
      const { readManagedTransferExecutionContext } =
        await import('~~/server/utils/pageStudio/managedTransferExecution')
      await expect(
        readManagedTransferExecutionContext(
          {
            operationId: enabled.recovery.operationId,
            intentDigest: enabled.recovery.intentDigest
          },
          { runTransaction }
        )
      ).rejects.toThrow()
    })
    it.each(['operator', 'owner', 'plan', 'mapping'] as const)(
      'denies changed current %s authority',
      async (kind) => {
        const f = await phaseFixture()
        if (kind === 'operator')
          await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        if (kind === 'owner')
          await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
        if (kind === 'plan')
          await db.query('UPDATE page_studio_sites SET entitlement_id=$1', [input.entitlementId])
        if (kind === 'mapping') await db.query("UPDATE page_studio_workspace_memberships SET role='viewer'")
        await expect(
          prepareCustomerTransferRecoverySourceExecution(f.value, {
            runTransaction,
            env: f.env
          })
        ).rejects.toThrow()
        expect(f.discover).not.toHaveBeenCalled()
        expect(
          (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0]
            .n
        ).toBe(0)
      }
    )
    it.each(['response digest', 'source', 'freeze', 'foreign predecessor'] as const)(
      'rejects changed discovery %s',
      async (kind) => {
        const f = await phaseFixture(),
          original = f.discover.getMockImplementation()!
        f.discover.mockImplementationOnce(async (wire) => {
          const result = await original(wire)
          if (kind === 'response digest') result.envelopeDigest = '0'.repeat(64)
          if (kind === 'source') result.discovery.sourceTarget.databaseId = randomUUID()
          if (kind === 'freeze') result.discovery.freeze.digest = '0'.repeat(64)
          if (kind === 'foreign predecessor') result.discovery.predecessor.ownerTag = 'bad-owner'
          return result
        })
        await expect(
          prepareCustomerTransferRecoverySourceExecution(f.value, {
            runTransaction,
            env: f.env
          })
        ).rejects.toThrow()
        expect(
          (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0]
            .n
        ).toBe(0)
      }
    )
    it.each(['policy', 'binding', 'source', 'revoke'] as const)(
      'rechecks %s after discovery outside locks',
      async (kind) => {
        const f = await phaseFixture(),
          original = f.discover.getMockImplementation()!
        f.discover.mockImplementationOnce(async (wire) => {
          const result = await original(wire)
          if (kind === 'policy')
            f.env.MANAGED_TRANSFER_EXECUTION_POLICY = JSON.stringify({
              ...f.policy,
              to: { ...f.policy.to, digest: '8'.repeat(64) }
            })
          if (kind === 'binding')
            f.env.PAGE_STUDIO_PROVISIONER = {
              discoverManagedTransferRecoveryExecution: vi.fn()
            }
          if (kind === 'source') await db.query('UPDATE page_studio_cms_scopes SET current_content_id=NULL')
          if (kind === 'revoke') {
            const { changeCustomerTransferRecovery } =
              await import('~~/server/utils/pageStudio/customerTransferRecovery')
            await changeCustomerTransferRecovery(
              {
                siteId: f.value.siteId,
                requestId: f.value.requestId,
                operator: input.operator,
                body: {
                  action: 'revoke',
                  expectedRevision: 5,
                  recoveryId: f.applied.applied.body.recoveryId,
                  expectedHeadVersion: 4
                }
              },
              { runTransaction }
            )
          }
          return result
        })
        await expect(
          prepareCustomerTransferRecoverySourceExecution(f.value, {
            runTransaction,
            env: f.env
          })
        ).rejects.toThrow()
        expect(
          (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0]
            .n
        ).toBe(0)
      }
    )
    it('rolls back the request if immutable association persistence fails', async () => {
      const f = await phaseFixture()
      const failAssociation = <T>(work: (client: pg.Client) => Promise<T>) =>
        runTransaction((client) => {
          const query = client.query.bind(client)
          client.query = (async (sql: string, values?: unknown[]) => {
            if (sql.includes('INSERT INTO page_studio_transfer_recovery_source_executions'))
              throw new Error('Injected association persistence failure')
            return query(sql, values)
          }) as typeof client.query
          return work(client)
        })
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, {
          runTransaction: failAssociation,
          env: f.env
        })
      ).rejects.toThrow()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0].n
      ).toBe(0)
    })
    it.each([
      [false, 'binding'],
      [true, 'binding'],
      [false, 'descriptor'],
      [true, 'descriptor']
    ] as const)('denies final clock replacement (replay=%s, kind=%s)', async (replay, kind) => {
      const f = await phaseFixture()
      if (replay)
        await prepareCustomerTransferRecoverySourceExecution(f.value, {
          runTransaction,
          env: f.env
        })
      let clocks = 0
      const swapAtFinal = <T>(work: (client: pg.Client) => Promise<T>) =>
        runTransaction((client) => {
          const query = client.query.bind(client)
          client.query = (async (sql: string, values?: unknown[]) => {
            const result = await query(sql, values)
            if (sql.includes('SELECT to_char(LEAST(') && ++clocks === (replay ? 1 : 2)) {
              if (kind === 'binding')
                f.env.PAGE_STUDIO_PROVISIONER = {
                  discoverManagedTransferRecoveryExecution: vi.fn()
                }
              else
                f.env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY = JSON.stringify({
                  ...JSON.parse(f.env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY),
                  layoutDigest: 'f'.repeat(64)
                })
            }
            return result
          }) as typeof client.query
          return work(client)
        })
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, {
          runTransaction: swapAtFinal,
          env: f.env
        })
      ).rejects.toThrow()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0].n
      ).toBe(replay ? 1 : 0)
    })
    it('rejects an existing unassociated request instead of relabeling legacy history', async () => {
      const f = await phaseFixture()
      await prepareCustomerTransferRecoverySourceExecution(f.value, {
        runTransaction,
        env: f.env
      })
      // Disposable corruption fixture only: production table normally forbids DELETE.
      await db.query(
        'ALTER TABLE page_studio_transfer_recovery_source_executions DISABLE TRIGGER transfer_recovery_source_execution_guard'
      )
      await db.query('DELETE FROM page_studio_transfer_recovery_source_executions')
      await db.query(
        'ALTER TABLE page_studio_transfer_recovery_source_executions ENABLE TRIGGER transfer_recovery_source_execution_guard'
      )
      f.discover.mockClear()
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, {
          runTransaction,
          env: f.env
        })
      ).rejects.toThrow()
      expect(f.discover).not.toHaveBeenCalled()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_transfer_recovery_source_executions'))
          .rows[0].n
      ).toBe(0)
    })
    it('keeps immutable association after repeat migration and rejects missing data', async () => {
      const f = await phaseFixture()
      await prepareCustomerTransferRecoverySourceExecution(f.value, {
        runTransaction,
        env: f.env
      })
      const before = (await db.query('SELECT * FROM page_studio_transfer_recovery_source_executions')).rows
      await expect(db.query('DELETE FROM page_studio_transfer_recovery_source_executions')).rejects.toThrow()
      await expect(
        db.query("UPDATE page_studio_transfer_recovery_source_executions SET request_digest=repeat('0',64)")
      ).rejects.toThrow()
      await db.query(
        readFileSync(
          'server/database/migrations/478_page_studio_transfer_recovery_source_execution.sql',
          'utf8'
        )
      )
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_source_executions')).rows).toEqual(
        before
      )
      await db.query(
        'ALTER TABLE page_studio_managed_transfer_copy_graph_requests RENAME TO unavailable_copy_requests'
      )
      try {
        await expect(
          prepareCustomerTransferRecoverySourceExecution(f.value, {
            runTransaction,
            env: f.env
          })
        ).rejects.toThrow()
      } finally {
        await db.query(
          'ALTER TABLE unavailable_copy_requests RENAME TO page_studio_managed_transfer_copy_graph_requests'
        )
      }
    })
    it('rejects foreign current identity and recomputed discovery scope digests', async () => {
      const f = await phaseFixture()
      await prepareCustomerTransferRecoverySourceExecution(f.value, { runTransaction, env: f.env })
      const { TransferRecoverySourceDiscoveryRequestSchema } =
        await import('~~/shared/pageStudio/transferRecoveryPhase')
      const { authorizeCustomerTransferRecoveryPhase } =
        await import('~~/server/utils/pageStudio/customerTransferRecoveryPhaseAuthority')
      const original = TransferRecoverySourceDiscoveryRequestSchema.parse(f.discover.mock.calls[0]![0])
      const mutations = [
        (v: typeof original) => {
          v.pending.digest = '0'.repeat(64)
        },
        (v: typeof original) => {
          v.recovery.appliedDigest = '0'.repeat(64)
        },
        (v: typeof original) => {
          v.inspection.pg.requestId = randomUUID()
        },
        (v: typeof original) => {
          v.inspection.pg.recoveryId = randomUUID()
        },
        (v: typeof original) => {
          v.inspection.pg.deadline = '2099-01-01T00:00:00.000Z'
        },
        (v: typeof original) => {
          v.inspection.operatorId = randomUUID()
        },
        (v: typeof original) => {
          v.inspection.loginSessionHash = '0'.repeat(64)
        },
        async (v: typeof original) => {
          v.command.request.sourceTarget.databaseId = randomUUID()
          v.command.requestDigest = await collectionDigest(v.command.request)
        }
      ]
      for (const mutate of mutations) {
        const changed = structuredClone(original)
        await mutate(changed)
        await expect(
          authorizeCustomerTransferRecoveryPhase(changed, { runTransaction, env: f.env })
        ).rejects.toThrow()
      }
    })
    it('requires the recovery discovery binding without legacy fallback', async () => {
      const f = await phaseFixture(),
        legacy = vi.fn()
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, {
          runTransaction,
          env: { ...f.env, PAGE_STUDIO_PROVISIONER: { discoverManagedTransferExecution: legacy } }
        })
      ).rejects.toThrow()
      expect(legacy).not.toHaveBeenCalled()
      expect(f.discover).not.toHaveBeenCalled()
    })
    it('serializes competing request retention into one immutable association', async () => {
      const f = await phaseFixture()
      const outcomes = await Promise.allSettled(
        [f.value, { ...f.value, body: { ...f.value.body, invocationId: randomUUID() } }].map((value) =>
          prepareCustomerTransferRecoverySourceExecution(value, { runTransaction, env: f.env })
        )
      )
      expect(outcomes.some((value) => value.status === 'fulfilled')).toBe(true)
      const fulfilled = outcomes.filter((value) => value.status === 'fulfilled')
      if (fulfilled.length === 2) expect(fulfilled[0]!.value).toEqual(fulfilled[1]!.value)
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0].n
      ).toBe(1)
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_transfer_recovery_source_executions'))
          .rows[0].n
      ).toBe(1)
    })
    it('rolls back both records if the consenting owner expires at the final SQL clock', async () => {
      const f = await phaseFixture()
      let clocks = 0
      const expireAtFinal = <T>(work: (client: pg.Client) => Promise<T>) =>
        runTransaction((client) => {
          const query = client.query.bind(client)
          client.query = (async (sql: string, values?: unknown[]) => {
            if (sql.includes('SELECT to_char(LEAST(') && ++clocks === 2)
              await query(
                'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp() WHERE token_hash=$1',
                [input.ownerLoginSessionHash]
              )
            return query(sql, values)
          }) as typeof client.query
          return work(client)
        })
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, { runTransaction: expireAtFinal, env: f.env })
      ).rejects.toThrow()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0].n
      ).toBe(0)
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_transfer_recovery_source_executions'))
          .rows[0].n
      ).toBe(0)
    })
    it('rejects direct association inserts with foreign applied identity or request linkage', async () => {
      const f = await phaseFixture()
      await prepareCustomerTransferRecoverySourceExecution(f.value, { runTransaction, env: f.env })
      const original = (await db.query('SELECT * FROM page_studio_transfer_recovery_source_executions'))
        .rows[0]
      const changes = [
        { intent_digest: '0'.repeat(64) },
        { applied_digest: '0'.repeat(64) },
        { request_digest: '0'.repeat(64) },
        { recovery_id: randomUUID() },
        { admission_id: randomUUID() },
        { epoch: 2 },
        { intent_digest: null },
        { applied_digest: null },
        { request_digest: null },
        { recovery_descriptor: null },
        { recovery_descriptor: { ...original.recovery_descriptor, formatVersion: 2 } },
        { recovery_descriptor: { ...original.recovery_descriptor, kind: 'managed-draft-transfer' } },
        { recovery_descriptor: { ...original.recovery_descriptor, layoutDigest: null } },
        ...['from', 'to', 'accountId', 'namespace'].map((field) => ({
          recovery_descriptor: {
            ...original.recovery_descriptor,
            execution: {
              ...original.recovery_descriptor.execution,
              [field]: null
            }
          }
        }))
      ]
      for (const change of changes) {
        const row = { ...original, ...change }
        await expect(
          db.query(
            `INSERT INTO page_studio_transfer_recovery_source_executions
            (operation_id,intent_digest,recovery_id,epoch,admission_id,applied_digest,request_digest,recovery_descriptor,descriptor_digest)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
            [
              row.operation_id,
              row.intent_digest,
              row.recovery_id,
              row.epoch,
              row.admission_id,
              row.applied_digest,
              row.request_digest,
              JSON.stringify(row.recovery_descriptor),
              row.descriptor_digest
            ]
          )
        ).rejects.toThrow('Recovery source execution requires exact current applied identity')
      }
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_source_executions')).rows).toEqual([
        original
      ])
    })
    it('denies retention before discovery when only the ordinary execution target is configured', async () => {
      const f = await phaseFixture()
      const { MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY: _descriptor, ...ordinaryOnly } = f.env
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, {
          runTransaction,
          env: ordinaryOnly
        })
      ).rejects.toThrow()
      expect(f.discover).not.toHaveBeenCalled()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0].n
      ).toBe(0)
    })

    it('rejects malformed, foreign and ordinary-target recovery descriptors before discovery', async () => {
      const f = await phaseFixture()
      const descriptor = JSON.parse(f.env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY)
      for (const changed of [
        { ...descriptor, formatVersion: 2 },
        { ...descriptor, kind: 'ordinary' },
        { ...descriptor, layoutDigest: null },
        { ...descriptor, unexpected: true },
        { ...descriptor, execution: { ...descriptor.execution, to: f.policy.to } },
        { ...descriptor, execution: { ...descriptor.execution, to: f.policy.from } },
        { ...descriptor, execution: { ...descriptor.execution, from: f.policy.to } },
        { ...descriptor, execution: { ...descriptor.execution, accountId: '0'.repeat(32) } },
        {
          ...descriptor,
          execution: { ...descriptor.execution, namespace: 'xeroflow-page-studio-dispatch-production' }
        }
      ]) {
        await expect(
          prepareCustomerTransferRecoverySourceExecution(f.value, {
            runTransaction,
            env: { ...f.env, MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY: JSON.stringify(changed) }
          })
        ).rejects.toThrow()
      }
      expect(f.discover).not.toHaveBeenCalled()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0].n
      ).toBe(0)
    })
    it('retains exact recovery descriptor provenance and denies changed descriptor replay', async () => {
      const f = await phaseFixture()
      await prepareCustomerTransferRecoverySourceExecution(f.value, { runTransaction, env: f.env })
      const descriptor = JSON.parse(f.env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY)
      const row = (await db.query('SELECT * FROM page_studio_transfer_recovery_source_executions')).rows[0]
      expect(row.recovery_descriptor).toEqual(descriptor)
      expect(row.descriptor_digest).toBe(await collectionDigest(descriptor))
      const request = (await db.query('SELECT request FROM page_studio_managed_transfer_executions')).rows[0]
        .request
      expect(request.policy.to).toEqual(descriptor.execution.to)
      expect(request.policy.to).not.toEqual(f.policy.to)
      f.env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY = JSON.stringify({
        ...descriptor,
        layoutDigest: 'f'.repeat(64)
      })
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, { runTransaction, env: f.env })
      ).rejects.toThrow()
      expect(f.discover).toHaveBeenCalledTimes(1)
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_source_executions')).rows).toEqual([
        row
      ])
    })
    it('denies descriptor drift after discovery before retaining any request', async () => {
      const f = await phaseFixture(),
        original = f.discover.getMockImplementation()!
      f.discover.mockImplementationOnce(async (wire) => {
        const result = await original(wire)
        const descriptor = JSON.parse(f.env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY)
        f.env.MANAGED_TRANSFER_RECOVERY_EXECUTION_POLICY = JSON.stringify({
          ...descriptor,
          layoutDigest: 'f'.repeat(64)
        })
        return result
      })
      await expect(
        prepareCustomerTransferRecoverySourceExecution(f.value, { runTransaction, env: f.env })
      ).rejects.toThrow()
      expect(
        (await db.query('SELECT count(*)::integer n FROM page_studio_managed_transfer_executions')).rows[0].n
      ).toBe(0)
    })
    it('invokes callable RPC proxy for discovery without call/bind properties', async () => {
      const f = await phaseFixture(),
        service = f.env.PAGE_STUDIO_PROVISIONER,
        properties: PropertyKey[] = []
      let calls = 0
      service.discoverManagedTransferRecoveryExecution = new Proxy(f.discover, {
        get(target, property, receiver) {
          if (property === 'call' || property === 'bind') {
            properties.push(property)
            throw new Error('Named RPC function property is a remote method')
          }
          return Reflect.get(target, property, receiver)
        },
        apply(target, receiver, args) {
          calls++
          expect(receiver).toBe(service)
          expect(args).toHaveLength(1)
          return Reflect.apply(target, receiver, args)
        }
      })
      expect(
        await prepareCustomerTransferRecoverySourceExecution(f.value, { env: f.env, runTransaction })
      ).toMatchObject({ state: 'execution-reserved' })
      expect(calls).toBe(1)
      expect(properties).toEqual([])
    })
  }
)
