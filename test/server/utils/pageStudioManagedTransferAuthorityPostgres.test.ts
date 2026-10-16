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
      await db.query(readFileSync('server/database/migrations/458_page_studio_managed_transfer_resources.sql', 'utf8'))
      await db.query(readFileSync('server/database/migrations/459_page_studio_managed_transfer_resource_bindings.sql', 'utf8'))
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
