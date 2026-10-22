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

describe.runIf(Boolean(databaseUrl))('retained transfer controls on PostgreSQL', () => {
  const schema = `transfer_${randomUUID().replaceAll('-', '')}`
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
  describe('bounded expired-plan renewal', () => {
    async function renewalFixture(options: { ai?: number, sites?: number, headMilliseconds?: number } = {}) {
      if (options.ai !== undefined) await db.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=$1 WHERE id=$2', [options.ai, input.entitlementId])
      if (options.sites !== undefined) await db.query('UPDATE page_studio_entitlements SET active_site_limit=$1 WHERE id=$2', [options.sites, input.entitlementId])
      await db.query("UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+interval '2 seconds' WHERE id=$1", [input.entitlementId])
      await approved()
      await control('reserve', 3)
      const retained = (await db.query('SELECT operation_id,intent_digest FROM page_studio_managed_transfer_intents')).rows[0]
      const recoveryId = randomUUID()
      await db.query(`SELECT pg_sleep(GREATEST(0,extract(epoch FROM effective_until-clock_timestamp()))+0.01)
        FROM page_studio_entitlements WHERE id=$1`, [input.entitlementId])
      await db.query(`INSERT INTO page_studio_transfer_recovery_heads
        (operation_id,intent_digest,recovery_id,epoch,mode,cas_version,deadline)
        VALUES($1,$2,$3,1,'reconciling',1,clock_timestamp()+$4*interval '1 millisecond')`,
      [retained.operation_id, retained.intent_digest, recoveryId, options.headMilliseconds ?? 3600000])
      return { requestId: randomUUID(), transferRequestId: requestId, operationId: retained.operation_id,
        intentDigest: retained.intent_digest, recoveryId, epoch: 1, expectedHeadVersion: 1,
        expectedEntitlementId: input.entitlementId, effectiveUntil: new Date(Date.now()+86400_000).toISOString(), reason: 'Bounded expired transfer plan renewal' }
    }
    it('renews exact original terms atomically without authorizing transfer or changing original records', async () => {
      const body = await renewalFixture()
      const { renewCustomerTransferPlan } = await import('~~/server/utils/pageStudio/customerTransferPlanRenewal')
      const previous = (await db.query('SELECT to_jsonb(e) AS value FROM page_studio_entitlements e WHERE id=$1', [input.entitlementId])).rows[0].value
      const original = (await db.query('SELECT to_jsonb(r) AS value FROM page_studio_transfer_requests r')).rows
      const result = await renewCustomerTransferPlan({ operator: input.operator, body }, { runTransaction })
      expect(result.replayed).toBe(false)
      expect((await db.query('SELECT to_jsonb(e) AS value FROM page_studio_entitlements e WHERE id=$1', [input.entitlementId])).rows[0].value).toEqual({ ...previous, status: 'cancelled' })
      expect((await db.query('SELECT entitlement_id FROM page_studio_sites')).rows[0].entitlement_id).toBe(result.entitlement.id)
      expect((await db.query('SELECT to_jsonb(r) AS value FROM page_studio_transfer_requests r')).rows).toEqual(original)
      expect((await db.query('SELECT mode,cas_version FROM page_studio_transfer_recovery_heads')).rows).toEqual([{ mode: 'reconciling', cas_version: 1 }])
    })
    async function renew(body: unknown, run = runTransaction, operator = input.operator) {
      const { renewCustomerTransferPlan } = await import('~~/server/utils/pageStudio/customerTransferPlanRenewal')
      return renewCustomerTransferPlan({ operator, body }, { runTransaction: run })
    }
    async function state() {
      await db.query("SET TIME ZONE 'UTC'")
      return (await db.query(`SELECT jsonb_build_object(
        'plans',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM page_studio_entitlements e),
        'site',(SELECT to_jsonb(s) FROM page_studio_sites s),
        'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM page_studio_audit_events a),
        'request',(SELECT to_jsonb(r) FROM page_studio_transfer_requests r),
        'intent',(SELECT to_jsonb(i) FROM page_studio_managed_transfer_intents i),
        'head',(SELECT to_jsonb(h) FROM page_studio_transfer_recovery_heads h)) AS value`)).rows[0].value
    }
    it('copies every allowance and preserves immutable audit snapshots and historical replay after pointer/head changes', async () => {
      const body = await renewalFixture(), before = await state()
      const first = await renew(body)
      const after = await state()
      const old = before.plans.find((p: { id: string }) => p.id === input.entitlementId)
      const next = after.plans.find((p: { id: string }) => p.id === first.entitlement.id)
      for (const key of Object.keys(old).filter(key => !['id','status','effective_from','effective_until','created_at','updated_at','created_by'].includes(key))) expect(next[key]).toEqual(old[key])
      expect(after.intent).toEqual(before.intent)
      const audit = after.audit.find((a: { action: string }) => a.action === 'customer_transfer_plan_renewed')
      expect(audit.metadata).toMatchObject({ previousEntitlement: old, cancelledEntitlement: { ...old, status: 'cancelled' }, nextEntitlement: next })
      await expect(db.query("UPDATE page_studio_audit_events SET metadata='{}' WHERE action='customer_transfer_plan_renewed'")).rejects.toBeDefined()
      await db.query('UPDATE page_studio_sites SET entitlement_id=$1', [input.entitlementId])
      await db.query("UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=2")
      const moved = await state()
      expect(await renew(body)).toEqual({ ...first, replayed: true })
      expect(await state()).toEqual(moved)
      await expect(renew({ ...body, reason: 'Changed terms for same request' })).rejects.toMatchObject({ statusCode: 409 })
      expect(await state()).toEqual(moved)
    })
    it('does not require or recreate expired owner cookies and does not reopen legacy admission', async () => {
      const body = await renewalFixture()
      await db.query("UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-interval '1 second'")
      const sessions = (await db.query('SELECT * FROM page_studio_customer_sessions')).rows
      await renew(body)
      expect((await db.query('SELECT * FROM page_studio_customer_sessions')).rows).toEqual(sessions)
      const { withManagedTransferIntentAuthority } = await import('~~/server/utils/pageStudio/managedTransferIntent')
      const work = vi.fn()
      await expect(withManagedTransferIntentAuthority({ operationId: body.operationId, intentDigest: body.intentDigest }, work, { runTransaction })).rejects.toBeDefined()
      expect(work).not.toHaveBeenCalled()
    })
    it.each([
      ['operator revoked', "UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()"],
      ['operator expired', "UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval '1 second'"],
      ['operator invalidated', 'UPDATE team_members SET sessions_invalidated_at=clock_timestamp()'],
      ['owner revoked', 'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()'],
      ['owner expired', "UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval '1 second'"],
      ['owner downgraded', "UPDATE page_studio_workspace_memberships SET role='manager'"],
      ['account suspended', "UPDATE page_studio_customer_accounts SET status='suspended'"],
      ['head revoked', "UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=2"],
      ['unexpired predecessor', "UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+interval '1 day' WHERE status='active'"],
      ['unbounded predecessor', "UPDATE page_studio_entitlements SET effective_until=NULL WHERE status='active'"],
      ['changed allowance', "UPDATE page_studio_entitlements SET monthly_ai_operation_limit=1 WHERE status='active'"],
      ['changed source', "UPDATE page_studio_sites SET current_checkpoint_id=NULL"]
    ])('denies %s without effects', async (_name, sql) => {
      const body = await renewalFixture()
      await db.query(sql)
      const before = await state()
      await expect(renew(body)).rejects.toBeDefined()
      expect(await state()).toEqual(before)
    })
    it.each(['epoch','expectedHeadVersion','expectedEntitlementId','recoveryId','transferRequestId','intentDigest','effectiveUntil'])('denies substituted %s without effects', async (field) => {
      const body = await renewalFixture(), before = await state()
      const value = field === 'effectiveUntil' ? new Date(Date.now()+8*86400_000).toISOString()
        : field === 'intentDigest' ? 'f'.repeat(64) : ['epoch','expectedHeadVersion'].includes(field) ? 2 : randomUUID()
      await expect(renew({ ...body, [field]: value })).rejects.toMatchObject({ statusCode: 409 })
      expect(await state()).toEqual(before)
    })
    it('refuses a different genuine platform operator', async () => {
      const body = await renewalFixture(), actor = randomUUID()
      await db.query("INSERT INTO team_members VALUES($1,TRUE,'owner',NULL,NULL)", [actor])
      const before = await state()
      await expect(renew(body, runTransaction, { ...input.operator, actorId: actor })).rejects.toMatchObject({ statusCode: 409 })
      expect(await state()).toEqual(before)
    })
    it.each([{ ai: 1 }, { sites: 2 }])('refuses unsupported original limits even with matching retained digest: %j', async (limits) => {
      const body = await renewalFixture(limits), before = await state()
      await expect(renew(body)).rejects.toMatchObject({ statusCode: 409 })
      expect(await state()).toEqual(before)
    })
    it('checks actual head expiry again after audit work', async () => {
      const body = await renewalFixture({ headMilliseconds: 100 }), before = await state()
      const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
        const result = await tx.query(sql, args)
        if (sql.includes('INSERT INTO page_studio_audit_events')) await tx.query('SELECT pg_sleep(0.15)')
        return result
      } } as pg.Client))
      await expect(renew(body, run)).rejects.toMatchObject({ statusCode: 409 })
      expect(await state()).toEqual(before)
    })
    it('checks expiry after the last source/row reread rather than only before it', async () => {
      const body = await renewalFixture(), before = await state()
      let waited = false
      const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
        const result = await tx.query(sql, args)
        if (sql.includes('FROM page_studio_sites site CROSS JOIN')) {
          waited = true
          await tx.query('SELECT pg_sleep(0.25)')
        }
        return result
      } } as pg.Client))
      await expect(renew({ ...body, effectiveUntil: new Date(Date.now()+200).toISOString() }, run)).rejects.toMatchObject({ statusCode: 409 })
      expect(waited).toBe(true)
      expect(await state()).toEqual(before)
    })
    it('requires current operator authority even for historical replay', async () => {
      const body = await renewalFixture()
      await renew(body)
      await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      const before = await state()
      await expect(renew(body)).rejects.toMatchObject({ statusCode: 403 })
      expect(await state()).toEqual(before)
    })
    it('rejects historical replay when its current login expires during the last owner query', async () => {
      const body = await renewalFixture()
      await renew(body)
      await db.query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+interval '200 milliseconds'")
      const before = await state()
      let ownerReads = 0
      const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
        const result = await tx.query(sql, args)
        if (sql.includes('FOR SHARE OF account,identity,membership,workspace,owner,receipt') && ++ownerReads === 2) {
          await tx.query('SELECT pg_sleep(0.25)')
        }
        return result
      } } as pg.Client))
      await expect(renew(body, run)).rejects.toMatchObject({ statusCode: 403 })
      expect(ownerReads).toBe(2)
      expect(await state()).toEqual(before)
    })
    it('allows only one competing renewal and never two active entitlements', async () => {
      const body = await renewalFixture()
      const results = await Promise.allSettled([renew(body), renew({ ...body, requestId: randomUUID() })])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      expect((await db.query("SELECT id FROM page_studio_entitlements WHERE status='active'")).rows).toHaveLength(1)
      expect((await db.query("SELECT id FROM page_studio_audit_events WHERE action='customer_transfer_plan_renewed'")).rows).toHaveLength(1)
    })
    it('denies changing owner/operator locks without waiting or creating effects', async () => {
      const body = await renewalFixture(), before = await state()
      for (const table of ['page_studio_login_sessions','page_studio_workspace_memberships','page_studio_sites','page_studio_transfer_recovery_heads']) {
        await db.query('BEGIN')
        try {
          await db.query(`SELECT * FROM ${table} FOR UPDATE`)
          await expect(renew(body)).rejects.toMatchObject({ statusCode: 503 })
        } finally { await db.query('ROLLBACK') }
        expect(await state()).toEqual(before)
      }
    })
    it.each(['audit failure','operator expiry','membership expiry','new plan expiry','pointer change','source change','new allowance'])('rolls back atomically on final %s', async (kind) => {
      const body = await renewalFixture(), before = await state()
      const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
        const result = await tx.query(sql, args)
        if (sql.includes('INSERT INTO page_studio_audit_events')) {
          if (kind === 'audit failure') throw new Error('Injected audit failure')
          if (kind === 'operator expiry') await tx.query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval '1 second'")
          if (kind === 'membership expiry') await tx.query("UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval '1 second'")
          if (kind === 'new plan expiry') await tx.query('SELECT pg_sleep(0.1)')
          if (kind === 'pointer change') await tx.query('UPDATE page_studio_sites SET entitlement_id=$1', [input.entitlementId])
          if (kind === 'source change') await tx.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
          if (kind === 'new allowance') await tx.query("UPDATE page_studio_entitlements SET monthly_ai_operation_limit=1 WHERE status='active'")
        }
        return result
      } } as pg.Client))
      // A short new plan expires during the final audit await; the immutable
      // head deadline itself cannot be edited in this foundation.
      const request = kind === 'new plan expiry' ? { ...body, effectiveUntil: new Date(Date.now()+75).toISOString() } : body
      await expect(renew(request, run)).rejects.toBeDefined()
      expect(await state()).toEqual(before)
    })
  })
  describe('initial recovery gate controls', () => {
    async function opening() {
      await approved()
      await control('reserve', 3)
      return { action: 'open' as const, expectedRevision: 5, recoveryId: randomUUID(), expectedHeadVersion: null,
        deadline: new Date(Date.now()+3600000).toISOString() }
    }
    async function gate(body: unknown, run = runTransaction, operator = input.operator) {
      const { changeCustomerTransferRecovery } = await import('~~/server/utils/pageStudio/customerTransferRecovery')
      return changeCustomerTransferRecovery({ siteId: input.siteId, requestId, operator, body }, { runTransaction: run })
    }
    async function status() {
      const { readCustomerTransferRecovery } = await import('~~/server/utils/pageStudio/customerTransferRecovery')
      return readCustomerTransferRecovery({ siteId: input.siteId, requestId, operator: input.operator, query: { expectedRevision: 5 } }, { runTransaction })
    }
    it('opens only an initial denial gate and returns safe status, then revokes without deletion', async () => {
      const body = await opening()
      expect(await status()).toMatchObject({ recovery: null, allowedActions: ['open'] })
      const opened = await gate(body)
      expect(opened).toMatchObject({ siteId: input.siteId, requestId, revision: 5,
        recovery: { recoveryId: body.recoveryId, epoch: 1, version: 1, state: 'reconciling', expired: false }, allowedActions: ['revoke'] })
      expect(await gate(body)).toEqual(opened)
      const revoked = await gate({ action: 'revoke', expectedRevision: 5, recoveryId: body.recoveryId, expectedHeadVersion: 1 })
      expect(revoked).toMatchObject({ recovery: { version: 2, state: 'revoked' }, allowedActions: [] })
      expect(await gate({ action: 'revoke', expectedRevision: 5, recoveryId: body.recoveryId, expectedHeadVersion: 1 })).toEqual(revoked)
      expect(await gate(body)).toEqual(revoked)
      expect((await db.query('SELECT mode FROM page_studio_transfer_recovery_events ORDER BY cas_version')).rows).toEqual([{ mode: 'reconciling' }, { mode: 'revoked' }])
      const text = JSON.stringify(revoked)
      for (const forbidden of ['intentDigest','operationId','session','operatorId','owner','sourceDigest']) expect(text).not.toContain(forbidden)
    })
    it('permits fresh original operator inspection after original sessions and plan expire, without editing them', async () => {
      await db.query("UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+interval '1 second' WHERE id=$1", [input.entitlementId])
      const body = await opening()
      await db.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM effective_until-clock_timestamp()))+0.01) FROM page_studio_entitlements WHERE id=$1", [input.entitlementId])
      await db.query("UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-interval '1 second'")
      await db.query("UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()")
      const fresh = 'e'.repeat(64)
      await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
        VALUES('agency',$1,$2,clock_timestamp(),clock_timestamp()+interval '1 hour')`, [fresh, actorId])
      const old = (await db.query('SELECT * FROM page_studio_transfer_requests')).rows
      expect(await gate(body, runTransaction, { actorId, loginSessionHash: fresh })).toMatchObject({ recovery: { state: 'reconciling' } })
      expect((await db.query('SELECT * FROM page_studio_transfer_requests')).rows).toEqual(old)
    })
    it.each(['source','owner','archived site','deadline','revision','head version','completed table'])('denies invalid new closure: %s', async (kind) => {
      const body = await opening()
      if (kind === 'source') await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
      if (kind === 'owner') await db.query("UPDATE page_studio_customer_accounts SET status='suspended'")
      if (kind === 'archived site') await db.query("UPDATE page_studio_sites SET status='archived'")
      if (kind === 'completed table') await db.query('ALTER TABLE page_studio_managed_transfer_completions RENAME TO unavailable_completions')
      try {
        const changed = kind === 'deadline' ? { ...body, deadline: new Date(Date.now()+25*3600000).toISOString() }
          : kind === 'revision' ? { ...body, expectedRevision: 4 } : kind === 'head version' ? { ...body, expectedHeadVersion: 1 } : body
        await expect(gate(changed)).rejects.toBeDefined()
        expect((await db.query('SELECT * FROM page_studio_transfer_recovery_heads')).rows).toEqual([])
      } finally {
        if (kind === 'completed table') await db.query('ALTER TABLE unavailable_completions RENAME TO page_studio_managed_transfer_completions')
      }
    })
    it('blocks initial close for a retained completion marker and still permits bounded status', async () => {
      const body = await opening()
      const intent = (await db.query('SELECT operation_id,intent_digest FROM page_studio_managed_transfer_intents')).rows[0]
      const hash = 'f'.repeat(64), a = randomUUID(), b = randomUUID(), audit = randomUUID()
      const receipt = { formatVersion: 1, operationId: intent.operation_id, intentDigest: intent.intent_digest,
        copyProofDigest: hash, historyReceiptDigest: hash, digest: hash, auditId: audit,
        source: { generation: a, scope: { environment: 'staging' } }, destination: { generation: b, scope: { environment: 'production' } } }
      // Negative marker fixture only: real completion table/CHECK constraints,
      // with prerequisite FKs disabled locally. This does not claim a completed transfer.
      await db.query('ALTER TABLE page_studio_managed_transfer_completions DISABLE TRIGGER ALL')
      try {
        await db.query(`INSERT INTO page_studio_managed_transfer_completions(operation_id,intent_digest,source_scope_key,source_generation,
          destination_scope_key,destination_generation,copy_proof_digest,history_receipt_digest,receipt,receipt_json,receipt_digest,audit_id)
          VALUES($1,$2,'source',$3,'destination',$4,$5,$5,$6::jsonb,$6,$5,$7)`,
        [intent.operation_id, intent.intent_digest, a, b, hash, JSON.stringify(receipt), audit])
      } finally { await db.query('ALTER TABLE page_studio_managed_transfer_completions ENABLE TRIGGER ALL') }
      await expect(gate(body)).rejects.toMatchObject({ statusCode: 409 })
      expect(await status()).toMatchObject({ recovery: null, allowedActions: [] })
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_heads')).rows).toEqual([])
    })
    it('allows inspection/revocation after head expiry and source/owner revocation without reopening', async () => {
      const body = await opening()
      const short = { ...body, deadline: new Date(Date.now()+100).toISOString() }
      await gate(short)
      await db.query('SELECT pg_sleep(0.15)')
      await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
      await db.query("UPDATE page_studio_customer_accounts SET status='suspended'")
      expect(await status()).toMatchObject({ recovery: { state: 'reconciling', expired: true }, allowedActions: ['revoke'] })
      expect(await gate({ action: 'revoke', expectedRevision: 5, recoveryId: body.recoveryId, expectedHeadVersion: 1 })).toMatchObject({ recovery: { state: 'revoked', expired: true } })
      expect(await gate(short)).toMatchObject({ recovery: { state: 'revoked', expired: true }, allowedActions: [] })
      await expect(gate({ ...body, recoveryId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
      await expect(gate({ ...body, deadline: new Date(Date.now()+7200000).toISOString() })).rejects.toMatchObject({ statusCode: 409 })
    })
    it('retains exactly one initial head under competing closes and rejects stale revocation', async () => {
      const body = await opening()
      const results = await Promise.allSettled([gate(body), gate({ ...body, recoveryId: randomUUID() })])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      const head = (await db.query('SELECT recovery_id FROM page_studio_transfer_recovery_heads')).rows[0]
      await expect(gate({ action: 'revoke', expectedRevision: 5, recoveryId: head.recovery_id, expectedHeadVersion: 2 })).rejects.toMatchObject({ statusCode: 409 })
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_events')).rows).toHaveLength(1)
    })
    it.each(['operator','site','request'])('denies concurrent %s changes without waiting', async (kind) => {
      const body = await opening()
      await db.query('BEGIN')
      try {
        await db.query(`SELECT * FROM ${kind === 'operator' ? 'page_studio_login_sessions' : kind === 'site' ? 'page_studio_sites' : 'page_studio_transfer_requests'} FOR UPDATE`)
        await expect(gate(body)).rejects.toMatchObject({ statusCode: 503 })
      } finally { await db.query('ROLLBACK') }
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_heads')).rows).toEqual([])
    })
    it.each(['source','owner','operator','deadline','failed acknowledgement'])('rolls back close on final %s change', async (kind) => {
      const body = await opening()
      let inserted = false
      const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
        const result = await tx.query(sql, args)
        if (sql.includes('INSERT INTO page_studio_transfer_recovery_heads')) {
          inserted = true
          if (kind === 'source') await tx.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
          if (kind === 'owner') await tx.query("UPDATE page_studio_customer_accounts SET status='suspended'")
          if (kind === 'operator') await tx.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
          if (kind === 'deadline') await tx.query('SELECT pg_sleep(0.2)')
          if (kind === 'failed acknowledgement') throw new Error('Injected transaction interruption')
        }
        return result
      } } as pg.Client))
      await expect(gate(kind === 'deadline' ? { ...body, deadline: new Date(Date.now()+150).toISOString() } : body, run)).rejects.toBeDefined()
      expect(inserted).toBe(true)
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_heads')).rows).toEqual([])
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_events')).rows).toEqual([])
    })
    it('recovers a lost committed acknowledgement by exact readback without a second transition', async () => {
      const body = await opening()
      const loseAck: typeof runTransaction = async work => {
        await runTransaction(work)
        throw new Error('Lost committed acknowledgement')
      }
      await expect(gate(body, loseAck)).rejects.toThrow('Lost committed acknowledgement')
      expect(await gate(body)).toMatchObject({ recovery: { version: 1, state: 'reconciling' } })
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_events')).rows).toHaveLength(1)
    })
    it.each(['open','status','revoke'])('checks current operator time after the last awaited login read for %s', async (action) => {
      const body = await opening()
      if (action === 'revoke') await gate(body)
      const before = (await db.query('SELECT * FROM page_studio_transfer_recovery_heads')).rows
      await db.query("UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+interval '200 milliseconds'")
      let reads = 0
      const run: typeof runTransaction = work => runTransaction(tx => work({ query: async (sql: string, args?: unknown[]) => {
        const result = await tx.query(sql, args)
        if (sql.includes('FOR SHARE OF login,staff') && ++reads === 2) await tx.query('SELECT pg_sleep(0.25)')
        return result
      } } as pg.Client))
      if (action === 'status') {
        const { readCustomerTransferRecovery } = await import('~~/server/utils/pageStudio/customerTransferRecovery')
        await expect(readCustomerTransferRecovery({ siteId: input.siteId, requestId, operator: input.operator,
          query: { expectedRevision: 5 } }, { runTransaction: run })).rejects.toMatchObject({ statusCode: 403 })
      } else await expect(gate(action === 'open' ? body : { action: 'revoke', expectedRevision: 5,
        recoveryId: body.recoveryId, expectedHeadVersion: 1 }, run)).rejects.toMatchObject({ statusCode: 403 })
      expect(reads).toBe(2)
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_heads')).rows).toEqual(before)
    })
    it('denies a different operator and original operator logout on every action', async () => {
      const body = await opening()
      await expect(gate(body, runTransaction, { ...input.operator, actorId: randomUUID() })).rejects.toMatchObject({ statusCode: 403 })
      await gate(body)
      await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      await expect(status()).rejects.toMatchObject({ statusCode: 403 })
      await expect(gate({ action: 'revoke', expectedRevision: 5, recoveryId: body.recoveryId, expectedHeadVersion: 1 })).rejects.toMatchObject({ statusCode: 403 })
    })
  })
  it('retains owner consent, source review, approval and a single reservation with opaque public views', async () => {
    const first = await control('request')
    expect(first).toMatchObject({ requestId, siteId: input.siteId, revision: 1, state: 'requested', allowedActions: ['revoke'] })
    expect(await control('request')).toEqual(first)
    expect(await control('review', 1)).toMatchObject({ revision: 2, state: 'reviewed', review: { checkpointId: 'checkpoint_a', objectCount: 3 } })
    expect(await control('approve', 2)).toMatchObject({ revision: 3, state: 'approved' })
    const reserved = await control('reserve', 3)
    expect(reserved).toMatchObject({ revision: 5, state: 'reserved' })
    expect((await db.query('SELECT * FROM page_studio_managed_transfer_intents')).rows).toHaveLength(1)
    const text = JSON.stringify(reserved)
    for (const secret of [input.ownerLoginSessionHash, operatorHash, 'sourceDigest', 'operationId', 'intentDigest', 'object_key']) expect(text).not.toContain(secret)
  })
  it('rejects competing request identities and stale CAS replay', async () => {
    await control('request')
    await expect(control('request', undefined, { requestId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
    await control('review', 1)
    await expect(control('review', 1)).rejects.toMatchObject({ statusCode: 409 })
    await expect(control('approve', 1)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('allows withdrawal before reservation and an explicit new request only afterwards', async () => {
    await approved()
    expect(await control('revoke', 3)).toMatchObject({ state: 'revoked', revision: 4 })
    await expect(control('reserve', 4)).rejects.toMatchObject({ statusCode: 409 })
    requestId = randomUUID()
    expect(await control('request')).toMatchObject({ requestId, state: 'requested' })
  })
  it('never cancels or replaces a reserved request', async () => {
    await approved()
    await control('reserve', 3)
    await expect(control('revoke', 5)).rejects.toMatchObject({ statusCode: 409 })
    await expect(control('request', undefined, { requestId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('permits current-account inspection but never replaces original owner consent', async () => {
    await control('request')
    await control('review', 1)
    const fresh = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_customer_sessions(token_hash,account_id,expires_at)
      SELECT $1,account_id,expires_at FROM page_studio_customer_sessions`, [fresh])
    expect(await control('owner-status', undefined, { ownerLoginSessionHash: fresh })).toMatchObject({ requestId, allowedActions: [] })
    await expect(control('approve', 2, { ownerLoginSessionHash: fresh })).rejects.toMatchObject({ statusCode: 403 })
    await expect(control('owner-status', undefined, { ownerLoginSessionHash: '0'.repeat(64) })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('pins the genuine operator login and refuses replacement sessions', async () => {
    await approved()
    const fresh = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      SELECT role,$1,user_id,issued_at,expires_at FROM page_studio_login_sessions`, [fresh])
    await expect(control('reserve', 3, { operator: { actorId, loginSessionHash: fresh } })).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    'DELETE FROM page_studio_cms_record_heads',
    'UPDATE page_studio_entitlements SET storage_bytes_limit=storage_bytes_limit+1 WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET updated_at=updated_at+interval \'1 second\' WHERE status=\'active\''
  ])('requires a complete fresh reviewed source before owner approval: %s', async (sql) => {
    await control('request')
    await control('review', 1)
    await db.query(sql)
    await expect(control('approve', 2)).rejects.toMatchObject({ statusCode: 409 })
  })
  it.each([
    'UPDATE page_studio_workspace_memberships SET role=\'editor\'',
    'UPDATE page_studio_entitlements SET plan_metadata=\'{}\' WHERE status=\'active\'',
    'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-interval \'1 second\''
  ])('denies invalid native request authority: %s', async (sql) => {
    await db.query(sql)
    await expect(control('request')).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    'UPDATE team_members SET user_role=\'member\'',
    'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval \'1 second\''
  ])('denies invalid original operator authority: %s', async (sql) => {
    await control('request')
    await db.query(sql)
    await expect(control('review', 1)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('recovers saved intent after lost reservation acknowledgement even when source has changed', async () => {
    await approved()
    let lost = false
    const loseAck = async <T>(work: (client: pg.Client) => Promise<T>) => {
      const value = await runTransaction(work)
      if (!lost && (await db.query('SELECT 1 FROM page_studio_managed_transfer_intents')).rowCount) {
        lost = true
        throw new Error('lost acknowledgement')
      }
      return value
    }
    await expect(control('reserve', 3, {}, loseAck)).rejects.toThrow('lost acknowledgement')
    const saved = (await db.query('SELECT operation_id FROM page_studio_managed_transfer_intents')).rows[0]
    await db.query('DELETE FROM page_studio_cms_record_heads')
    expect(await control('reserve', 4)).toMatchObject({ state: 'reserved' })
    expect((await db.query('SELECT operation_id FROM page_studio_managed_transfer_intents')).rows).toEqual([saved])
  })
  it('reports original session expiry after reservation as needs-attention without admitting replacement', async () => {
    await approved()
    await control('reserve', 3)
    await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    expect(await control('owner-status')).toMatchObject({ state: 'needs-attention', allowedActions: [] })
  })
  it('reapplying the additive migration preserves request history and source selection', async () => {
    await approved()
    const before = (await db.query('SELECT * FROM page_studio_transfer_requests')).rows
    const sites = (await db.query('SELECT * FROM page_studio_sites')).rows
    await db.query(readFileSync('server/database/migrations/472_page_studio_transfer_requests.sql', 'utf8'))
    expect((await db.query('SELECT * FROM page_studio_transfer_requests')).rows).toEqual(before)
    expect((await db.query('SELECT * FROM page_studio_sites')).rows).toEqual(sites)
  })
  it('rejects a source changed after approval before entering reserving', async () => {
    await approved()
    await db.query('DELETE FROM page_studio_cms_record_heads')
    await expect(control('reserve', 3)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT state FROM page_studio_transfer_requests')).rows).toEqual([{ state: 'approved' }])
  })
  it('cannot rereview by silently extending an original operator login', async () => {
    await control('request')
    await control('review', 1)
    await db.query('UPDATE page_studio_login_sessions SET expires_at=expires_at+interval \'1 hour\'')
    await expect(control('review', 2)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('recovers reserving metadata from its existing operation without capturing changed source again', async () => {
    await approved()
    let calls = 0
    const stopAfterClaim = async <T>(work: (client: pg.Client) => Promise<T>) => {
      calls++
      if (calls === 3) throw new Error('call interrupted')
      return runTransaction(work)
    }
    await expect(control('reserve', 3, {}, stopAfterClaim)).rejects.toThrow('call interrupted')
    const row = (await db.query('SELECT * FROM page_studio_transfer_requests')).rows[0]
    expect(row).toMatchObject({ state: 'reserving', revision: 4 })
    await expect(control('revoke', 4)).rejects.toMatchObject({ statusCode: 409 })
    const { reserveManagedTransferIntent } = await import('~~/server/utils/pageStudio/managedTransferIntent')
    const receipt = await reserveManagedTransferIntent({ operationId: row.operation_id, authority: input, expectedSourceDigest: row.source_digest }, { runTransaction })
    await db.query('DELETE FROM page_studio_cms_record_heads')
    expect(await control('reserve', 4)).toMatchObject({ state: 'reserved', revision: 5 })
    expect((await db.query('SELECT operation_id,intent_digest FROM page_studio_managed_transfer_intents')).rows).toEqual([
      { operation_id: receipt.operationId, intent_digest: receipt.intentDigest }
    ])
  })
  it('allows exactly one of competing owner cancel and operator reserve', async () => {
    await approved()
    const results = await Promise.allSettled([control('revoke', 3), control('reserve', 3)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const row = (await db.query('SELECT state FROM page_studio_transfer_requests')).rows[0]
    expect(['revoked', 'reserved']).toContain(row.state)
    expect((await db.query('SELECT 1 FROM page_studio_managed_transfer_intents')).rows).toHaveLength(row.state === 'reserved' ? 1 : 0)
  })
  it('denies concurrent request modification while approving and preserves unapproved state', async () => {
    await control('request')
    await control('review', 1)
    await db.query('BEGIN')
    try {
      await db.query('SELECT * FROM page_studio_transfer_requests FOR UPDATE')
      await expect(control('approve', 2)).rejects.toMatchObject({ statusCode: 503 })
    } finally { await db.query('ROLLBACK') }
    expect((await db.query('SELECT state FROM page_studio_transfer_requests')).rows).toEqual([{ state: 'reviewed' }])
  })
  it('permits explicit restart after original owner logout without replacing retained old credentials', async () => {
    await control('request')
    const fresh = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_customer_sessions(token_hash,account_id,expires_at)
      SELECT $1,account_id,expires_at FROM page_studio_customer_sessions`, [fresh])
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [input.ownerLoginSessionHash])
    const next = randomUUID()
    expect(await control('request', undefined, { requestId: next, ownerLoginSessionHash: fresh })).toMatchObject({ requestId: next, state: 'requested' })
    expect((await db.query('SELECT owner_login_session_hash,state FROM page_studio_transfer_requests WHERE request_id=$1', [requestId])).rows)
      .toEqual([{ owner_login_session_hash: input.ownerLoginSessionHash, state: 'revoked' }])
  })
  it('allows genuine current operator status/list but withholds pinned mutation actions from replacement login', async () => {
    await approved()
    const fresh = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      SELECT role,$1,user_id,issued_at,expires_at FROM page_studio_login_sessions`, [fresh])
    expect(await control('operator-status', undefined, { operator: { actorId, loginSessionHash: fresh } })).toMatchObject({ state: 'approved', allowedActions: [] })
    const { executeTransferControls } = await import('~~/workers/page-studio-management/src/transferControls')
    const list = await executeTransferControls({ action: 'operator-list', expectedEnvironment: 'production', operator: { actorId, loginSessionHash: fresh } }, { runTransaction })
    expect(list).toMatchObject({ requests: [{ requestId, allowedActions: [] }], nextCursor: null })
  })
  it('runs worker engine calls in their injected database invocation', async () => {
    const { handleTransferControls } = await import('~~/workers/page-studio-management/src/transferControls')
    expect(await handleTransferControls({ action: 'request', expectedEnvironment: 'production', siteId: input.siteId,
      requestId, ownerLoginSessionHash: input.ownerLoginSessionHash }, {
      PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production'
    }, runTransaction)).toMatchObject({ ok: true, value: { requestId, state: 'requested' } })
  })
  it('binds phase calls to the original operator and releases SQL locks before calling a remote phase', async () => {
    await approved()
    await control('reserve', 3)
    const { withReservedTransferControl } = await import('~~/workers/page-studio-management/src/transferControls')
    const phaseInput = { siteId: input.siteId, requestId, expectedRevision: 5, operator: input.operator }
    let calls = 0
    expect(await withReservedTransferControl(phaseInput, async (reference) => {
      calls++
      await db.query('BEGIN')
      try {
        await db.query('SELECT * FROM page_studio_transfer_requests FOR UPDATE NOWAIT')
      } finally {
        await db.query('ROLLBACK')
      }
      expect(reference).toMatchObject({ operationId: expect.any(String), intentDigest: expect.any(String) })
      return 'phase result'
    }, { runTransaction })).toBe('phase result')
    await expect(withReservedTransferControl({ ...phaseInput, operator: { actorId, loginSessionHash: '0'.repeat(64) } }, async () => {
      calls++
    }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(calls).toBe(1)
    await expect(withReservedTransferControl(phaseInput, async () => {
      await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('preserves original request identity and expiry at the SQL boundary', async () => {
    await approved()
    for (const mutation of [
      'operation_id=\'11111111-1111-4111-8111-111111111111\'',
      'owner_login_session_hash=repeat(\'f\',64)',
      'expires_at=expires_at+interval \'1 hour\'',
      'operator_login_session_hash=repeat(\'f\',64)'
    ]) await expect(db.query(`UPDATE page_studio_transfer_requests SET ${mutation},revision=revision+1`)).rejects.toThrow(/retained|immutable|expiry/i)
    await expect(db.query('DELETE FROM page_studio_transfer_requests')).rejects.toThrow(/retained|immutable/i)
    await control('reserve', 3)
    await expect(db.query('UPDATE page_studio_transfer_requests SET state=\'revoked\',revoked_at=clock_timestamp(),revision=revision+1')).rejects.toThrow(/retained|immutable/i)
  })

  it('stops with needs-attention when source changes after the durable claim but before an intent is saved', async () => {
    await approved()
    let calls = 0
    const changeAfterClaim = async <T>(work: (client: pg.Client) => Promise<T>) => {
      calls++
      const value = await runTransaction(work)
      if (calls === 2) await db.query('DELETE FROM page_studio_cms_record_heads')
      return value
    }
    await expect(control('reserve', 3, {}, changeAfterClaim)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.query('SELECT 1 FROM page_studio_managed_transfer_intents')).rows).toHaveLength(0)
    expect(await control('owner-status')).toMatchObject({ state: 'needs-attention', allowedActions: [] })
    expect(await control('operator-status')).toMatchObject({ state: 'needs-attention', allowedActions: [] })
    await expect(control('request', undefined, { requestId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('does not let a genuine foreign native account use a request UUID as a capability', async () => {
    await control('request')
    await control('review', 1)
    const signup = await import('~~/server/utils/pageStudio/customerSignup')
    const signIn = await signup.requestCustomerSignIn({ email: 'foreign-transfer-owner@example.test', name: 'Foreign owner', mode: 'signup', acceptedTerms: true }, 'preview-v1', runTransaction)
    const login = await signup.verifyCustomerSignIn(signIn!.token, runTransaction)
    const { digestPortalSessionToken } = await import('~~/server/utils/portalSession')
    const ownerLoginSessionHash = await digestPortalSessionToken(login.sessionToken)
    for (const action of ['request', 'owner-status', 'approve', 'revoke']) {
      await expect(control(action, ['approve', 'revoke'].includes(action) ? 2 : undefined, { ownerLoginSessionHash })).rejects.toMatchObject({ statusCode: 403 })
    }
    expect((await db.query('SELECT state FROM page_studio_transfer_requests')).rows).toEqual([{ state: 'reviewed' }])
  })
  it('reuses system-role operator admission for current reads and retained mutations', async () => {
    const roleId = randomUUID()
    await db.query('INSERT INTO custom_roles(id,slug,is_system) VALUES($1,\'owner\',TRUE)', [roleId])
    await db.query('UPDATE team_members SET custom_role_id=$1 WHERE id=$2', [roleId, actorId])
    await approved()
    expect(await control('operator-status')).toMatchObject({ state: 'approved', allowedActions: ['reserve'] })
    await db.query('UPDATE custom_roles SET is_system=FALSE WHERE id=$1', [roleId])
    await expect(control('operator-status')).rejects.toMatchObject({ statusCode: 403 })
    await expect(control('reserve', 3)).rejects.toMatchObject({ statusCode: 403 })
  })
})
