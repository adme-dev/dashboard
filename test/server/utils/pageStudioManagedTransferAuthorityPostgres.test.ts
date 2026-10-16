import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

describe.runIf(Boolean(databaseUrl))('native managed transfer authority on PostgreSQL', () => {
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
  async function transfer(changes = {}, work = async (_tx: pg.Client, authority: unknown) => authority) {
    const { withManagedTransferAuthority } = await import('~~/server/utils/pageStudio/managedTransferAuthority')
    return withManagedTransferAuthority({ ...input, ...changes }, work, { runTransaction })
  }
  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT);
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

  it('derives the exact native owner, publishing plan and separate environments without changing selection', async () => {
    const authority = await transfer()
    expect(authority).toMatchObject({ owner: { identityId: expected.identityId, accountId: expected.accountId, workspaceId: expected.workspaceId },
      operatorId: actorId, entitlementId: input.entitlementId,
      source: { tenantId: expected.tenantId, clientId: expected.businessId, businessId: expected.businessId, siteId: input.siteId, environment: 'staging' },
      destination: { tenantId: expected.tenantId, clientId: expected.businessId, businessId: expected.businessId, siteId: input.siteId, environment: 'production' } })
    expect(JSON.stringify(authority)).not.toContain(input.ownerLoginSessionHash)
    expect(JSON.stringify(authority)).not.toContain(operatorHash)
    expect((await db.query('SELECT status,entitlement_id FROM page_studio_sites')).rows).toEqual([{ status: 'draft', entitlement_id: input.entitlementId }])
  })
  it.each([
    'UPDATE team_members SET is_active=FALSE',
    'UPDATE team_members SET user_role=\'member\'',
    `UPDATE team_members SET custom_role_id='${randomUUID()}'`,
    'UPDATE team_members SET sessions_invalidated_at=clock_timestamp()',
    'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval \'1 second\'',
    'UPDATE page_studio_login_sessions SET issued_at=clock_timestamp()+interval \'1 minute\'',
    `UPDATE page_studio_login_sessions SET user_id='${randomUUID()}'`,
    'UPDATE page_studio_login_sessions SET role=\'client\'',
    'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-interval \'1 second\'',
    'UPDATE page_studio_customer_accounts SET status=\'suspended\'',
    'UPDATE page_studio_customer_identities SET verified_at=NULL',
    'UPDATE page_studio_customer_identities SET status=\'suspended\'',
    'UPDATE page_studio_customer_workspaces SET status=\'suspended\'',
    'UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_workspace_memberships SET role=\'manager\'',
    'UPDATE page_studio_workspace_memberships SET expires_at=clock_timestamp()-interval \'1 second\'',
    'UPDATE page_studio_sites SET status=\'archived\'',
    'UPDATE page_studio_entitlements SET status=\'cancelled\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval \'1 second\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET effective_from=clock_timestamp()+interval \'1 hour\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_key=\'customer_preview_v1\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET active_site_limit=0 WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=\'{}\' WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=jsonb_set(plan_metadata,\'{managedBy}\',\'"customer"\') WHERE status=\'active\'',
    'UPDATE page_studio_entitlements SET plan_metadata=jsonb_set(plan_metadata,\'{allowedModules}\',\'[]\') WHERE status=\'active\''
  ])('refuses withdrawn authority before committing transfer work: %s', async (sql) => {
    await db.query(sql)
    await expect(transfer({}, async (tx) => {
      await tx.query('INSERT INTO transfer_effects VALUES(\'invalid\')')
    })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT * FROM transfer_effects')).rows).toEqual([])
  })
  it.each([{ siteId: randomUUID() }, { entitlementId: randomUUID() }, { ownerLoginSessionHash: '0'.repeat(64) },
    { operator: { actorId: randomUUID(), loginSessionHash: operatorHash } }, { operator: { actorId, loginSessionHash: '0'.repeat(64) } },
    { environment: 'production' }, { tenantId: 'forged' }])('refuses substituted or caller-selected authority: %j', async (changes) => {
    await expect(transfer(changes)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('allows a current built-in platform admin', async () => {
    await db.query('UPDATE team_members SET user_role=\'admin\'')
    await expect(transfer()).resolves.toMatchObject({ operatorId: actorId })
  })
  it('does not silently renew a revoked owner session with a new login', async () => {
    await db.query(`INSERT INTO page_studio_customer_sessions(token_hash,account_id,expires_at)
      SELECT $1,account_id,expires_at FROM page_studio_customer_sessions`, ['b'.repeat(64)])
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [input.ownerLoginSessionHash])
    await expect(transfer()).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not silently renew a revoked operator session with a new login', async () => {
    await db.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      SELECT role,$1,user_id,issued_at,expires_at FROM page_studio_login_sessions`, ['b'.repeat(64)])
    await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [operatorHash])
    await expect(transfer()).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
    'UPDATE page_studio_entitlements SET plan_metadata=\'{}\' WHERE status=\'active\''
  ])('rolls back native writes when authority changes during completion: %s', async (sql) => {
    await expect(transfer({}, async (tx) => {
      await tx.query('INSERT INTO transfer_effects VALUES(\'must roll back\')')
      await tx.query(sql)
    })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT * FROM transfer_effects')).rows).toEqual([])
  })
  it.each([
    'SELECT * FROM team_members FOR UPDATE',
    'SELECT * FROM page_studio_login_sessions FOR UPDATE',
    'SELECT * FROM page_studio_customer_sessions FOR UPDATE',
    'SELECT * FROM page_studio_workspace_memberships FOR UPDATE',
    'SELECT * FROM page_studio_entitlements FOR UPDATE',
    'SELECT * FROM page_studio_sites FOR UPDATE'
  ])('refuses concurrent authority or site changes without waiting: %s', async (sql) => {
    await db.query('BEGIN')
    try {
      await db.query(sql)
      await expect(transfer()).rejects.toMatchObject({ statusCode: 503 })
    } finally { await db.query('ROLLBACK') }
  })
  it('rechecks real clock expiry before committing native effects', async () => {
    await expect(transfer({}, async (tx) => {
      await tx.query('INSERT INTO transfer_effects VALUES(\'expired\')')
      await tx.query('UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+interval \'20 milliseconds\'')
      await tx.query('SELECT pg_sleep(0.04)')
    })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT * FROM transfer_effects')).rows).toEqual([])
  })
  it('captures inputs and authority identity before callbacks can mutate them', async () => {
    const { withManagedTransferAuthority } = await import('~~/server/utils/pageStudio/managedTransferAuthority')
    const originalSite = input.siteId, originalPlan = input.entitlementId
    await expect(withManagedTransferAuthority(input, async (_tx, authority) => {
      input.operator.actorId = randomUUID()
      input.ownerLoginSessionHash = '0'.repeat(64)
      input.siteId = randomUUID()
      return authority
    }, { runTransaction })).resolves.toMatchObject({ operatorId: actorId, entitlementId: originalPlan, source: { siteId: originalSite } })
  })
  it('keeps exact plan identity stable across database session timezones', async () => {
    const initial = await transfer()
    await expect(transfer({}, async (tx, authority) => {
      await tx.query('SET LOCAL TIME ZONE \'Australia/Melbourne\'')
      return authority
    })).resolves.toEqual(initial)
  })

  describe('durable native transfer intent', () => {
    let key: string, generation: string, schemaObject: string, contentObject: string, recordObject: string
    let sourceFreeze: z.infer<typeof CmsFreezeReceiptSchema>
    const pin = (kind: string, version = 1) => ({ kind, collectionId: kind === 'content' ? '' : 'products', recordId: kind === 'record' ? 'first' : '',
      version, bytes: 30, freezeDigest: sourceFreeze.digest, operationId: 'adoption_a', origin: 'legacy', sha256: 'a'.repeat(64) })
    beforeAll(async () => {
      const path = 'server/database/migrations/457_page_studio_managed_transfer_intents.sql'
      await db.query(readFileSync(path, 'utf8'))
      await db.query(readFileSync('server/database/migrations/458_page_studio_managed_transfer_resources.sql', 'utf8'))
      await db.query(readFileSync('server/database/migrations/459_page_studio_managed_transfer_resource_bindings.sql', 'utf8'))
      await db.query(readFileSync('server/database/migrations/460_page_studio_managed_transfer_executions.sql', 'utf8'))
      await db.query(readFileSync('server/database/migrations/461_page_studio_managed_transfer_source_drafts.sql', 'utf8'))
      await db.query(readFileSync('server/database/migrations/462_page_studio_managed_transfer_destination_catalogues.sql', 'utf8'))
      await db.query(readFileSync('server/database/migrations/463_page_studio_managed_transfer_catalogue_verifications.sql', 'utf8'))
      // Load the real coordinators as fixture setup, outside operation deadlines.
      await import('~~/server/utils/pageStudio/managedTransferIntent')
      await import('~~/server/utils/pageStudio/managedTransferResources')
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
    async function request() {
      const coordinator = await import('~~/server/utils/pageStudio/managedTransferIntent')
      const review = await coordinator.reviewManagedTransferSource(input, { runTransaction })
      return { authority: structuredClone(input), operationId: randomUUID(), expectedSourceDigest: review.sourceDigest }
    }
    async function reserve(value: unknown) {
      const { reserveManagedTransferIntent } = await import('~~/server/utils/pageStudio/managedTransferIntent')
      return reserveManagedTransferIntent(value, { runTransaction })
    }
    it('retains one immutable request and returns the same destination identity after a lost acknowledgement', async () => {
      const value = await request()
      const first = await reserve(value)
      expect(first).toMatchObject({ operationId: value.operationId, state: 'reserved', sourceDigest: value.expectedSourceDigest })
      expect(await reserve(value)).toEqual(first)
      const saved = (await db.query('SELECT * FROM page_studio_managed_transfer_intents')).rows
      expect(saved).toHaveLength(1)
      expect(saved[0].intent.authority).toMatchObject({ owner: { identityId: expected.identityId }, operatorId: actorId, entitlementId: input.entitlementId })
      expect(saved[0].intent.destination).toMatchObject({ environment: 'production', requestKey: `transfer_${value.operationId}` })
      expect(saved[0].intent.destination.generation).not.toBe(generation)
      expect(saved[0].intent.source.objects).toHaveLength(3)
      expect(saved[0].intent.source.recordHeads).toEqual([{ collectionId: 'products', recordId: 'first', objectId: recordObject }])
      expect(JSON.stringify(first)).not.toContain(input.ownerLoginSessionHash)
      expect(JSON.stringify(first)).not.toContain(operatorHash)
      expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
      await expect(db.query('UPDATE page_studio_managed_transfer_intents SET intent=\'{}\'')).rejects.toThrow(/immutable/i)
      await expect(db.query('DELETE FROM page_studio_managed_transfer_intents')).rejects.toThrow(/immutable/i)
    })
    it('refuses another operation rather than allocating a second production destination', async () => {
      const value = await request()
      await reserve(value)
      await expect(reserve({ ...value, operationId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
      expect((await db.query('SELECT count(*) FROM page_studio_managed_transfer_intents')).rows[0].count).toBe('1')
    })
    it('rejects changed intent identity on an otherwise valid retry', async () => {
      const value = await request()
      await reserve(value)
      await expect(reserve({ ...value, expectedSourceDigest: '0'.repeat(64) })).rejects.toMatchObject({ statusCode: 409 })
      await expect(reserve({ ...value, destination: { environment: 'production', databaseId: randomUUID() } })).rejects.toMatchObject({ statusCode: 400 })
    })
    it.each(['content', 'record'])('rejects an accepted %s history advance even if its selected head was restored', async (kind) => {
      const value = await request()
      await db.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id)
        VALUES($1,$2,$3,$4,$5,$6,2,$7,$8,$9,$10,clock_timestamp(),'adoption_a')`,
      [key, generation, randomUUID(), kind, kind === 'content' ? '' : 'products', kind === 'record' ? 'first' : '', pin(kind, 2),
        kind === 'record' ? schemaObject : null, kind === 'record' ? false : null, expected.identityId])
      await expect(reserve(value)).rejects.toMatchObject({ statusCode: 409 })
      expect((await db.query('SELECT * FROM page_studio_managed_transfer_intents')).rows).toEqual([])
    })
    it.each([
      'UPDATE page_studio_cms_scopes SET current_content_id=NULL',
      'DELETE FROM page_studio_cms_record_heads',
      'UPDATE page_studio_cms_scopes SET target=jsonb_set(target,\'{routeId}\',\'"rerouted"\')',
      'UPDATE page_studio_sites SET current_checkpoint_id=NULL',
      'UPDATE page_studio_entitlements SET storage_bytes_limit=storage_bytes_limit+1 WHERE status=\'active\''
    ])('rejects a changed source or plan after review: %s', async (sql) => {
      const value = await request()
      await db.query(sql)
      await expect(reserve(value)).rejects.toMatchObject({ statusCode: 409 })
      expect((await db.query('SELECT * FROM page_studio_managed_transfer_intents')).rows).toEqual([])
    })
    it('rechecks original authority before replaying a retained receipt', async () => {
      const value = await request()
      await reserve(value)
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
      await expect(reserve(value)).rejects.toMatchObject({ statusCode: 403 })
    })
    it('serializes two independent transfer requests for the same source site', async () => {
      const a = await request(), b = await request()
      const results = await Promise.allSettled([reserve(a), reserve(b)])
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
      expect([409, 503]).toContain(rejected.reason.statusCode)
      expect((await db.query('SELECT count(*) FROM page_studio_managed_transfer_intents')).rows[0].count).toBe('1')
    })
    it('fails before reservation when accepted history exceeds the bounded native snapshot', async () => {
      const { reviewManagedTransferSource } = await import('~~/server/utils/pageStudio/managedTransferIntent')
      await db.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,actor_id,created_at,adoption_id)
        SELECT $1,$2,gen_random_uuid(),'content','','',version,$3::jsonb || jsonb_build_object('version',version),$4,clock_timestamp(),'adoption_a'
        FROM generate_series(2,1001) AS version`, [key, generation, pin('content'), expected.identityId])
      await expect(reviewManagedTransferSource(input, { runTransaction })).rejects.toMatchObject({ statusCode: 413 })
      expect((await db.query('SELECT * FROM page_studio_managed_transfer_intents')).rows).toEqual([])
    })

    describe('resource-only transfer preparation', () => {
      const artifacts = { policyVersion: 'content-attachment-v1', runtimeDigest: 'd'.repeat(64), schemaDigest: 'e'.repeat(64) }
      async function prepared() {
        const value = await request()
        const receipt = await reserve(value)
        return { operationId: value.operationId, intentDigest: receipt.intentDigest }
      }
      async function prepare(value: unknown, selectedArtifacts: unknown = artifacts) {
        const module = await import('~~/server/utils/pageStudio/managedTransferResources')
        return module.prepareManagedTransferResources(value, { artifacts: selectedArtifacts, runTransaction })
      }
      async function admission(value: unknown) {
        const module = await import('~~/server/utils/pageStudio/managedTransferResources')
        return module.authorizeManagedTransferResources(value, { runTransaction })
      }
      it('retains the exact production resource request independently of source design and replays lost acknowledgements', async () => {
        const value = await prepared()
        const before = (await db.query('SELECT current_checkpoint_id,status FROM page_studio_sites')).rows
        const first = await prepare(value)
        expect(await prepare(value)).toEqual(first)
        expect(first).toMatchObject({ ...value, state: 'resources-reserved', resourceIdentity: expect.stringMatching(/^cms_attach_[a-f0-9]{64}$/) })
        expect(JSON.stringify(first)).not.toContain(input.ownerLoginSessionHash)
        expect(JSON.stringify(first)).not.toContain(operatorHash)
        const saved = (await db.query('SELECT * FROM page_studio_managed_transfer_resources')).rows
        expect(saved).toHaveLength(1)
        const resourceRequest = saved[0].request
        expect(resourceRequest).toMatchObject({ ...artifacts, operationId: `transfer_${value.operationId}`,
          scope: { siteId: input.siteId, environment: 'production' }, anchor: { checkpointId: 'checkpoint_a', digest: 'c'.repeat(64) },
          actor: { kind: 'agency-user', userId: actorId, loginSessionHash: operatorHash } })
        expect(await admission({ ...value, resourceRequest })).toEqual(resourceRequest)
        expect((await db.query('SELECT current_checkpoint_id,status FROM page_studio_sites')).rows).toEqual(before)
        expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
        await expect(db.query('UPDATE page_studio_managed_transfer_resources SET request=\'{}\'')).rejects.toThrow(/immutable/i)
        await expect(db.query('DELETE FROM page_studio_managed_transfer_resources')).rejects.toThrow(/immutable/i)
      })
      it('requires a saved transfer and exact reviewed intent digest', async () => {
        await expect(prepare({ operationId: randomUUID(), intentDigest: '0'.repeat(64) })).rejects.toMatchObject({ statusCode: 403 })
        const value = await prepared()
        await expect(prepare({ ...value, intentDigest: '0'.repeat(64) })).rejects.toMatchObject({ statusCode: 403 })
        await expect(prepare({ ...value, destination: { databaseId: randomUUID() } })).rejects.toMatchObject({ statusCode: 400 })
      })
      it('refuses artifact changes instead of silently installing a new runtime on retry', async () => {
        const value = await prepared()
        await prepare(value)
        await expect(prepare(value, { ...artifacts, runtimeDigest: '0'.repeat(64) })).rejects.toMatchObject({ statusCode: 409 })
        await expect(prepare(value, { ...artifacts, policyVersion: 'unreviewed' })).rejects.toMatchObject({ statusCode: 503 })
      })
      it.each([
        'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
        'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
        'UPDATE page_studio_workspace_memberships SET role=\'manager\'',
        'UPDATE page_studio_entitlements SET storage_bytes_limit=storage_bytes_limit+1 WHERE status=\'active\'',
        'UPDATE page_studio_cms_scopes SET current_content_id=NULL',
        'DELETE FROM page_studio_cms_record_heads',
        'UPDATE page_studio_sites SET current_checkpoint_id=NULL'
      ])('rechecks original authority and source before every resource effect: %s', async (sql) => {
        const value = await prepared()
        await prepare(value)
        const resourceRequest = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
        await db.query(sql)
        await expect(admission({ ...value, resourceRequest })).rejects.toMatchObject({ statusCode: expect.any(Number) })
        await expect(prepare(value)).rejects.toMatchObject({ statusCode: expect.any(Number) })
      })
      it.each(['scope', 'actor', 'anchor', 'runtimeDigest', 'operationId'])('refuses substituted resource %s', async (field) => {
        const value = await prepared()
        await prepare(value)
        const resourceRequest = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
        const substitutions = { scope: { ...resourceRequest.scope, environment: 'staging' }, actor: { ...resourceRequest.actor, userId: randomUUID() },
          anchor: { ...resourceRequest.anchor, digest: '0'.repeat(64) }, runtimeDigest: '0'.repeat(64), operationId: `transfer_${randomUUID()}` }
        await expect(admission({ ...value, resourceRequest: { ...resourceRequest, [field]: substitutions[field as keyof typeof substitutions] } })).rejects.toMatchObject({ statusCode: 403 })
      })
      it('does not substitute a fresh owner login after the original was revoked', async () => {
        const value = await prepared()
        await prepare(value)
        const resourceRequest = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
        await db.query(`INSERT INTO page_studio_customer_sessions(token_hash,account_id,expires_at)
          SELECT $1,account_id,expires_at FROM page_studio_customer_sessions`, ['b'.repeat(64)])
        await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [input.ownerLoginSessionHash])
        await expect(admission({ ...value, resourceRequest })).rejects.toMatchObject({ statusCode: 403 })
      })
      it('rolls back resource reservation if source selection changes in the native transaction', async () => {
        const value = await prepared()
        const module = await import('~~/server/utils/pageStudio/managedTransferResources')
        const changed = <T>(work: (client: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
          const query = tx.query.bind(tx)
          const wrapped = { query: async (sql: string, params?: unknown[]) => {
            const result = await query(sql, params)
            if (sql.includes('INSERT INTO page_studio_managed_transfer_resources')) {
              await query('UPDATE page_studio_cms_scopes SET current_content_id=NULL')
            }
            return result
          } }
          return work(wrapped as pg.Client)
        })
        await expect(module.prepareManagedTransferResources(value, { artifacts, runTransaction: changed })).rejects.toMatchObject({ statusCode: 409 })
        expect((await db.query('SELECT * FROM page_studio_managed_transfer_resources')).rows).toEqual([])
        expect((await db.query('SELECT current_content_id FROM page_studio_cms_scopes')).rows[0].current_content_id).toBe(contentObject)
      })
      it('rechecks original authority after resolving the immutable intent', async () => {
        const value = await prepared()
        const module = await import('~~/server/utils/pageStudio/managedTransferResources')
        let reads = 0
        const changed = async <T>(work: (client: pg.Client) => Promise<T>) => {
          const result = await runTransaction(work)
          if (++reads === 1) await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
          return result
        }
        await expect(module.prepareManagedTransferResources(value, { artifacts, runTransaction: changed })).rejects.toMatchObject({ statusCode: 403 })
        expect((await db.query('SELECT * FROM page_studio_managed_transfer_resources')).rows).toEqual([])
      })
      it('serializes competing reviewed runtime preparations without replacing the winner', async () => {
        const value = await prepared()
        const results = await Promise.allSettled([prepare(value), prepare(value, { ...artifacts, runtimeDigest: '0'.repeat(64) })])
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
        const loser = results.find(item => item.status === 'rejected') as PromiseRejectedResult
        expect([409, 503]).toContain(loser.reason.statusCode)
        expect((await db.query('SELECT count(*) FROM page_studio_managed_transfer_resources')).rows[0].count).toBe('1')
      })
      describe('physical resource binding', () => {
        const provider = { accountId: 'a'.repeat(32), compatibilityDate: '2026-08-18' }
        async function candidate() {
          const value = await prepared()
          const reservation = await prepare(value)
          const resourceRequest = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
          const databaseId = randomUUID()
          const physical = { version: 1, ...value, resourceIdentity: reservation.resourceIdentity,
            preparationId: randomUUID(), preparationDigest: '1'.repeat(64),
            database: { accountId: provider.accountId, databaseId, name: `ps-content-${'3'.repeat(32)}`, schemaDigest: artifacts.schemaDigest },
            worker: { accountId: provider.accountId, databaseId, scope: resourceRequest.scope,
              namespace: 'xeroflow-page-studio-dispatch-production', scriptName: `ps-content-${'4'.repeat(32)}`,
              ownerTag: `ps-owner-${'5'.repeat(32)}`, compatibilityDate: provider.compatibilityDate,
              runtimeDigest: artifacts.runtimeDigest, setupDigest: await collectionDigest({ attachmentIdentity: reservation.resourceIdentity, mode: resourceRequest.mode }), etag: 'verified-etag' } }
          const inspect = vi.fn(async (request: unknown) => {
            expect(request).toEqual({ ...value, resourceRequest })
            // This independent connection would fail if provider I/O ran under
            // the native site lock. It also models a source edit during I/O.
            await db.query('BEGIN')
            try {
              await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
            } finally {
              await db.query('ROLLBACK')
            }
            return structuredClone(physical)
          })
          return { value, physical, inspect }
        }
        async function bind(value: unknown, inspect: (request: unknown) => Promise<unknown>, transaction = runTransaction) {
          const module = await import('~~/server/utils/pageStudio/managedTransferResources')
          return module.bindManagedTransferResources(value, { inspect, provider, runTransaction: transaction })
        }
        describe('destination catalogue authority', () => {
          async function catalogueSetup(bound = true) {
            const c = await candidate()
            if (bound) await bind(c.value, c.inspect)
            const module = await import('~~/server/utils/pageStudio/managedTransferDestinationCatalogue')
            const options = { runTransaction, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' } }
            return { ...c, module, options }
          }
          describe('destination catalogue coordinator', () => {
            type Request = Awaited<ReturnType<typeof import('~~/server/utils/pageStudio/managedTransferDestinationCatalogue')['prepareManagedTransferDestinationCatalogue']>>
            // Independent wire fixture. No production plan builder is used to
            // generate the expected phase identities or canonical plan hash.
            async function ready(request: Request) {
              const scope = request.resourceRequest.resourceRequest.scope, physical = request.baseline.database
              const base = { accountId: physical.accountId, databaseId: physical.databaseId, name: physical.name, scope }
              const id = `transfer_${request.operationId}`
              const phases = ['collection', 'workflow', 'staging', 'forms'] as const
              const intents = {
                collection: { ...base, operationId: `${id}_collection` },
                workflow: { ...base, operationId: `${id}_workflow`, collectionOperationId: `${id}_collection` },
                staging: { ...base, operationId: `${id}_staging`, collectionOperationId: `${id}_collection`, workflowOperationId: `${id}_workflow` },
                forms: { ...base, operationId: `${id}_forms`, collectionOperationId: `${id}_collection`, workflowOperationId: `${id}_workflow`, stagingOperationId: `${id}_staging` }
              }
              const digests = ['012054889e832d8753033811f9a6306d0b9f90a552c9f0a0af9ec5a6f62d435a', '0feb591f4c5fcb82c9b10204f7e387e83b4eb52eb634ce772f8cad8716ca0cee',
                '60631223175cb7e8bf9dca5b08347a192844b8600bd8687e1caa8b60c9f337ae', '863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e', 'c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2']
              const receipts = Object.fromEntries(phases.map((kind, i) => [kind, { ...intents[kind], sourceDigest: digests[i], targetDigest: digests[i + 1] }]))
              const receiptDigests = Object.fromEntries(await Promise.all(phases.map(async kind => [kind, await collectionDigest(receipts[kind])])))
              const requestDigest = await collectionDigest(request)
              const planDigest = await collectionDigest({ formatVersion: 1, requestDigest,
                phases: phases.map((kind, ordinal) => ({ kind, ordinal, intent: intents[kind], receipt: receipts[kind], receiptDigest: receiptDigests[kind] })) })
              const body = { formatVersion: 1, operationId: request.operationId, intentDigest: request.intentDigest,
                requestDigest, baselineDigest: await collectionDigest(request.baseline), planDigest, receipts, receiptDigests }
              return { operationId: request.operationId, intentDigest: request.intentDigest, requestDigest, planDigest,
                state: 'ready', completedPhases: [...phases], receipt: { ...body, digest: await collectionDigest(body) } }
            }
            async function coordinate(c: Awaited<ReturnType<typeof catalogueSetup>>, action: string, methods: Record<string, unknown> = {}) {
              const { coordinateManagedTransferDestinationCatalogue } = await import('~~/server/utils/pageStudio/managedTransferDestinationCatalogueCoordinator')
              return coordinateManagedTransferDestinationCatalogue({ ...c.value, action }, {
                ...c.options, env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: methods }
              })
            }
            it('status does not reserve or call remote methods, and resume requires original admission', async () => {
              const c = await catalogueSetup()
              expect(await coordinate(c, 'status')).toEqual({ operationId: c.value.operationId, state: 'not-started' })
              await expect(coordinate(c, 'resume')).rejects.toMatchObject({ statusCode: 409 })
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_destination_catalogues')).rows).toEqual([])
            })
            it.each(['start', 'resume', 'status', 'verify'])('runs %s outside native locks and retains evidence only on verify', async (action) => {
              const c = await catalogueSetup()
              if (action !== 'start') await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              const method = action === 'status' ? 'readManagedTransferDestinationCatalogue' : action === 'verify' ? 'inspectManagedTransferDestinationCatalogue' : 'prepareManagedTransferDestinationCatalogue'
              let proof: Awaited<ReturnType<typeof ready>> | undefined
              const methods = { trusted: true, [method]: async function (this: { trusted: boolean }, request: Request, mode?: string) {
                expect(this.trusted).toBe(true)
                expect(mode).toBe(['start', 'resume'].includes(action) ? action : undefined)
                expect(request).toEqual((await db.query('SELECT request FROM page_studio_managed_transfer_destination_catalogues')).rows[0].request)
                await db.query('BEGIN')
                try {
                  await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                } finally { await db.query('ROLLBACK') }
                proof = await ready(request)
                return proof
              } }
              expect(await coordinate(c, action, methods)).toEqual({ operationId: c.value.operationId, state: action === 'verify' ? 'catalogue-verified' : 'ready' })
              const saved = (await db.query('SELECT receipt,receipt_digest FROM page_studio_managed_transfer_catalogue_verifications')).rows
              expect(saved).toEqual(action === 'verify' ? [{ receipt: proof!.receipt, receipt_digest: proof!.receipt.digest }] : [])
              expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
              if (action === 'verify') {
                expect(await coordinate(c, action, methods)).toEqual({ operationId: c.value.operationId, state: 'catalogue-verified' })
                await expect(db.query('DELETE FROM page_studio_managed_transfer_catalogue_verifications')).rejects.toThrow(/immutable/i)
              }
            })
            it.each(['operation', 'plan', 'request', 'prefix', 'missing', 'extra', 'receipt', 'predecessor', 'scope'])('rejects substituted %s evidence before retention', async (field) => {
              const c = await catalogueSetup()
              await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              await expect(coordinate(c, 'verify', { inspectManagedTransferDestinationCatalogue: async (request: Request) => {
                const proof = await ready(request)
                if (field === 'operation') proof.operationId = randomUUID()
                if (field === 'plan') proof.planDigest = '0'.repeat(64)
                if (field === 'request') proof.requestDigest = '0'.repeat(64)
                if (field === 'prefix') proof.completedPhases.reverse()
                if (field === 'missing') proof.completedPhases.pop()
                if (field === 'extra') return { ...proof, secret: 'untrusted' }
                if (field === 'receipt') proof.receipt.digest = '0'.repeat(64)
                if (field === 'predecessor' || field === 'scope') {
                  const receipt = proof.receipt.receipts.forms as Record<string, unknown>
                  if (field === 'predecessor') receipt.stagingOperationId = 'source_staging'
                  else receipt.scope = { ...request.baseline.worker.scope, environment: 'staging' }
                  proof.receipt.receiptDigests.forms = await collectionDigest(receipt)
                  const { digest: _, ...body } = proof.receipt
                  proof.receipt.digest = await collectionDigest(body)
                }
                return proof
              } })).rejects.toMatchObject({ statusCode: 409 })
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_catalogue_verifications')).rows).toEqual([])
            })
            it.each(['owner', 'source'])('rechecks original %s after the physical inspection before retaining proof', async (field) => {
              const c = await catalogueSetup()
              await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              await expect(coordinate(c, 'verify', { inspectManagedTransferDestinationCatalogue: async (request: Request) => {
                const proof = await ready(request)
                await db.query(field === 'owner' ? 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()' : 'DELETE FROM page_studio_cms_record_heads')
                return proof
              } })).rejects.toMatchObject({ statusCode: field === 'owner' ? 403 : 409 })
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_catalogue_verifications')).rows).toEqual([])
            })
            it('rejects a coherently rehashed proof for a remote-mutated request', async () => {
              const c = await catalogueSetup()
              const original = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              await expect(coordinate(c, 'verify', { inspectManagedTransferDestinationCatalogue: async (request: Request) => {
                request.baseline.worker.etag = 'remote-substitution'
                return ready(request)
              } })).rejects.toMatchObject({ statusCode: 409 })
              expect((await db.query('SELECT request FROM page_studio_managed_transfer_destination_catalogues')).rows).toEqual([{ request: original }])
            })
            it('preserves admission after a lost start acknowledgement and resumes exactly', async () => {
              const c = await catalogueSetup()
              let original: Request | undefined
              await expect(coordinate(c, 'start', { prepareManagedTransferDestinationCatalogue: async (request: Request) => {
                original = structuredClone(request)
                throw new Error('lost acknowledgement')
              } })).rejects.toThrow('lost acknowledgement')
              expect((await db.query('SELECT request FROM page_studio_managed_transfer_destination_catalogues')).rows).toEqual([{ request: original }])
              expect(await coordinate(c, 'resume', { prepareManagedTransferDestinationCatalogue: async (request: Request, mode: string) => {
                expect(request).toEqual(original)
                expect(mode).toBe('resume')
                return ready(request)
              } })).toEqual({ operationId: c.value.operationId, state: 'ready' })
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_catalogue_verifications')).rows).toEqual([])
            })
            it('retains one exact verification under concurrent retries', async () => {
              const c = await catalogueSetup()
              await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              const methods = { inspectManagedTransferDestinationCatalogue: ready }
              const concurrent = await Promise.allSettled([coordinate(c, 'verify', methods), coordinate(c, 'verify', methods)])
              for (const result of concurrent) {
                if (result.status === 'rejected') {
                  // The original authority uses NOWAIT; a contending request
                  // must retry its unchanged identity, never reserve another.
                  expect(result.reason).toMatchObject({ statusCode: 503 })
                  expect(await coordinate(c, 'verify', methods)).toMatchObject({ state: 'catalogue-verified' })
                } else expect(result.value).toMatchObject({ state: 'catalogue-verified' })
              }
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_catalogue_verifications')).rows).toHaveLength(1)
            })
            it('rejects corrupted retained verification evidence even after a fresh valid inspection', async () => {
              const c = await catalogueSetup()
              const methods = { inspectManagedTransferDestinationCatalogue: ready }
              await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              await coordinate(c, 'verify', methods)
              await db.query('ALTER TABLE page_studio_managed_transfer_catalogue_verifications DISABLE TRIGGER USER')
              try {
                await db.query('UPDATE page_studio_managed_transfer_catalogue_verifications SET receipt=receipt || $1::jsonb', [JSON.stringify({ baselineDigest: '0'.repeat(64) })])
              } finally { await db.query('ALTER TABLE page_studio_managed_transfer_catalogue_verifications ENABLE TRIGGER USER') }
              await expect(coordinate(c, 'verify', methods)).rejects.toMatchObject({ statusCode: 409 })
            })
            it('does not treat an existing verification as authority after owner revocation', async () => {
              const c = await catalogueSetup()
              const inspect = vi.fn(ready)
              const methods = { inspectManagedTransferDestinationCatalogue: inspect }
              await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              await coordinate(c, 'verify', methods)
              inspect.mockClear()
              await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
              await expect(coordinate(c, 'verify', methods)).rejects.toMatchObject({ statusCode: 403 })
              expect(inspect).not.toHaveBeenCalled()
            })
            it('withholds verification for an incomplete inspected catalogue without installing it', async () => {
              const c = await catalogueSetup()
              await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
              const methods = { inspectManagedTransferDestinationCatalogue: async (request: Request) => {
                const { receipt: _, ...proof } = await ready(request)
                return { ...proof, state: 'resume-required', completedPhases: ['collection'] }
              }, prepareManagedTransferDestinationCatalogue: vi.fn() }
              expect(await coordinate(c, 'verify', methods)).toEqual({ operationId: c.value.operationId, state: 'resume-required' })
              expect(methods.prepareManagedTransferDestinationCatalogue).not.toHaveBeenCalled()
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_catalogue_verifications')).rows).toEqual([])
            })
          })
          it('derives and retains the exact production baseline without selecting it or making provider calls', async () => {
            const c = await catalogueSetup()
            const resourceRequest = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
            const expected = { formatVersion: 1, ...c.value, resourceRequest: { ...c.value, resourceRequest }, baseline: c.physical }
            const original = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            expect(original).toEqual(expected)
            expect(await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)).toEqual(expected)
            expect((await db.query('SELECT request,request_digest FROM page_studio_managed_transfer_destination_catalogues')).rows)
              .toEqual([{ request: expected, request_digest: await collectionDigest(expected) }])
            expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
            expect(c.inspect).toHaveBeenCalledTimes(1)
            for (const action of ['prepare', 'read']) {
              expect(await c.module.authorizeManagedTransferDestinationCatalogue({ action, request: original }, { runTransaction })).toEqual({ action, request: expected })
            }
            original.baseline.worker.etag = 'caller mutation'
            expect(await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)).toEqual(expected)
            await expect(db.query('DELETE FROM page_studio_managed_transfer_destination_catalogues')).rejects.toThrow(/immutable/i)
            await expect(db.query('UPDATE page_studio_managed_transfer_destination_catalogues SET request=\'{}\'::jsonb')).rejects.toThrow(/immutable/i)
          })
          it('requires a verified binding and refuses caller-selected baseline or resource request', async () => {
            const c = await catalogueSetup(false)
            await expect(c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
            for (const extra of [{ baseline: c.physical }, { resourceRequest: {} }]) {
              await expect(c.module.prepareManagedTransferDestinationCatalogue({ ...c.value, ...extra }, c.options)).rejects.toMatchObject({ statusCode: 400 })
            }
          })
          it.each(['staging', 'preview', undefined])('refuses reservation outside production (%s)', async (environment) => {
            const c = await catalogueSetup()
            await expect(c.module.prepareManagedTransferDestinationCatalogue(c.value, { ...c.options, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: environment } })).rejects.toMatchObject({ statusCode: 503 })
          })
          it('requires saved catalogue admission and rejects terminal or installation-specific callback actions', async () => {
            const c = await catalogueSetup()
            const resourceRequest = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
            const request = { formatVersion: 1, ...c.value, resourceRequest: { ...c.value, resourceRequest }, baseline: c.physical }
            await expect(c.module.authorizeManagedTransferDestinationCatalogue({ action: 'read', request }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
            await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            for (const action of ['activate', 'cancel', 'retain', 'forms']) {
              await expect(c.module.authorizeManagedTransferDestinationCatalogue({ action, request }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
            }
          })
          it.each(['operation', 'intent', 'target', 'etag', 'resource', 'scope', 'actor'])('rejects substituted callback %s', async (field) => {
            const c = await catalogueSetup()
            const request = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            if (field === 'operation') request.operationId = randomUUID()
            if (field === 'intent') request.resourceRequest.intentDigest = '0'.repeat(64)
            if (field === 'target') request.baseline.database.databaseId = randomUUID()
            if (field === 'etag') request.baseline.worker.etag = 'new-generation'
            if (field === 'resource') request.baseline.resourceIdentity = `cms_attach_${'0'.repeat(64)}`
            if (field === 'scope') request.resourceRequest.resourceRequest.scope.environment = 'staging' as 'production'
            if (field === 'actor') request.resourceRequest.resourceRequest.actor.userId = randomUUID()
            await expect(c.module.authorizeManagedTransferDestinationCatalogue({ action: 'prepare', request }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
          })
          it.each([
            'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
            'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
            'UPDATE page_studio_workspace_memberships SET role=\'manager\'',
            'UPDATE page_studio_entitlements SET storage_bytes_limit=storage_bytes_limit+1 WHERE status=\'active\'',
            'UPDATE page_studio_cms_scopes SET current_content_id=NULL',
            'DELETE FROM page_studio_cms_record_heads',
            'UPDATE page_studio_sites SET current_checkpoint_id=NULL'
          ])('rechecks original owner/operator/plan/source on each callback: %s', async (sql) => {
            const c = await catalogueSetup()
            const request = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            await db.query(sql)
            await expect(c.module.authorizeManagedTransferDestinationCatalogue({ action: 'prepare', request }, { runTransaction })).rejects.toMatchObject({ statusCode: expect.any(Number) })
            await expect(c.module.authorizeManagedTransferDestinationCatalogue({ action: 'read', request }, { runTransaction })).rejects.toMatchObject({ statusCode: expect.any(Number) })
          })
          it.each(['catalogue', 'resource', 'binding'])('rejects corrupt retained %s hashes on every callback', async (kind) => {
            const c = await catalogueSetup()
            const request = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            const table = kind === 'catalogue' ? 'page_studio_managed_transfer_destination_catalogues' : kind === 'resource' ? 'page_studio_managed_transfer_resources' : 'page_studio_managed_transfer_resource_bindings'
            const digest = kind === 'binding' ? 'binding_digest' : 'request_digest'
            let reads = 0
            const corrupt = <T>(work: (tx: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
              if (++reads === 1) return work(tx)
              await tx.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`)
              await tx.query(`UPDATE ${table} SET ${digest}=$1`, ['0'.repeat(64)])
              return work(tx)
            })
            await expect(c.module.authorizeManagedTransferDestinationCatalogue({ action: 'read', request }, { runTransaction: corrupt })).rejects.toMatchObject({ statusCode: expect.any(Number) })
          })
          it('rejects a coherently rehashed changed binding rather than replacing retained authority', async () => {
            const c = await catalogueSetup()
            const request = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            let reads = 0
            const corrupt = <T>(work: (tx: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
              if (++reads === 1) return work(tx)
              const binding = (await tx.query('SELECT binding FROM page_studio_managed_transfer_resource_bindings')).rows[0].binding
              binding.physical.worker.etag = 'substituted-version'
              await tx.query('ALTER TABLE page_studio_managed_transfer_resource_bindings DISABLE TRIGGER USER')
              await tx.query('UPDATE page_studio_managed_transfer_resource_bindings SET binding=$1,binding_digest=$2', [binding, await collectionDigest(binding)])
              return work(tx)
            })
            await expect(c.module.authorizeManagedTransferDestinationCatalogue({ action: 'prepare', request }, { runTransaction: corrupt })).rejects.toMatchObject({ statusCode: 409 })
            expect(await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)).toEqual(request)
          })
          it('serializes concurrent admission and preserves exact retries after a lost response', async () => {
            const c = await catalogueSetup()
            const results = await Promise.allSettled([
              c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options),
              c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            ])
            expect(results.some(r => r.status === 'fulfilled')).toBe(true)
            for (const result of results) if (result.status === 'rejected') expect(result.reason).toMatchObject({ statusCode: 503 })
            const exact = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
            for (const result of results) if (result.status === 'fulfilled') expect(result.value).toEqual(exact)
            expect((await db.query('SELECT request FROM page_studio_managed_transfer_destination_catalogues')).rows).toEqual([{ request: exact }])
          })
          it('rolls back admission when original source heads change inside the transaction', async () => {
            const c = await catalogueSetup()
            const changed = <T>(work: (tx: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
              const query = tx.query.bind(tx)
              const wrapped = { query: async (sql: string, params?: unknown[]) => {
                const result = await query(sql, params)
                if (sql.includes('INSERT INTO page_studio_managed_transfer_destination_catalogues')) await query('DELETE FROM page_studio_cms_record_heads')
                return result
              } }
              return work(wrapped as pg.Client)
            })
            await expect(c.module.prepareManagedTransferDestinationCatalogue(c.value, { ...c.options, runTransaction: changed })).rejects.toMatchObject({ statusCode: 409 })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_destination_catalogues')).rows).toEqual([])
          })
        })
        describe('native execution workflow', () => {
          const policy = { version: 1, kind: 'managed-draft-transfer', accountId: 'a'.repeat(32),
            namespace: 'xeroflow-page-studio-dispatch-staging',
            from: { compatibilityDate: '2026-08-18', digest: 'a'.repeat(64) },
            to: { compatibilityDate: '2026-08-18', digest: '9'.repeat(64) } }
          async function setup(bound = true) {
            const c = await candidate()
            if (bound) await bind(c.value, c.inspect)
            const scope = (await db.query('SELECT intent FROM page_studio_managed_transfer_intents')).rows[0].intent.authority.source
            const target = (await db.query('SELECT target FROM page_studio_cms_scopes')).rows[0].target
            const context = { formatVersion: 1, ...c.value, sourceScope: scope, sourceTarget: target, freezeDigest: sourceFreeze.digest }
            const predecessor = { accountId: target.accountId, databaseId: target.databaseId, scope,
              namespace: policy.namespace, scriptName: `ps-content-${'5'.repeat(32)}`, ownerTag: `ps-owner-${'6'.repeat(32)}`,
              runtimeDigest: target.runtimeDigest, compatibilityDate: policy.from.compatibilityDate, setupDigest: '7'.repeat(64) }
            const formReceipt = { operationId: 'forms_a', collectionOperationId: 'collection_a', workflowOperationId: 'workflow_a', stagingOperationId: 'staging_a',
              scope, accountId: target.accountId, databaseId: target.databaseId, name: target.name,
              sourceDigest: '863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e',
              targetDigest: 'c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2' }
            const discovery = { ...context, predecessor, freeze: sourceFreeze, formReceipt }
            const service = { discoverManagedTransferExecution: vi.fn(async () => structuredClone(discovery)) }
            const module = await import('~~/server/utils/pageStudio/managedTransferExecution')
            const options = { runTransaction, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
              PAGE_STUDIO_PROVISIONER: service, MANAGED_TRANSFER_EXECUTION_POLICY: JSON.stringify(policy) } }
            return { ...c, context, discovery, service, module, options }
          }
          describe('source draft fence authority', () => {
            async function sourceSetup(progress: Record<string, unknown> = {}) {
              const c = await setup()
              await c.module.prepareManagedTransferExecution(c.value, c.options)
              const module = await import('~~/server/utils/pageStudio/managedTransferSourceDrafts')
              const inspect = vi.fn(async () => ({ ...c.value, state: 'ready', identity: '1'.repeat(64), ...progress }))
              const options = { ...c.options, env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferExecution: inspect } } }
              return { ...c, module, inspect, options }
            }
            describe('source fence coordinator', () => {
              async function coordinate(c: Awaited<ReturnType<typeof sourceSetup>>, action: string, method: (value: unknown) => Promise<unknown>) {
                return c.module.coordinateManagedTransferSourceDrafts({ ...c.value, action }, { ...c.options,
                  env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: { ...c.options.env.PAGE_STUDIO_PROVISIONER,
                    freezeManagedTransferSourceDrafts: method, readManagedTransferSourceDraftsFence: method } } })
              }
              async function receipt(request: { fenceIntent: unknown }) {
                const body = { identityDigest: await collectionDigest(request.fenceIntent), request: request.fenceIntent, state: 'frozen' }
                return { ...body, digest: await collectionDigest(body) }
              }
              it('status does not reserve or freeze and resume requires a retained request', async () => {
                const c = await sourceSetup(), unexpected = vi.fn()
                expect(await coordinate(c, 'status', unexpected)).toEqual({ operationId: c.value.operationId, state: 'not-started' })
                await expect(coordinate(c, 'resume', unexpected)).rejects.toMatchObject({ statusCode: 409 })
                expect(unexpected).not.toHaveBeenCalled()
                expect(c.inspect).not.toHaveBeenCalled()
              })
              it('reports a retained but absent fence without repeating preparation', async () => {
                const c = await sourceSetup()
                const original = await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
                const read = vi.fn(async () => null)
                expect(await coordinate(c, 'status', read)).toEqual({ operationId: c.value.operationId, state: 'not-frozen' })
                expect(read).toHaveBeenCalledExactlyOnceWith(original)
                expect(c.inspect).toHaveBeenCalledTimes(1)
                expect((await db.query('SELECT request FROM page_studio_managed_transfer_source_drafts')).rows).toEqual([{ request: original }])
              })
              it('rejects a coherently hashed proof made from a mutated RPC request', async () => {
                const c = await sourceSetup()
                const original = await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
                await expect(coordinate(c, 'resume', async (request) => {
                  const supplied = request as { fenceIntent: { transferId: string } }
                  supplied.fenceIntent.transferId = randomUUID()
                  return receipt(supplied)
                })).rejects.toMatchObject({ statusCode: 409 })
                expect((await db.query('SELECT request FROM page_studio_managed_transfer_source_drafts')).rows).toEqual([{ request: original }])
              })
              it.each(['start', 'resume', 'status'])('coordinates %s with full fence proof and no native locks across RPC', async (action) => {
                const c = await sourceSetup()
                if (action !== 'start') await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
                expect(await coordinate(c, action, async (request) => {
                  await db.query('BEGIN')
                  try {
                    await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                  } finally {
                    await db.query('ROLLBACK')
                  }
                  return receipt(request as { fenceIntent: unknown })
                })).toEqual({ operationId: c.value.operationId, state: 'frozen' })
              })
              it.each(['digest', 'identity', 'request', 'extra', 'retained', 'cancelled'])('rejects invalid %s fence proof', async (field) => {
                const c = await sourceSetup()
                await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
                await expect(coordinate(c, 'status', async (request) => {
                  const proof = await receipt(request as { fenceIntent: unknown })
                  if (field === 'digest') proof.digest = '0'.repeat(64)
                  if (field === 'identity') proof.identityDigest = '0'.repeat(64)
                  if (field === 'request') proof.request = { ...proof.request as object, transferId: randomUUID() }
                  if (['retained', 'cancelled'].includes(field)) proof.state = field
                  return field === 'extra' ? { ...proof, secret: true } : proof
                })).rejects.toMatchObject({ statusCode: 409 })
              })
              it('rechecks original owner after a source fence acknowledgement', async () => {
                const c = await sourceSetup()
                await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
                await expect(coordinate(c, 'resume', async (request) => {
                  await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
                  return receipt(request as { fenceIntent: unknown })
                })).rejects.toMatchObject({ statusCode: 403 })
              })
              it('keeps the retained request after a lost response for an explicit resume', async () => {
                const c = await sourceSetup()
                await expect(coordinate(c, 'start', async () => {
                  throw new Error('Lost response')
                })).rejects.toThrow('Lost response')
                expect((await db.query('SELECT request FROM page_studio_managed_transfer_source_drafts')).rows).toHaveLength(1)
                expect(await coordinate(c, 'resume', request => receipt(request as { fenceIntent: unknown }))).toEqual({ operationId: c.value.operationId, state: 'frozen' })
              })
            })
            it('retains a verified source fence identity and grants only freeze/read', async () => {
              const c = await sourceSetup()
              const request = await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
              expect(request).toEqual({ formatVersion: 1, ...c.value, executionIdentity: '1'.repeat(64), fenceIntent: {
                formatVersion: 1, nativeIntentDigest: c.value.intentDigest, transferId: c.value.operationId,
                scope: c.context.sourceScope, target: c.context.sourceTarget
              } })
              for (const action of ['freeze', 'read']) {
                expect(await c.module.authorizeManagedTransferSourceDrafts({ action, request }, { runTransaction })).toEqual({ action, request })
              }
              for (const action of ['cancel', 'retain']) {
                await expect(c.module.authorizeManagedTransferSourceDrafts({ action, request }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
              }
              expect(await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)).toEqual(request)
              expect(c.inspect).toHaveBeenCalledTimes(2)
              await expect(db.query('DELETE FROM page_studio_managed_transfer_source_drafts')).rejects.toThrow(/immutable/i)
              await expect(db.query('UPDATE page_studio_managed_transfer_source_drafts SET request=\'{}\'')).rejects.toThrow(/immutable/i)
              expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
            })
            it.each(['pending', 'disabled', 'resume-required', 'not-started'])('denies %s source execution', async (state) => {
              const c = await sourceSetup({ state })
              await expect(c.module.prepareManagedTransferSourceDrafts(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_source_drafts')).rows).toEqual([])
            })
            it.each(['operation', 'identity', 'extra'])('denies substituted %s source inspection', async (field) => {
              const c = await sourceSetup(field === 'operation' ? { operationId: randomUUID() } : field === 'identity' ? { identity: undefined } : { unexpected: true })
              await expect(c.module.prepareManagedTransferSourceDrafts(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
            })
            it.each(['owner', 'source'])('rechecks %s after inspection outside native locks', async (field) => {
              const c = await sourceSetup()
              c.inspect.mockImplementationOnce(async () => {
                await db.query('BEGIN')
                try {
                  await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                } finally {
                  await db.query('ROLLBACK')
                }
                await db.query(field === 'owner' ? 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()' : 'DELETE FROM page_studio_cms_record_heads')
                return { ...c.value, state: 'ready', identity: '1'.repeat(64) }
              })
              await expect(c.module.prepareManagedTransferSourceDrafts(c.value, c.options)).rejects.toMatchObject({ statusCode: field === 'owner' ? 403 : 409 })
              expect((await db.query('SELECT * FROM page_studio_managed_transfer_source_drafts')).rows).toEqual([])
            })
            it('rejects changed ready identity on retry without replacing the original fence', async () => {
              const c = await sourceSetup()
              const original = await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
              c.inspect.mockResolvedValueOnce({ ...c.value, state: 'ready', identity: '2'.repeat(64) })
              await expect(c.module.prepareManagedTransferSourceDrafts(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
              expect((await db.query('SELECT request FROM page_studio_managed_transfer_source_drafts')).rows).toEqual([{ request: original }])
            })
            it('serializes competing preparations to a single exact fence identity', async () => {
              const c = await sourceSetup()
              const results = await Promise.allSettled([
                c.module.prepareManagedTransferSourceDrafts(c.value, c.options),
                c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
              ])
              for (const result of results) {
                if (result.status === 'rejected') expect(result.reason).toMatchObject({ statusCode: 503 })
              }
              const original = await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
              for (const result of results) {
                if (result.status === 'fulfilled') expect(result.value).toEqual(original)
              }
              expect((await db.query('SELECT request FROM page_studio_managed_transfer_source_drafts')).rows).toEqual([{ request: original }])
            })
            it('denies a substituted retained request and later owner revocation', async () => {
              const c = await sourceSetup()
              const request = await c.module.prepareManagedTransferSourceDrafts(c.value, c.options)
              await expect(c.module.authorizeManagedTransferSourceDrafts({ action: 'read', request: { ...request, executionIdentity: '2'.repeat(64) } }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
              await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
              await expect(c.module.authorizeManagedTransferSourceDrafts({ action: 'freeze', request }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
            })
          })
          describe('execution coordinator', () => {
            async function control(c: Awaited<ReturnType<typeof setup>>, action: string, methods: Record<string, unknown> = {}) {
              return c.module.coordinateManagedTransferExecution({ ...c.value, action }, { ...c.options,
                env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: { ...c.service, ...methods } } })
            }
            it('status never reserves and resume requires the original retained request', async () => {
              const c = await setup()
              expect(await control(c, 'status')).toEqual({ operationId: c.value.operationId, state: 'not-started' })
              await expect(control(c, 'resume')).rejects.toMatchObject({ statusCode: 409 })
              expect(c.service.discoverManagedTransferExecution).not.toHaveBeenCalled()
            })
            it.each(['start', 'resume', 'status', 'verify'])('coordinates %s without holding native locks or leaking private identity', async (action) => {
              const c = await setup()
              if (action !== 'start') await c.module.prepareManagedTransferExecution(c.value, c.options)
              const key = action === 'status' ? 'readManagedTransferExecution' : action === 'verify' ? 'inspectManagedTransferExecution' : 'prepareManagedTransferExecution'
              const methods = { marker: 'trusted', [key]: async function (this: { marker: string }, request: unknown, mode?: string) {
                expect(this.marker).toBe('trusted')
                expect(mode).toBe(['start', 'resume'].includes(action) ? action : undefined)
                expect(request).toEqual((await db.query('SELECT request FROM page_studio_managed_transfer_executions')).rows[0].request)
                await db.query('BEGIN')
                try {
                  await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                } finally {
                  await db.query('ROLLBACK')
                }
                return { ...c.value, state: 'ready', identity: '1'.repeat(64) }
              } }
              expect(await control(c, action, methods)).toEqual({ operationId: c.value.operationId, state: 'ready' })
              expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
            })
            it.each(['operation', 'extra', 'identity', 'not-started'])('rejects substituted %s progress', async (field) => {
              const c = await setup()
              await c.module.prepareManagedTransferExecution(c.value, c.options)
              const progress = { ...c.value, state: 'ready', identity: '1'.repeat(64) }
              if (field === 'operation') progress.operationId = randomUUID()
              if (field === 'identity') delete (progress as { identity?: string }).identity
              if (field === 'not-started') progress.state = 'not-started'
              await expect(control(c, 'status', { readManagedTransferExecution: async () => field === 'extra' ? { ...progress, secret: 'untrusted' } : progress })).rejects.toMatchObject({ statusCode: 409 })
            })
            it.each(['owner', 'source'])('rechecks original %s after executor returns', async (field) => {
              const c = await setup()
              await c.module.prepareManagedTransferExecution(c.value, c.options)
              await expect(control(c, 'resume', { prepareManagedTransferExecution: async () => {
                await db.query(field === 'owner' ? 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()' : 'DELETE FROM page_studio_cms_record_heads')
                return { ...c.value, state: 'ready', identity: '1'.repeat(64) }
              } })).rejects.toMatchObject({ statusCode: field === 'owner' ? 403 : 409 })
            })
            it('does not accept an adapter mutation of the retained expected request', async () => {
              const c = await setup()
              await c.module.prepareManagedTransferExecution(c.value, c.options)
              await expect(control(c, 'status', { readManagedTransferExecution: async (request: { operationId: string }) => {
                request.operationId = randomUUID()
                return { ...c.value, operationId: request.operationId, state: 'pending', identity: '1'.repeat(64) }
              } })).rejects.toMatchObject({ statusCode: 409 })
            })
          })
          it('reads only retained native context and requires a verified resource binding', async () => {
            const c = await setup(false)
            await expect(c.module.readManagedTransferExecutionContext(c.value, { runTransaction })).rejects.toMatchObject({ statusCode: 409 })
            await bind(c.value, c.inspect)
            expect(await c.module.readManagedTransferExecutionContext(c.value, { runTransaction })).toEqual(c.context)
            expect(c.service.discoverManagedTransferExecution).not.toHaveBeenCalled()
          })
          it('reserves exact source execution before remote effects and authorizes only that immutable request', async () => {
            const c = await setup()
            const first = await c.module.prepareManagedTransferExecution(c.value, c.options)
            expect(first).toEqual({ operationId: c.value.operationId, state: 'execution-reserved' })
            const rows = (await db.query('SELECT * FROM page_studio_managed_transfer_executions')).rows
            expect(rows).toHaveLength(1)
            const saved = rows[0].request
            expect(saved).toMatchObject({ ...c.value, sourceScope: c.context.sourceScope, sourceTarget: c.context.sourceTarget,
              freeze: sourceFreeze, predecessor: c.discovery.predecessor, policy: { version: 1, kind: policy.kind, from: policy.from, to: policy.to } })
            expect(saved.successor.scriptName).not.toBe(saved.predecessor.scriptName)
            expect(saved.successor.runtimeDigest).toBe(policy.to.digest)
            expect(await c.module.authorizeManagedTransferExecution(saved, { runTransaction })).toEqual(saved)
            expect(await c.module.prepareManagedTransferExecution(c.value, c.options)).toEqual(first)
            expect(c.service.discoverManagedTransferExecution).toHaveBeenCalledTimes(1)
            await expect(db.query('UPDATE page_studio_managed_transfer_executions SET request=\'{}\'')).rejects.toThrow(/immutable/i)
            await expect(db.query('DELETE FROM page_studio_managed_transfer_executions')).rejects.toThrow(/immutable/i)
            expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
          })
          it.each(['owner', 'source'])('rejects %s drift across discovery without retaining a request', async (change) => {
            const c = await setup()
            c.service.discoverManagedTransferExecution.mockImplementation(async () => {
              await db.query(change === 'owner' ? 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()' : 'DELETE FROM page_studio_cms_record_heads')
              return c.discovery
            })
            await expect(c.module.prepareManagedTransferExecution(c.value, c.options)).rejects.toMatchObject({ statusCode: change === 'owner' ? 403 : 409 })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_executions')).rows).toEqual([])
          })
          it.each(['target', 'scope', 'freeze', 'runtime', 'extra'])('rejects substituted %s discovery', async (field) => {
            const c = await setup()
            const changed = structuredClone(c.discovery)
            if (field === 'target') changed.sourceTarget.databaseId = randomUUID()
            if (field === 'scope') changed.sourceScope.siteId = randomUUID()
            if (field === 'freeze') changed.freeze.digest = '0'.repeat(64)
            if (field === 'runtime') changed.predecessor.runtimeDigest = '0'.repeat(64)
            c.service.discoverManagedTransferExecution.mockResolvedValue(field === 'extra' ? { ...changed, untrusted: true } : changed)
            await expect(c.module.prepareManagedTransferExecution(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_executions')).rows).toEqual([])
          })
          it('releases native SQL locks across discovery and retains the bound service receiver', async () => {
            const c = await setup()
            c.service.discoverManagedTransferExecution = async function () {
              expect(this).toBe(c.service)
              await db.query('BEGIN')
              try {
                await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
              } finally {
                await db.query('ROLLBACK')
              }
              return c.discovery
            } as never
            await expect(c.module.prepareManagedTransferExecution(c.value, c.options)).resolves.toMatchObject({ state: 'execution-reserved' })
          })
          it('denies substituted execution requests and original owner revocation after reservation', async () => {
            const c = await setup()
            await c.module.prepareManagedTransferExecution(c.value, c.options)
            const saved = (await db.query('SELECT request FROM page_studio_managed_transfer_executions')).rows[0].request
            await expect(c.module.authorizeManagedTransferExecution({ ...saved, successor: { ...saved.successor, scriptName: `ps-content-${'0'.repeat(32)}` } }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
            await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
            await expect(c.module.authorizeManagedTransferExecution(saved, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
          })
          it.each(['staging', 'preview', undefined])('rejects %s coordinator configuration before source discovery', async (environment) => {
            const c = await setup()
            c.options.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = environment as never
            await expect(c.module.prepareManagedTransferExecution(c.value, c.options)).rejects.toMatchObject({ statusCode: 503 })
            expect(c.service.discoverManagedTransferExecution).not.toHaveBeenCalled()
          })
          it.each(['request', 'binding'])('rejects corrupted retained %s digest before authorization', async (field) => {
            const c = await setup()
            await c.module.prepareManagedTransferExecution(c.value, c.options)
            const saved = (await db.query('SELECT request FROM page_studio_managed_transfer_executions')).rows[0].request
            const corrupt = <T>(work: (client: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
              const query = tx.query.bind(tx)
              return work({ query: async (sql: string, params?: unknown[]) => {
                const result = await query(sql, params)
                if (field === 'request' && sql.includes('SELECT request,request_digest FROM page_studio_managed_transfer_executions')) result.rows[0].request_digest = '0'.repeat(64)
                if (field === 'binding' && sql.includes('SELECT binding,binding_digest FROM page_studio_managed_transfer_resource_bindings')) result.rows[0].binding_digest = '0'.repeat(64)
                return result
              } } as pg.Client)
            })
            await expect(c.module.authorizeManagedTransferExecution(saved, { runTransaction: corrupt })).rejects.toMatchObject({ statusCode: field === 'request' ? 403 : 409 })
          })
          it('concurrent reservations retain one exact request and allow a safe retry', async () => {
            const c = await setup()
            const results = await Promise.allSettled([
              c.module.prepareManagedTransferExecution(c.value, c.options),
              c.module.prepareManagedTransferExecution(c.value, c.options)
            ])
            expect(results.some(result => result.status === 'fulfilled')).toBe(true)
            const saved = (await db.query('SELECT request FROM page_studio_managed_transfer_executions')).rows
            expect(saved).toHaveLength(1)
            expect(await c.module.prepareManagedTransferExecution(c.value, c.options)).toEqual({ operationId: c.value.operationId, state: 'execution-reserved' })
            expect((await db.query('SELECT request FROM page_studio_managed_transfer_executions')).rows).toEqual(saved)
          })
          it('keeps reviewed runtime configuration stable on retry', async () => {
            const c = await setup()
            await c.module.prepareManagedTransferExecution(c.value, c.options)
            c.options.env.MANAGED_TRANSFER_EXECUTION_POLICY = JSON.stringify({ ...policy, to: { ...policy.to, digest: '8'.repeat(64) } })
            await expect(c.module.prepareManagedTransferExecution(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
          })
        })
        describe('native resource workflow', () => {
          async function control(value: unknown, action: string, binding: Record<string, unknown> = {}, environment = 'production') {
            const module = await import('~~/server/utils/pageStudio/managedTransferResources')
            return module.coordinateManagedTransferResources({ ...(value as object), action }, {
              runTransaction, artifacts, provider,
              env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: environment, PAGE_STUDIO_PROVISIONER: binding }
            })
          }
          it('reads an unstarted operation without reserving or contacting the provisioner', async () => {
            const value = await prepared()
            const unexpected = vi.fn(async () => {
              throw new Error('Status must not start work')
            })
            expect(await control(value, 'status', { prepareManagedTransferResources: unexpected })).toEqual({ operationId: value.operationId, state: 'not-started' })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resources')).rows).toEqual([])
            expect(unexpected).not.toHaveBeenCalled()
          })
          it('starts from the saved request, keeps prepared status private, and binds only after explicit inspection', async () => {
            const c = await candidate()
            const before = (await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows
            const binding = {
              prepareManagedTransferResources: async (request: unknown, action: string) => {
                expect(action).toBe('start')
                await admission(request)
                return { ...c.value, state: 'prepared', resourceIdentity: c.physical.resourceIdentity,
                  preparationId: c.physical.preparationId, proofDigest: c.physical.preparationDigest }
              },
              inspectManagedTransferResources: c.inspect
            }
            expect(await control(c.value, 'start', binding)).toEqual({ operationId: c.value.operationId, state: 'prepared' })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows).toEqual([])
            expect(await control(c.value, 'verify', binding)).toEqual({ operationId: c.value.operationId, state: 'resources-bound' })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows).toHaveLength(1)
            expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows).toEqual(before)
            expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
          })
          it('retains the original request across an unknown remote outcome and resumes explicitly', async () => {
            const value = await prepared()
            let original: unknown
            const binding = {
              prepareManagedTransferResources: async (request: unknown, action: string) => {
                await admission(request)
                if (action === 'start') {
                  original = structuredClone(request)
                  throw new Error('Lost response')
                }
                expect(request).toEqual(original)
                return { ...value, state: 'preparing' }
              },
              readManagedTransferResources: async (request: unknown) => {
                expect(request).toEqual(original)
                return { ...value, state: 'resume-required' }
              }
            }
            await expect(control(value, 'start', binding)).rejects.toThrow('Lost response')
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resources')).rows).toHaveLength(1)
            expect(await control(value, 'status', binding)).toEqual({ operationId: value.operationId, state: 'resume-required' })
            expect(await control(value, 'resume', binding)).toEqual({ operationId: value.operationId, state: 'preparing' })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows).toEqual([])
          })
          it('never recreates or resumes an already bound resource on start or status', async () => {
            const c = await candidate()
            await bind(c.value, c.inspect)
            for (const action of ['status', 'start', 'resume']) {
              expect(await control(c.value, action)).toEqual({ operationId: c.value.operationId, state: 'resources-bound' })
            }
          })
          it.each(['status', 'start', 'resume', 'verify'])('denies %s outside production before any remote work', async (action) => {
            const value = await prepared()
            await expect(control(value, action, {}, 'staging')).rejects.toMatchObject({ statusCode: 503 })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resources')).rows).toEqual([])
          })
          it('refuses resume without a retained resource request', async () => {
            const value = await prepared()
            await expect(control(value, 'resume')).rejects.toMatchObject({ statusCode: 409 })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resources')).rows).toEqual([])
          })
          it.each(['status', 'start', 'resume', 'verify'])('rechecks original owner before %s reaches the provisioner', async (action) => {
            const c = await candidate()
            const remote = vi.fn(async () => {
              throw new Error('No remote work after revocation')
            })
            await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
            await expect(control(c.value, action, { prepareManagedTransferResources: remote, readManagedTransferResources: remote, inspectManagedTransferResources: remote })).rejects.toMatchObject({ statusCode: 403 })
            expect(remote).not.toHaveBeenCalled()
          })
          it.each(['status', 'start', 'resume'].flatMap(action => ['owner', 'source'].map(change => [action, change])))('rejects %s after %s changes during RPC', async (action, change) => {
            const c = await candidate()
            const remote = async () => {
              await db.query(change === 'owner' ? 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()' : 'UPDATE page_studio_sites SET current_checkpoint_id=NULL')
              return { ...c.value, state: 'preparing' }
            }
            await expect(control(c.value, action, { readManagedTransferResources: remote, prepareManagedTransferResources: remote })).rejects.toMatchObject({ statusCode: change === 'owner' ? 403 : 409 })
          })
          it.each(['identity', 'operation', 'extra'])('rejects substituted %s in remote progress without retaining a binding', async (field) => {
            const c = await candidate()
            const result = { ...c.value, state: 'prepared', resourceIdentity: c.physical.resourceIdentity,
              preparationId: c.physical.preparationId, proofDigest: c.physical.preparationDigest }
            if (field === 'identity') result.resourceIdentity = `cms_attach_${'0'.repeat(64)}`
            if (field === 'operation') result.operationId = randomUUID()
            const binding = { readManagedTransferResources: async () => field === 'extra' ? { ...result, secret: 'must-not-leak' } : result }
            await expect(control(c.value, 'status', binding)).rejects.toMatchObject({ statusCode: 409 })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows).toEqual([])
          })
          it.each(['status', 'start', 'resume'])('releases native SQL locks before %s RPC and preserves its receiver', async (action) => {
            const c = await candidate()
            const binding = {
              marker: 'trusted-service',
              async call(this: { marker: string }) {
                expect(this.marker).toBe('trusted-service')
                await db.query('BEGIN')
                try {
                  await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                } finally {
                  await db.query('ROLLBACK')
                }
                return { ...c.value, state: 'preparing' }
              },
              readManagedTransferResources: undefined as unknown,
              prepareManagedTransferResources: undefined as unknown
            }
            binding.readManagedTransferResources = binding.call
            binding.prepareManagedTransferResources = binding.call
            expect(await control(c.value, action, binding)).toEqual({ operationId: c.value.operationId, state: 'preparing' })
          })
          it('captures the expected request before an RPC adapter can mutate it', async () => {
            const c = await candidate()
            const binding = { readManagedTransferResources: async (request: { operationId: string, intentDigest: string }) => {
              request.operationId = randomUUID()
              return { ...request, state: 'preparing' }
            } }
            await expect(control(c.value, 'status', binding)).rejects.toMatchObject({ statusCode: 409 })
          })
          it('requires the distinct inspector and rejects browser-provided resource evidence', async () => {
            const c = await candidate()
            await expect(control(c.value, 'verify')).rejects.toMatchObject({ statusCode: 503 })
            await expect(control({ ...c.value, physical: c.physical }, 'verify', { inspectManagedTransferResources: c.inspect })).rejects.toMatchObject({ statusCode: 400 })
            expect(c.inspect).not.toHaveBeenCalled()
          })
        })
        it('retains exact independent physical evidence without switching authoring and replays lost acknowledgements', async () => {
          const c = await candidate()
          const before = (await db.query('SELECT environment,state,target,current_application_id FROM page_studio_cms_scopes')).rows
          const first = await bind(c.value, c.inspect)
          expect(first).toMatchObject({ ...c.value, state: 'resources-bound', bindingDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })
          expect(await bind(c.value, c.inspect)).toEqual(first)
          expect(c.inspect).toHaveBeenCalledTimes(2)
          const rows = (await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows
          expect(rows).toHaveLength(1)
          expect(rows[0].binding.physical).toEqual(c.physical)
          expect(rows[0].binding.destinationGeneration).toBe((await db.query('SELECT destination_generation FROM page_studio_managed_transfer_intents')).rows[0].destination_generation)
          expect(rows[0].binding_digest).toBe(await collectionDigest(rows[0].binding))
          expect(JSON.stringify(first)).not.toContain('etag')
          expect((await db.query('SELECT environment,state,target,current_application_id FROM page_studio_cms_scopes')).rows).toEqual(before)
          await expect(db.query('UPDATE page_studio_managed_transfer_resource_bindings SET binding=\'{}\'')).rejects.toThrow(/immutable/i)
          await expect(db.query('DELETE FROM page_studio_managed_transfer_resource_bindings')).rejects.toThrow(/immutable/i)
        })
        it('cannot inspect unreserved resources or accept browser-provided evidence', async () => {
          const value = await prepared()
          const inspect = vi.fn(async () => ({}))
          await expect(bind(value, inspect)).rejects.toMatchObject({ statusCode: 403 })
          await expect(bind({ ...value, physical: {} }, inspect)).rejects.toMatchObject({ statusCode: 400 })
          expect(inspect).not.toHaveBeenCalled()
        })
        it.each(['operation', 'intent', 'identity', 'account', 'database', 'schema', 'runtime', 'scope', 'namespace', 'compatibility', 'setup', 'source-database', 'extra'])(
          'refuses substituted physical %s', async (field) => {
            const c = await candidate()
            const proof = structuredClone(c.physical)
            if (field === 'operation') proof.operationId = randomUUID()
            if (field === 'intent') proof.intentDigest = '0'.repeat(64)
            if (field === 'identity') proof.resourceIdentity = `cms_attach_${'0'.repeat(64)}`
            if (field === 'account') proof.worker.accountId = '0'.repeat(32)
            if (field === 'database') proof.worker.databaseId = randomUUID()
            if (field === 'schema') proof.database.schemaDigest = '0'.repeat(64)
            if (field === 'runtime') proof.worker.runtimeDigest = '0'.repeat(64)
            if (field === 'scope') proof.worker.scope.siteId = randomUUID()
            if (field === 'namespace') proof.worker.namespace = 'xeroflow-page-studio-dispatch-staging'
            if (field === 'compatibility') proof.worker.compatibilityDate = '2026-01-01'
            if (field === 'setup') proof.worker.setupDigest = '0'.repeat(64)
            if (field === 'source-database') {
              const target = (await db.query('SELECT target FROM page_studio_cms_scopes')).rows[0].target
              proof.database.databaseId = target.databaseId
              proof.worker.databaseId = target.databaseId
            }
            await expect(bind(c.value, async () => field === 'extra' ? { ...proof, secret: 'unexpected' } : proof)).rejects.toMatchObject({ statusCode: 409 })
            expect((await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows).toEqual([])
          })
        it.each([
          'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
          'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
          'UPDATE page_studio_cms_scopes SET current_content_id=NULL',
          'DELETE FROM page_studio_cms_record_heads'
        ])('rechecks original authority and source after provider inspection: %s', async (sql) => {
          const c = await candidate()
          await expect(bind(c.value, async () => {
            await db.query(sql)
            return c.physical
          })).rejects.toMatchObject({ statusCode: expect.any(Number) })
          expect((await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows).toEqual([])
        })
        it('does not replace a retained target on retry', async () => {
          const c = await candidate()
          const first = await bind(c.value, c.inspect)
          const changed = structuredClone(c.physical)
          changed.database.databaseId = randomUUID()
          changed.worker.databaseId = changed.database.databaseId
          await expect(bind(c.value, async () => changed)).rejects.toMatchObject({ statusCode: 409 })
          expect(await bind(c.value, c.inspect)).toEqual(first)
        })
        it('rolls back binding if a selected head changes during the final native transaction', async () => {
          const c = await candidate()
          const changed = <T>(work: (client: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
            const query = tx.query.bind(tx)
            return work({ query: async (sql: string, params?: unknown[]) => {
              const result = await query(sql, params)
              if (sql.includes('INSERT INTO page_studio_managed_transfer_resource_bindings')) await query('DELETE FROM page_studio_cms_record_heads')
              return result
            } } as pg.Client)
          })
          await expect(bind(c.value, c.inspect, changed)).rejects.toMatchObject({ statusCode: 409 })
          expect((await db.query('SELECT * FROM page_studio_managed_transfer_resource_bindings')).rows).toEqual([])
          expect((await db.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
        })
      })
      it('does not admit a resource request before it has been retained', async () => {
        const value = await prepared()
        await expect(admission({ ...value, resourceRequest: { ...artifacts, version: 1, mode: 'attach-existing-content', operationId: `transfer_${value.operationId}`,
          actor: { kind: 'agency-user', userId: actorId, loginSessionHash: operatorHash },
          anchor: { checkpointId: 'checkpoint_a', digest: 'c'.repeat(64) },
          scope: { tenantId: expected.tenantId, clientId: expected.businessId, businessId: expected.businessId, siteId: input.siteId, environment: 'production' } } })).rejects.toMatchObject({ statusCode: 403 })
      })
    })
  })
})
