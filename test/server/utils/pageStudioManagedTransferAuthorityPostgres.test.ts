import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
    const pin = (kind: string, version = 1) => ({ kind, collectionId: kind === 'content' ? '' : 'products', recordId: kind === 'record' ? 'first' : '',
      version, bytes: 30, freezeDigest: 'f'.repeat(64), operationId: 'adoption_a', origin: 'legacy', sha256: 'a'.repeat(64) })
    beforeAll(async () => {
      const path = 'server/database/migrations/457_page_studio_managed_transfer_intents.sql'
      await db.query(readFileSync(path, 'utf8'))
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
      await db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest)
        VALUES($1,$2,$3,$3,$4,'staging','legacy','adoption_a',$5,$6,$7)`, [key, scope.tenantId, scope.clientId, scope.siteId, generation,
        { accountId: 'a'.repeat(32), databaseId: randomUUID(), name: `ps-content-${'b'.repeat(32)}`, routeId: 'route_a', runtimeDigest: 'a'.repeat(64),
          collectionReceiptDigest: 'b'.repeat(64), workflowReceiptDigest: 'c'.repeat(64), stagingReceiptDigest: 'd'.repeat(64) }, 'f'.repeat(64)])
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
  })
})
