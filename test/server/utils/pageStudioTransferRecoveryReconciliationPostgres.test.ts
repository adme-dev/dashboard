import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import type { CmsFreezeReceiptSchema } from '~~/shared/pageStudio/cmsManaged'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => { throw new Error('Use disposable transaction') },
  transaction: () => { throw new Error('Use disposable transaction') }
}))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname) || url.search) throw new Error('Disposable localhost studio_cms database required')
}

describe.runIf(Boolean(databaseUrl))('immutable complete recovery reconciliation on PostgreSQL', () => {
  const schema = `inventory_${randomUUID().replaceAll('-', '')}`
  const actorId = randomUUID()
  const operatorHash = 'a'.repeat(64)
  let db: pg.Client
  let input: { siteId: string, entitlementId: string, ownerLoginSessionHash: string, operator: { actorId: string, loginSessionHash: string } }
  let expected: { identityId: string, accountId: string, workspaceId: string, tenantId: string, businessId: string }
  const runTransaction = async <T>(work: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      await client.query('SET LOCAL statement_timeout=\'6s\'')
      await client.query('SET LOCAL TIME ZONE \'UTC\'')
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
    await db.query(`CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN DEFAULT FALSE);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT,role TEXT,revoked_at TIMESTAMPTZ);
      CREATE TABLE transfer_effects(value TEXT);`)
    for (const name of ['402_page_studio_control_plane.sql', '404_page_studio_documents.sql', '420_page_studio_login_sessions.sql',
      '422_page_studio_cms_visibility.sql', '425_page_studio_cms_authoring_scope.sql',
      '442_page_studio_customer_workspaces.sql', '443_page_studio_customer_signup.sql', '444_page_studio_customer_site_ownership.sql']) {
      await db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
    }
  })
  beforeEach(async () => {
    await db.query('TRUNCATE agency_clients,team_members,page_studio_customer_identities,page_studio_customer_accounts,page_studio_login_sessions,transfer_effects CASCADE')
    await db.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [actorId])
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`, [operatorHash, actorId])
    const signup = await import('~~/server/utils/pageStudio/customerSignup')
    const requested = await signup.requestCustomerSignIn({ email: 'transfer-owner@example.test', name: 'Transfer owner', mode: 'signup', acceptedTerms: true }, 'preview-v1', runTransaction)
    const login = await signup.verifyCustomerSignIn(requested!.token, runTransaction)
    const { createCustomerWorkspace } = await import('~~/server/utils/pageStudio/customerWorkspaces')
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    const workspace = await createCustomerWorkspace({ identityId: login.identityId, requestId: randomUUID(), name: 'Transfer test' }, runTransaction)
    const site = await createCustomerPreviewSite({ workspaceId: workspace.workspace.id, identityId: login.identityId,
      requestId: randomUUID(), name: 'Transfer source', route: 'transfer-test', starterVersion: 'floristry-v1' }, { runTransaction,
      previewPolicy: { approvalId: randomUUID(), approvedBy: actorId, expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        pagesPerSiteLimit: 5, storageBytesLimit: 10000, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 10000 } })
    const { grantCustomerPublishingPlan } = await import('~~/server/utils/pageStudio/customerPlanGrants')
    const plan = await grantCustomerPublishingPlan({ actorId, body: { requestId: randomUUID(), workspaceId: site.workspaceId,
      expectedEntitlementId: (await db.query('SELECT entitlement_id FROM page_studio_sites')).rows[0].entitlement_id,
      planKey: 'studio_business', pagesPerSiteLimit: 10, storageBytesLimit: 100000, domainLimit: 2,
      aiOperationLimit: 0, buildLimit: 20, trafficBytesLimit: 100000, effectiveUntil: null, reason: 'Approved publishing plan' } }, { runTransaction })
    const { digestPortalSessionToken } = await import('~~/server/utils/portalSession')
    input = { siteId: site.site.id, entitlementId: plan.entitlement.id, ownerLoginSessionHash: await digestPortalSessionToken(login.sessionToken),
      operator: { actorId, loginSessionHash: operatorHash } }
    expected = { identityId: login.identityId, accountId: (await db.query('SELECT id FROM page_studio_customer_accounts')).rows[0].id,
      workspaceId: site.workspaceId, tenantId: site.tenantId, businessId: site.businessId }
  })
  afterAll(async () => {
    if (!db) return
    try {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })

  let key: string, generation: string, schemaObject: string, contentObject: string, recordObject: string
  let sourceFreeze: z.infer<typeof CmsFreezeReceiptSchema>
  const pin = (kind: string, version = 1) => ({ kind, collectionId: kind === 'content' ? '' : 'products', recordId: kind === 'record' ? 'first' : '',
    version, bytes: 30, freezeDigest: sourceFreeze.digest, operationId: 'adoption_a', origin: 'legacy', sha256: 'a'.repeat(64) })
  beforeAll(async () => {
    await db.query(readFileSync('server/database/migrations/457_page_studio_managed_transfer_intents.sql', 'utf8'))
    for (const name of readdirSync('server/database/migrations').filter(name => /^(45[89]|46[0-9]|470|471)_/.test(name)).sort()) {
      await db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
    }
    await db.query(readFileSync('server/database/migrations/473_page_studio_transfer_recovery_heads.sql', 'utf8'))
    await db.query(readFileSync('server/database/migrations/472_page_studio_transfer_requests.sql', 'utf8'))
    await db.query(readFileSync('server/database/migrations/474_page_studio_transfer_recovery_reconciliations.sql', 'utf8'))
    await db.query(readFileSync('server/database/migrations/474_page_studio_transfer_recovery_reconciliations.sql', 'utf8'))
  })
  beforeEach(async () => {
    const scope = { tenantId: expected.tenantId, clientId: expected.businessId, businessId: expected.businessId, siteId: input.siteId, environment: 'staging' }
    key = JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment])
    generation = randomUUID()
    schemaObject = randomUUID()
    contentObject = randomUUID()
    recordObject = randomUUID()
    const applicationId = randomUUID()
    const manifest = { formatVersion: 1, scope, generation, applicationId, checkpoint: { id: 'checkpoint_a', digest: 'c'.repeat(64) },
      schemas: [{ collectionId: 'products', objectId: schemaObject }], components: [], actions: [], previousApplicationId: null }
    await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
        VALUES('checkpoint_a',$1,$2,$3,$4,$5,'fixture',clock_timestamp())`, [scope.tenantId, scope.clientId, scope.siteId, 'c'.repeat(64),
      `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/checkpoint_a.json`])
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=\'checkpoint_a\' WHERE id=$1', [input.siteId])
    const target = { accountId: 'a'.repeat(32), databaseId: randomUUID(), name: `ps-content-${'b'.repeat(32)}`, routeId: 'route_a', runtimeDigest: 'a'.repeat(64),
      collectionReceiptDigest: 'b'.repeat(64), workflowReceiptDigest: 'c'.repeat(64), stagingReceiptDigest: 'd'.repeat(64) }
    const freezeBody = { createdAt: '2026-10-15T00:00:00.000Z', state: 'frozen' as const, request: { formatVersion: 1 as const, adoptionId: 'adoption_a',
      actor: { kind: 'agency-user' as const, userId: actorId, loginSessionHash: operatorHash }, scope, target } }
    sourceFreeze = { ...freezeBody, digest: await collectionDigest(freezeBody) }
    await db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest)
        VALUES($1,$2,$3,$3,$4,'staging','legacy','adoption_a',$5,$6,$7)`, [key, scope.tenantId, scope.clientId, scope.siteId, generation,
      target, sourceFreeze.digest])
    await db.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id)
        VALUES($1,$2,$3,$4,$5,'adoption_a')`, [key, generation, applicationId, await collectionDigest(manifest), manifest])
    for (const [kind, id] of [['schema', schemaObject], ['content', contentObject], ['record', recordObject]]) {
      await db.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id)
          VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,clock_timestamp(),'adoption_a')`,
      [key, generation, id, kind, kind === 'content' ? '' : 'products', kind === 'record' ? 'first' : '', pin(kind!), kind === 'record' ? schemaObject : null,
        kind === 'record' ? false : null, expected.identityId])
    }
    await db.query(`INSERT INTO page_studio_cms_application_schemas(scope_key,generation,application_id,collection_id,object_id)
        VALUES($1,$2,$3,'products',$4)`, [key, generation, applicationId, schemaObject])
    await db.query(`INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id)
        VALUES($1,$2,'products','first',$3)`, [key, generation, recordObject])
    await db.query('UPDATE page_studio_cms_scopes SET state=\'managed\',current_application_id=$2,current_content_id=$3 WHERE scope_key=$1', [key, applicationId, contentObject])
  })

  let requestId: string
  beforeEach(() => {
    requestId = randomUUID()
  })
  async function control(action: string, revision?: number, changes = {}, run = runTransaction) {
    const { executeTransferControls } = await import('~~/workers/page-studio-management/src/transferControls')
    return executeTransferControls({ expectedEnvironment: 'production', action, siteId: input.siteId,
      ...(action === 'owner-status' ? {} : { requestId }),
      ...(['review', 'reserve', 'operator-status'].includes(action) ? { operator: input.operator } : { ownerLoginSessionHash: input.ownerLoginSessionHash }),
      ...(revision === undefined ? {} : { expectedRevision: revision }), ...changes }, { runTransaction: run })
  }
  async function approved() {
    await control('request')
    await control('review', 1)
    return control('approve', 2)
  }

  async function fixture(expiringPlan = false, recoveryMillis = 3600000) {
    if (expiringPlan) await db.query("UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+interval '1 second' WHERE id=$1", [input.entitlementId])
    await approved()
    await control('reserve', 3)
    const stored = (await db.query('SELECT operation_id,intent_digest,intent FROM page_studio_managed_transfer_intents')).rows[0]
    const reference = { operationId: stored.operation_id, intentDigest: stored.intent_digest }
    const resources = await import('~~/server/utils/pageStudio/managedTransferResources')
    const artifacts = { runtimeDigest: 'd'.repeat(64), schemaDigest: 'e'.repeat(64), policyVersion: 'content-attachment-v1' }
    const prepared = await resources.prepareManagedTransferResources(reference, { runTransaction, artifacts })
    const attachment = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
    const databaseId = randomUUID()
    const physical = { version: 1, ...reference, resourceIdentity: prepared.resourceIdentity,
      preparationId: randomUUID(), preparationDigest: '1'.repeat(64),
      database: { accountId: 'a'.repeat(32), databaseId, name: `ps-content-${'3'.repeat(32)}`, schemaDigest: artifacts.schemaDigest },
      worker: { accountId: 'a'.repeat(32), databaseId, scope: attachment.scope,
        namespace: 'xeroflow-page-studio-dispatch-production', scriptName: `ps-content-${'4'.repeat(32)}`,
        ownerTag: `ps-owner-${'5'.repeat(32)}`, compatibilityDate: '2026-08-18', runtimeDigest: artifacts.runtimeDigest,
        setupDigest: await collectionDigest({ attachmentIdentity: prepared.resourceIdentity, mode: attachment.mode }), etag: 'fixture-etag' } }
    await resources.bindManagedTransferResources(reference, { runTransaction, provider: { accountId: 'a'.repeat(32), compatibilityDate: '2026-08-18' },
      inspect: async () => physical })
    const { prepareManagedTransferDestinationCatalogue } = await import('~~/server/utils/pageStudio/managedTransferDestinationCatalogue')
    const env = { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
    const catalogueRequest = await prepareManagedTransferDestinationCatalogue(reference, { runTransaction, env })
    const { planManagedTransferDestinationCatalogue } = await import('~~/shared/pageStudio/managed-transfer-destination-catalogue-result')
    const plan = await planManagedTransferDestinationCatalogue(catalogueRequest)
    const { coordinateManagedTransferDestinationCatalogue } = await import('~~/server/utils/pageStudio/managedTransferDestinationCatalogueCoordinator')
    await coordinateManagedTransferDestinationCatalogue({ ...reference, action: 'verify' }, { runTransaction, env: { ...env,
      PAGE_STUDIO_PROVISIONER: { inspectManagedTransferDestinationCatalogue: async () => ({
        ...reference, requestDigest: plan.requestDigest, planDigest: plan.planDigest, state: 'ready',
        completedPhases: ['collection','workflow','staging','forms'], receipt: plan.receipt }) } } })
    const recoveryId = randomUUID(), deadline = new Date(Date.now()+recoveryMillis).toISOString()
    const { changeCustomerTransferRecovery } = await import('~~/server/utils/pageStudio/customerTransferRecovery')
    await changeCustomerTransferRecovery({ siteId: input.siteId, requestId, operator: input.operator,
      body: { action: 'open', expectedRevision: 5, expectedHeadVersion: null, recoveryId, deadline } }, { runTransaction })
    const request = { ...reference, resourceRequest: attachment }
    return { purpose: 'inventory' as const, request, requestDigest: await collectionDigest(request),
      recovery: { ...reference, recoveryId, epoch: 1, version: 1, mode: 'closed' as const },
      inspection: { operatorId: actorId, loginSessionHash: operatorHash,
        pg: { requestId, requestRevision: 5, recoveryId, epoch: 1, version: 1, deadline } },
      source: { scope: stored.intent.authority.source, target: stored.intent.source.context.state.target,
        freezeDigest: stored.intent.source.context.state.freeze_digest,
        checkpoint: { checkpointId: stored.intent.source.checkpoint.id, objectKey: stored.intent.source.checkpoint.object_key,
          digest: stored.intent.source.checkpoint.digest } }, catalogueRequest }
  }
  async function observation(value: Awaited<ReturnType<typeof fixture>>) {
    const { planManagedTransferDestinationCatalogue } = await import('~~/shared/pageStudio/managed-transfer-destination-catalogue-result')
    const plan = await planManagedTransferDestinationCatalogue(value.catalogueRequest)
    const digest = 'd'.repeat(64)
    const registry = { executions: 0, uploads: 0, destinations: 0, authoring: 0 }
    const physical = { transferSchema: 0, transferFences: 0, importSchema: 0, imports: 0, preparations: 0, preparedObjects: 0 }
    // Trusted observer fixture only. Studio separately tests actual provider/D1 observations.
    return { kind: 'completed-early-phase-inventory', version: 1, envelopeDigest: await collectionDigest(value),
      recovery: value.recovery, resources: { digest: await collectionDigest(value.catalogueRequest.baseline),
        resourceIdentity: value.catalogueRequest.baseline.resourceIdentity, databaseId: value.catalogueRequest.baseline.database.databaseId },
      catalogue: { requestDigest: plan.requestDigest, planDigest: plan.planDigest, receiptDigest: plan.receipt.digest,
        verifiedPhases: ['collection','workflow','staging','forms'], snapshotDigest: digest },
      source: { scope: value.source.scope, target: value.source.target, freezeDigest: value.source.freezeDigest,
        checkpointDigest: value.source.checkpoint.digest, registryDigest: digest, workerDigest: digest, physicalDigest: digest, historyDigest: digest },
      destination: { registryDigest: digest, physicalDigest: digest, historyDigest: digest },
      later: { sourceRegistry: registry, destinationRegistry: registry, sourcePhysical: physical, destinationPhysical: { ...physical, cutovers: 0 } },
      noninterference: { version: 1, resources: 'complete-one-shot-effects', catalogue: 'complete-four-phase-effects',
        catalogueBarrierDigest: digest, source: 'exact-adoption-freeze', later: 'fresh-pg-admission-and-physical-absence' } }
  }
  async function capture(value: unknown, observe: (value: Awaited<ReturnType<typeof fixture>>) => Promise<unknown>, run = runTransaction) {
    const { captureCustomerTransferRecoveryReconciliation } = await import('~~/server/utils/pageStudio/customerTransferRecoveryReconciliation')
    return captureCustomerTransferRecoveryReconciliation(value, { observe, runTransaction: run })
  }
  it('persists a complete immutable historical observation without promoting the recovery head', async () => {
    const inventory = await fixture(), captureId = randomUUID()
    const result = await capture({ captureId, inventory }, observation)
    expect(result.historical).toBe(false)
    expect(result.receipt.invariant.captureId).toBe(captureId)
    expect(result.receipt.invariant.observation.envelopeDigest).toBe(await collectionDigest(inventory))
    expect((await db.query('SELECT mode,cas_version,reconciliation_digest FROM page_studio_transfer_recovery_heads')).rows)
      .toEqual([{ mode: 'reconciling', cas_version: 1, reconciliation_digest: null }])
    expect((await db.query('SELECT count(*)::int AS n FROM page_studio_transfer_recovery_reconciliations')).rows[0].n).toBe(1)
  })
  async function count() { return (await db.query('SELECT count(*)::int AS n FROM page_studio_transfer_recovery_reconciliations')).rows[0].n }
  async function revoke(inventory: Awaited<ReturnType<typeof fixture>>) {
    const { changeCustomerTransferRecovery } = await import('~~/server/utils/pageStudio/customerTransferRecovery')
    await changeCustomerTransferRecovery({ siteId: input.siteId, requestId, operator: input.operator,
      body: { action: 'revoke', expectedRevision: 5, recoveryId: inventory.recovery.recoveryId, expectedHeadVersion: 1 } }, { runTransaction })
  }
  async function read(captureId: string, changes = {}) {
    const { readCustomerTransferRecoveryReconciliation } = await import('~~/server/utils/pageStudio/customerTransferRecoveryReconciliation')
    return readCustomerTransferRecoveryReconciliation({ siteId: input.siteId, requestId, expectedRevision: 5,
      captureId, operator: input.operator, ...changes }, { runTransaction })
  }
  it('runs the observer outside PG locks and records database times bracketing it', async () => {
    const inventory = await fixture(), captureId = randomUUID()
    let during: Date
    const result = await capture({ captureId, inventory }, async value => {
      await runTransaction(async client => {
        await client.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR UPDATE NOWAIT', [input.siteId])
        during = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now
      })
      return observation(value)
    })
    expect(Date.parse(result.receipt.observedStartedAt)).toBeLessThanOrEqual(during!.getTime())
    expect(Date.parse(result.receipt.observedCompletedAt)).toBeGreaterThanOrEqual(during!.getTime())
  })
  it('returns exact invocation replay as historical after revocation without observing again', async () => {
    const inventory = await fixture(), captureId = randomUUID(), observe = vi.fn(observation)
    const first = await capture({ captureId, inventory }, observe)
    await revoke(inventory)
    expect(await capture({ captureId, inventory }, observe)).toEqual({ historical: true, receipt: first.receipt })
    expect(observe).toHaveBeenCalledTimes(1)
    expect(await count()).toBe(1)
    expect((await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows[0]).toEqual({ mode: 'revoked', cas_version: 2 })
  })
  it('separates fresh-login historical retrieval from exact original invocation replay', async () => {
    const inventory = await fixture(), captureId = randomUUID()
    const first = await capture({ captureId, inventory }, observation)
    await revoke(inventory)
    await db.query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1", [operatorHash])
    const fresh = 'f'.repeat(64)
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,clock_timestamp(),clock_timestamp()+interval '1 hour')`, [fresh, actorId])
    const observe = vi.fn(observation)
    await expect(capture({ captureId, inventory }, observe)).rejects.toBeDefined()
    await expect(capture({ captureId, inventory: { ...inventory, inspection: { ...inventory.inspection, loginSessionHash: fresh } } }, observe)).rejects.toBeDefined()
    expect(await read(captureId, { operator: { actorId, loginSessionHash: fresh } })).toEqual({ historical: true, receipt: first.receipt })
    expect(observe).not.toHaveBeenCalled()
    expect(await count()).toBe(1)
  })
  it.each(['siteId','requestId','captureId','expectedRevision','operator'])('denies historical retrieval with foreign %s', async field => {
    const inventory = await fixture(), captureId = randomUUID()
    await capture({ captureId, inventory }, observation)
    const wrong = field === 'expectedRevision' ? 4 : field === 'operator' ? { actorId: randomUUID(), loginSessionHash: operatorHash } : randomUUID()
    await expect(read(captureId, { [field]: wrong })).rejects.toBeDefined()
  })
  it('denies historical retrieval after current operator revocation', async () => {
    const inventory = await fixture(), captureId = randomUUID()
    await capture({ captureId, inventory }, observation)
    await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [operatorHash])
    await expect(read(captureId)).rejects.toBeDefined()
  })
  it.each(['revocation','source','principal','phase'])('rolls back capture after %s changes during remote observation', async kind => {
    const inventory = await fixture(), captureId = randomUUID()
    await expect(capture({ captureId, inventory }, async value => {
      if (kind === 'revocation') await revoke(inventory)
      if (kind === 'source') await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL WHERE id=$1', [input.siteId])
      if (kind === 'principal') await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [operatorHash])
      if (kind === 'phase') {
        // Positive retained admission, not a provider effect.
        const accountId='a'.repeat(32), scriptName=`ps-content-${'9'.repeat(32)}`
        const request={ formatVersion:1, ...value.request, sourceScope:{environment:'staging'}, predecessor:{accountId},
          successor:{accountId,namespace:'xeroflow-page-studio-dispatch-staging',scriptName} }
        await db.query(`INSERT INTO page_studio_managed_transfer_executions(operation_id,intent_digest,request,request_digest,account_id,namespace,script_name)
          VALUES($1,$2,$3,$4,$5,'xeroflow-page-studio-dispatch-staging',$6)`,
        [value.request.operationId,value.request.intentDigest,request,await collectionDigest(request),accountId,scriptName])
      }
      return observation(value)
    })).rejects.toBeDefined()
    expect(await count()).toBe(0)
  })
  it('rolls back an inserted receipt if the final principal clock expires', async () => {
    const inventory=await fixture(), captureId=randomUUID()
    let inserted=false
    const run=async <T>(work:(client:pg.Client)=>Promise<T>)=>runTransaction(async client=>{
      const query=client.query.bind(client)
      const wrapped={ query:async(sql:string,params?:unknown[])=>{
        const result=await query(sql,params)
        if(sql.includes('INSERT INTO page_studio_transfer_recovery_reconciliations')) {
          inserted=true
          await query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1", [operatorHash])
        }
        return result
      }} as pg.Client
      return work(wrapped)
    })
    await expect(capture({captureId,inventory},observation,run)).rejects.toBeDefined()
    expect(inserted).toBe(true)
    expect(await count()).toBe(0)
  })
  it('rolls back on immutable receipt storage failure without changing the head', async () => {
    const inventory=await fixture(), captureId=randomUUID()
    await db.query(`CREATE FUNCTION reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rejection'; END $$;
      CREATE TRIGGER fixture_receipt_reject BEFORE INSERT ON page_studio_transfer_recovery_reconciliations FOR EACH ROW EXECUTE FUNCTION reject_receipt()`)
    try { await expect(capture({captureId,inventory},observation)).rejects.toBeDefined() } finally {
      await db.query('DROP TRIGGER fixture_receipt_reject ON page_studio_transfer_recovery_reconciliations; DROP FUNCTION reject_receipt()')
    }
    expect(await count()).toBe(0)
    expect((await db.query('SELECT cas_version FROM page_studio_transfer_recovery_heads')).rows[0].cas_version).toBe(1)
  })
  it('detaches input and observation dependencies before the first await', async () => {
    const inventory=await fixture(), captureId=randomUUID(), original=structuredClone(inventory)
    const {captureCustomerTransferRecoveryReconciliation}=await import('~~/server/utils/pageStudio/customerTransferRecoveryReconciliation')
    const dependencies={runTransaction,observe:vi.fn(observation)}
    const started=captureCustomerTransferRecoveryReconciliation({captureId,inventory},dependencies)
    inventory.inspection.pg.version=9
    dependencies.observe=vi.fn(async()=>{throw new Error('changed dependency')})
    const result=await started
    expect(result.receipt.invariant.invocationDigest).toBe(await collectionDigest(original))
    expect(dependencies.observe).not.toHaveBeenCalled()
  })
  it('does not allow the observer to mutate captured input authority', async () => {
    const inventory=await fixture(),captureId=randomUUID()
    const result=await capture({captureId,inventory},async value=>{
      const output=await observation(value)
      value.inspection.pg.version=99
      return output
    })
    expect(result.receipt.invariant.authority.pgVersion).toBe(1)
  })
  function replacePath(value: unknown, path: string, replacement: unknown) {
    const parts=path.split('.'), key=parts.pop()!
    const parent=parts.reduce((o,k)=>o[k] as Record<string,unknown>, value as Record<string,unknown>)
    parent[key]=replacement
    return value
  }
  const sections=['kind','version','envelopeDigest','recovery','resources','catalogue','source','destination','later','noninterference']
  it.each(sections)('rejects omitted complete observation section %s',async section=>{
    const inventory=await fixture()
    await expect(capture({captureId:randomUUID(),inventory},async value=>{
      return Object.fromEntries(Object.entries(await observation(value)).filter(([key])=>key!==section))
    })).rejects.toBeDefined()
    expect(await count()).toBe(0)
  })
  it.each(sections)('rejects null complete observation section %s',async section=>{
    const inventory=await fixture()
    await expect(capture({captureId:randomUUID(),inventory},async value=>{
      return replacePath(await observation(value),section,null)
    })).rejects.toBeDefined()
    expect(await count()).toBe(0)
  })
  const identities=['envelopeDigest','recovery.operationId','recovery.intentDigest','recovery.recoveryId','recovery.epoch','recovery.version',
    'resources.digest','resources.resourceIdentity','resources.databaseId','catalogue.requestDigest','catalogue.planDigest','catalogue.receiptDigest',
    'source.scope.siteId','source.target.databaseId','source.freezeDigest','source.checkpointDigest']
  it.each(identities)('rejects foreign complete observation identity %s',async path=>{
    const inventory=await fixture()
    await expect(capture({captureId:randomUUID(),inventory},async value=>{
      const key=path.split('.').at(-1)!
      return replacePath(await observation(value),path,['epoch','version'].includes(key)?2:
        key==='resourceIdentity'?`cms_attach_${'f'.repeat(64)}`:/Id$/.test(key)?randomUUID():'f'.repeat(64))
    })).rejects.toBeDefined()
    expect(await count()).toBe(0)
  })
  const counts=['sourceRegistry.executions','sourceRegistry.uploads','sourceRegistry.destinations','sourceRegistry.authoring',
    'destinationRegistry.executions','destinationRegistry.uploads','destinationRegistry.destinations','destinationRegistry.authoring',
    ...['sourcePhysical','destinationPhysical'].flatMap(part=>['transferSchema','transferFences','importSchema','imports','preparations','preparedObjects'].map(k=>`${part}.${k}`)),
    'destinationPhysical.cutovers']
  it.each(counts)('rejects positive later-phase evidence %s',async path=>{
    const inventory=await fixture()
    await expect(capture({captureId:randomUUID(),inventory},async value=>{
      return replacePath(await observation(value),`later.${path}`,1)
    })).rejects.toBeDefined()
    expect(await count()).toBe(0)
  })
  it.each(['unknown','phases','proofVersion','eligibility'])('rejects unsupported result %s',async kind=>{
    const inventory=await fixture()
    await expect(capture({captureId:randomUUID(),inventory},async value=>{
      const output=await observation(value)
      if(kind==='unknown')return replacePath(output,'later.unknown',{})
      if(kind==='phases')return replacePath(output,'catalogue.verifiedPhases',['collection','workflow','staging'])
      if(kind==='proofVersion')return replacePath(output,'noninterference.version',2)
      return replacePath(output,'eligible',true)
    })).rejects.toBeDefined()
  })
  it('enforces append-only receipt rows and body/column identity SQL constraints',async()=>{
    const inventory=await fixture(),captureId=randomUUID()
    await capture({captureId,inventory},observation)
    await expect(db.query('UPDATE page_studio_transfer_recovery_reconciliations SET observed_completed_at=clock_timestamp() WHERE capture_id=$1',[captureId])).rejects.toThrow('immutable')
    await expect(db.query('DELETE FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$1',[captureId])).rejects.toThrow('immutable')
    await expect(db.query(`INSERT INTO page_studio_transfer_recovery_reconciliations SELECT $1,operation_id,request_id,request_revision,intent_digest,
      recovery_id,epoch,pg_version,d1_version,invocation_digest,invariant,invariant_json,invariant_digest,observed_started_at,observed_completed_at
      FROM page_studio_transfer_recovery_reconciliations WHERE capture_id=$2`,[randomUUID(),captureId])).rejects.toBeDefined()
    expect(await count()).toBe(1)
  })
  it('keeps PG and D1 versions distinct in the immutable identity',async()=>{
    const inventory=await fixture();inventory.recovery.version=7
    const result=await capture({captureId:randomUUID(),inventory},observation)
    expect(result.receipt.invariant.authority).toMatchObject({pgVersion:1,d1Version:7})
  })
  it('allows a new observation only with a new capture identity and leaves prior receipt immutable',async()=>{
    const inventory=await fixture()
    const first=await capture({captureId:randomUUID(),inventory},observation)
    const second=await capture({captureId:randomUUID(),inventory},observation)
    expect(first.historical).toBe(false);expect(second.historical).toBe(false)
    expect(first.receipt.digest).not.toBe(second.receipt.digest)
    expect(await read(first.receipt.invariant.captureId)).toEqual({historical:true,receipt:first.receipt})
    expect(await count()).toBe(2)
  })
  it('denies conflicting exact capture invocation without calling the observer',async()=>{
    const inventory=await fixture(),captureId=randomUUID()
    await capture({captureId,inventory},observation)
    const observe=vi.fn(observation)
    inventory.recovery.version=7
    await expect(capture({captureId,inventory},observe)).rejects.toBeDefined()
    expect(observe).not.toHaveBeenCalled();expect(await count()).toBe(1)
  })
  it('denies fresh capture after deadline expiry but permits visibly historical retrieval',async()=>{
    const inventory=await fixture(false,2000),captureId=randomUUID()
    const first=await capture({captureId,inventory},observation)
    await db.query(`SELECT pg_sleep(GREATEST(0,extract(epoch FROM deadline-clock_timestamp()))+0.01)
      FROM page_studio_transfer_recovery_heads`)
    expect(await read(captureId)).toEqual({historical:true,receipt:first.receipt})
    expect(await capture({captureId,inventory},observation)).toEqual({historical:true,receipt:first.receipt})
    const observe=vi.fn(observation)
    await expect(capture({captureId:randomUUID(),inventory},observe)).rejects.toBeDefined()
    expect(observe).not.toHaveBeenCalled();expect(await count()).toBe(1)
  })
  it('rejects expiry during observation without retaining evidence',async()=>{
    const inventory=await fixture(false,1500)
    await expect(capture({captureId:randomUUID(),inventory},async value=>{
      await db.query(`SELECT pg_sleep(GREATEST(0,extract(epoch FROM deadline-clock_timestamp()))+0.01)
        FROM page_studio_transfer_recovery_heads`)
      return observation(value)
    })).rejects.toBeDefined()
    expect(await count()).toBe(0)
  })
  it('does not manufacture an observation when the trusted observer fails',async()=>{
    const inventory=await fixture()
    await expect(capture({captureId:randomUUID(),inventory},async()=>{throw new Error('fixture observer unavailable')})).rejects.toThrow('fixture observer unavailable')
    expect(await count()).toBe(0)
  })
  it('rejects caller-supplied observation timestamps',async()=>{
    const inventory=await fixture(),observe=vi.fn(observation)
    await expect(capture({captureId:randomUUID(),inventory,observedStartedAt:new Date().toISOString()},observe)).rejects.toBeDefined()
    expect(observe).not.toHaveBeenCalled();expect(await count()).toBe(0)
  })
  it.each(['canonical','digest','schema'])('fails closed on corrupted retained %s evidence',async kind=>{
    const inventory=await fixture(),captureId=randomUUID()
    await capture({captureId,inventory},observation)
    // Deliberate corruption in this disposable schema only. Production writes
    // cannot bypass the append-only trigger through the capture helper.
    await db.query('ALTER TABLE page_studio_transfer_recovery_reconciliations DISABLE TRIGGER page_studio_transfer_reconciliation_guard')
    try {
      if(kind==='canonical')await db.query("UPDATE page_studio_transfer_recovery_reconciliations SET invariant_json=' ' || invariant_json")
      if(kind==='digest')await db.query('UPDATE page_studio_transfer_recovery_reconciliations SET invariant_digest=$1',['f'.repeat(64)])
      if(kind==='schema')await db.query(`UPDATE page_studio_transfer_recovery_reconciliations
        SET invariant=invariant || '{"eligible":true}'::jsonb,invariant_json=(invariant || '{"eligible":true}'::jsonb)::text`)
    } finally { await db.query('ALTER TABLE page_studio_transfer_recovery_reconciliations ENABLE TRIGGER page_studio_transfer_reconciliation_guard') }
    await expect(read(captureId)).rejects.toBeDefined()
    await expect(capture({captureId,inventory},observation)).rejects.toBeDefined()
  })
})
