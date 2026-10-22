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

describe.runIf(Boolean(databaseUrl))('complete recovery inventory authority on PostgreSQL', () => {
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

  async function fixture(expiringPlan = false) {
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
    const recoveryId = randomUUID(), deadline = new Date(Date.now()+3600000).toISOString()
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
  async function inspect(value: unknown, run = runTransaction) {
    const { authorizeCustomerTransferRecoveryInventory } = await import('~~/server/utils/pageStudio/customerTransferRecoveryInventory')
    return authorizeCustomerTransferRecoveryInventory(value, { runTransaction: run })
  }
  it('acknowledges exact complete PG prerequisites without claiming physical eligibility', async () => {
    const value = await fixture()
    expect(await inspect(value)).toEqual({ purpose: 'inventory', envelopeDigest: await collectionDigest(value) })
  })

  it('accepts expired original terms only as historical provenance with a fresh original operator', async () => {
    const value = await fixture(true)
    await db.query(`SELECT pg_sleep(GREATEST(0,extract(epoch FROM effective_until-clock_timestamp()))+0.01)
      FROM page_studio_entitlements WHERE id=$1`, [input.entitlementId])
    await db.query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval '1 second'")
    const fresh = 'f'.repeat(64)
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,clock_timestamp(),clock_timestamp()+interval '1 hour')`, [fresh, actorId])
    value.inspection.loginSessionHash = fresh
    expect(await inspect(value)).toEqual({ purpose: 'inventory', envelopeDigest: await collectionDigest(value) })
  })
  it.each(['resources','resource_bindings','destination_catalogues','catalogue_verifications'])('requires complete retained %s provenance', async (table) => {
    const value = await fixture(), name = `page_studio_managed_transfer_${table}`
    await db.query(`ALTER TABLE ${name} RENAME TO unavailable_inventory_store`)
    try { await expect(inspect(value)).rejects.toBeDefined() } finally {
      await db.query(`ALTER TABLE unavailable_inventory_store RENAME TO ${name}`)
    }
  })
  const laterTables = ['executions','source_drafts','destination_executions','destination_execution_verifications',
    'copy_graph_requests','copy_graph_verifications','forms_history_requests','forms_history_verifications','completions']
  async function laterSource(value: Awaited<ReturnType<typeof fixture>>, client = db) {
    const { operationId, intentDigest } = value.request, accountId = 'a'.repeat(32), scriptName = `ps-content-${'9'.repeat(32)}`
    // Retained source admission is itself unsupported, before any upload.
    // Real migration460 CHECKs/FKs; no provider or D1 effects are fabricated.
    const request = { formatVersion: 1, operationId, intentDigest, sourceScope: { environment: 'staging' },
      predecessor: { accountId }, successor: { accountId, namespace: 'xeroflow-page-studio-dispatch-staging', scriptName } }
    await client.query(`INSERT INTO page_studio_managed_transfer_executions(operation_id,intent_digest,request,request_digest,account_id,namespace,script_name)
      VALUES($1,$2,$3,$4,$5,'xeroflow-page-studio-dispatch-staging',$6)`,
    [operationId,intentDigest,request,await collectionDigest(request),accountId,scriptName])
  }
  it('denies a real retained source admission even without any execution upload', async () => {
    const value = await fixture()
    await laterSource(value)
    await expect(inspect(value)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(laterTables)('requires the real %s store instead of treating missing data as absence', async (table) => {
    const value = await fixture(), name = `page_studio_managed_transfer_${table}`
    await db.query(`ALTER TABLE ${name} RENAME TO unavailable_inventory_store`)
    try { await expect(inspect(value)).rejects.toBeDefined() } finally {
      await db.query(`ALTER TABLE unavailable_inventory_store RENAME TO ${name}`)
    }
  })
  it.each(['sourceExecution','sourceDrafts','destinationExecution','destinationVerification','copyRequest',
    'copyVerification','formsHistoryRequest','formsHistoryVerification','completion'])('denies positive later-phase inventory %s', async (phase) => {
    const value = await fixture()
    const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
      const result = await tx.query(sql, args)
      return sql.includes("SELECT 'sourceExecution' AS phase") ? { ...result, rows: [{ phase }] } : result
    } } as pg.Client))
    await expect(inspect(value, run)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['source','scope','target','freeze','checkpoint','objectKey','catalogue','resource','purpose','missing source','null catalogue','extra'])('denies wrong or incomplete provenance: %s', async (kind) => {
    const value = await fixture()
    if (kind === 'source') value.source.scope.siteId = randomUUID()
    if (kind === 'scope') value.source.scope.environment = 'production'
    if (kind === 'target') value.source.target.databaseId = randomUUID()
    if (kind === 'freeze') value.source.freezeDigest = 'b'.repeat(64)
    if (kind === 'checkpoint') value.source.checkpoint.digest = 'b'.repeat(64)
    if (kind === 'objectKey') value.source.checkpoint.objectKey += '_foreign'
    if (kind === 'catalogue') value.catalogueRequest.baseline.worker.etag = 'foreign'
    if (kind === 'resource') value.request.resourceRequest.actor.loginSessionHash = 'b'.repeat(64)
    if (kind === 'purpose') Object.assign(value, { purpose: 'observe' })
    if (kind === 'missing source') Reflect.deleteProperty(value, 'source')
    if (kind === 'null catalogue') Object.assign(value, { catalogueRequest: null })
    if (kind === 'extra') Object.assign(value, { eligible: true })
    await expect(inspect(value)).rejects.toBeDefined()
  })
  it.each(['missing','request','plan','receipt','digest','intent'])('denies unverified or corrupt retained catalogue %s', async (kind) => {
    const value = await fixture()
    await db.query('ALTER TABLE page_studio_managed_transfer_catalogue_verifications DISABLE TRIGGER USER')
    try {
      if (kind === 'missing') await db.query('DELETE FROM page_studio_managed_transfer_catalogue_verifications')
      else {
        const columns: Record<string,string> = { request: 'request_digest', plan: 'plan_digest', digest: 'receipt_digest', intent: 'intent_digest' }
        const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
          const result = await tx.query(sql, args)
          if (sql.includes('SELECT intent_digest,request_digest,plan_digest,receipt,receipt_digest')) {
            if (kind === 'receipt') result.rows[0].receipt = { ...result.rows[0].receipt, baselineDigest: 'b'.repeat(64) }
            else result.rows[0][columns[kind]!] = 'b'.repeat(64)
          }
          return result
        } } as pg.Client))
        await expect(inspect(value, run)).rejects.toMatchObject({ statusCode: 403 })
        return
      }
      await expect(inspect(value)).rejects.toMatchObject({ statusCode: 403 })
    } finally { await db.query('ALTER TABLE page_studio_managed_transfer_catalogue_verifications ENABLE TRIGGER USER') }
  })
  it('rejects newly visible later admission on final inventory reread', async () => {
    const value = await fixture()
    let reads = 0
    const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
      const result = await tx.query(sql, args)
      if (sql.includes("SELECT 'sourceExecution' AS phase") && ++reads === 1) await laterSource(value, tx)
      return result
    } } as pg.Client))
    await expect(inspect(value, run)).rejects.toMatchObject({ statusCode: 403 })
    expect(reads).toBe(2)
    expect((await db.query('SELECT * FROM page_studio_managed_transfer_executions')).rows).toEqual([])
  })
  it.each(['source','operator','owner','head'])('rechecks %s after inventory reads', async (kind) => {
    const value = await fixture()
    let changed = false
    const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
      const result = await tx.query(sql, args)
      if (!changed && sql.includes("SELECT 'sourceExecution' AS phase")) {
        changed = true
        if (kind === 'source') await tx.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
        if (kind === 'operator') await tx.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        if (kind === 'owner') await tx.query("UPDATE page_studio_customer_accounts SET status='suspended'")
        if (kind === 'head') await tx.query("UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=2")
      }
      return result
    } } as pg.Client))
    await expect(inspect(value, run)).rejects.toBeDefined()
    expect(changed).toBe(true)
  })
  it('detaches source and catalogue before any asynchronous work', async () => {
    const value = await fixture(), digest = await collectionDigest(value)
    const run: typeof runTransaction = work => {
      value.source.checkpoint.digest = 'b'.repeat(64)
      value.catalogueRequest.baseline.worker.etag = 'foreign'
      return runTransaction(work)
    }
    expect(await inspect(value, run)).toEqual({ purpose: 'inventory', envelopeDigest: digest })
  })
  it('does not change PG heads, admissions, plans or audit when observing', async () => {
    const value = await fixture()
    const state = async () => (await db.query(`SELECT
      (SELECT jsonb_agg(h) FROM page_studio_transfer_recovery_heads h) AS heads,
      (SELECT jsonb_agg(e) FROM page_studio_transfer_recovery_events e) AS events,
      (SELECT jsonb_agg(p) FROM page_studio_entitlements p) AS plans,
      (SELECT jsonb_agg(a) FROM page_studio_audit_events a) AS audit,
      (SELECT jsonb_agg(r) FROM page_studio_transfer_requests r) AS requests`)).rows
    const before = await state()
    await inspect(value)
    expect(await state()).toEqual(before)
  })
})
