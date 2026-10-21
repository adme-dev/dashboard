import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import type { CmsFreezeReceiptSchema } from '~~/shared/pageStudio/cmsManaged'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'

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
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN);
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
  it.each(['owner', 'admin'])('accepts a normal assigned system %s role', async (role) => {
    const roleId = randomUUID()
    await db.query('INSERT INTO custom_roles(id,slug,is_system) VALUES($1,$2,TRUE)', [roleId, role])
    await db.query('UPDATE team_members SET user_role=$1,custom_role_id=$2 WHERE id=$3', [role, roleId, actorId])
    await expect(transfer()).resolves.toBeDefined()
  })
  it.each([{ slug: 'owner', system: false }, { slug: 'admin', system: true }, { slug: 'member', system: true }])(
    'rejects a custom or mismatched assigned role: %j', async ({ slug, system }) => {
      const roleId = randomUUID()
      await db.query('INSERT INTO custom_roles(id,slug,is_system) VALUES($1,$2,$3)', [roleId, slug, system])
      await db.query('UPDATE team_members SET custom_role_id=$1 WHERE id=$2', [roleId, actorId])
      await expect(transfer()).rejects.toMatchObject({ statusCode: 403 })
    })
  it('allows a current built-in platform admin', async () => {
    await db.query('UPDATE team_members SET user_role=\'admin\'')
    await expect(transfer()).resolves.toMatchObject({ operatorId: actorId })
  })
  it('refuses a concurrently changing assigned system role without waiting', async () => {
    const roleId = randomUUID()
    await db.query('INSERT INTO custom_roles(id,slug,is_system) VALUES($1,\'owner\',TRUE)', [roleId])
    await db.query('UPDATE team_members SET custom_role_id=$1 WHERE id=$2', [roleId, actorId])
    await db.query('BEGIN')
    try {
      await db.query('SELECT id FROM custom_roles WHERE id=$1 FOR UPDATE', [roleId])
      await expect(transfer()).rejects.toMatchObject({ statusCode: 503 })
    } finally { await db.query('ROLLBACK') }
  })
  it.each(['is_system=FALSE', 'slug=\'member\''])(
    'rolls back effects if the assigned system role changes: %s', async (change) => {
      const roleId = randomUUID()
      await db.query('INSERT INTO custom_roles(id,slug,is_system) VALUES($1,\'owner\',TRUE)', [roleId])
      await db.query('UPDATE team_members SET custom_role_id=$1 WHERE id=$2', [roleId, actorId])
      await expect(transfer({}, async (tx) => {
        await tx.query('INSERT INTO transfer_effects VALUES(\'must roll back\')')
        await tx.query(`UPDATE custom_roles SET ${change} WHERE id=$1`, [roleId])
      })).rejects.toMatchObject({ statusCode: 403 })
      expect((await db.query('SELECT * FROM transfer_effects')).rows).toEqual([])
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
    describe('original intent authority for terminal selection', () => {
      async function original() {
        const value = await request(), saved = await reserve(value)
        const module = await import('~~/server/utils/pageStudio/managedTransferIntent')
        return { reference: { operationId: value.operationId, intentDigest: saved.intentDigest }, module }
      }
      it('can resolve original authority after source authoring ends without reopening nonterminal phases', async () => {
        const c = await original()
        await db.query('UPDATE page_studio_cms_scopes SET state=\'blocked\'')
        const intent = await c.module.withManagedTransferIntentAuthority(c.reference, async (_tx, value) => value, { runTransaction })
        expect(intent.operationId).toBe(c.reference.operationId)
        expect(intent.authority.owner.identityId).toBe(expected.identityId)
        await expect(c.module.withReservedManagedTransfer(c.reference, async () => 'invalid', { runTransaction })).rejects.toThrow()
      })
      it('explicitly checks the complete original source before terminal work and rolls back a changed source', async () => {
        const c = await original()
        await expect(c.module.withManagedTransferIntentAuthority(c.reference, async (tx, intent) => {
          await c.module.assertManagedTransferSource(tx, intent)
          await tx.query('DELETE FROM page_studio_cms_record_heads')
          await tx.query('INSERT INTO transfer_effects VALUES(\'invalid\')')
          await c.module.assertManagedTransferSource(tx, intent)
        }, { runTransaction })).rejects.toMatchObject({ statusCode: 409 })
        expect((await db.query('SELECT * FROM transfer_effects')).rows).toEqual([])
        expect((await db.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      })
      it.each(['owner', 'operator', 'plan'])('refuses changed original %s authority before terminal recovery', async (kind) => {
        const c = await original(), work = vi.fn()
        await db.query(kind === 'plan'
          ? 'UPDATE page_studio_entitlements SET storage_bytes_limit=storage_bytes_limit+1 WHERE status=\'active\''
          : `UPDATE ${kind === 'owner' ? 'page_studio_customer_sessions' : 'page_studio_login_sessions'} SET revoked_at=clock_timestamp()`)
        await expect(c.module.withManagedTransferIntentAuthority(c.reference, work, { runTransaction })).rejects.toThrow()
        expect(work).not.toHaveBeenCalled()
      })
      it('rolls back terminal effects if original authority is revoked inside the transaction', async () => {
        const c = await original()
        await expect(c.module.withManagedTransferIntentAuthority(c.reference, async (tx) => {
          await tx.query('INSERT INTO transfer_effects VALUES(\'invalid\')')
          await tx.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
        }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
        expect((await db.query('SELECT * FROM transfer_effects')).rows).toEqual([])
      })
      it('preserves nonterminal postconditions when its consumer mutates a detached intent', async () => {
        const c = await original()
        await expect(c.module.withReservedManagedTransfer(c.reference, async (tx, intent) => {
          await tx.query('DELETE FROM page_studio_cms_record_heads')
          intent.source.recordHeads = []
        }, { runTransaction })).rejects.toMatchObject({ statusCode: 409 })
        expect((await db.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
      })
      it('rejects a substituted terminal intent digest before work', async () => {
        const c = await original(), work = vi.fn()
        await expect(c.module.withManagedTransferIntentAuthority({ ...c.reference, intentDigest: '0'.repeat(64) }, work, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
        expect(work).not.toHaveBeenCalled()
      })
    })
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
      it.each([
        'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
        'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
        'UPDATE page_studio_workspace_memberships SET role=\'manager\'',
        'UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()-interval \'1 second\'',
        'UPDATE page_studio_entitlements SET storage_bytes_limit=storage_bytes_limit+1 WHERE status=\'active\'',
        'UPDATE page_studio_cms_scopes SET current_content_id=NULL',
        'UPDATE page_studio_sites SET current_checkpoint_id=NULL'
      ])('placed authority matches direct fresh admission before and after revocation: %s', async (sql) => {
        const reference = await prepared()
        await prepare(reference)
        const resourceRequest = (await db.query('SELECT request FROM page_studio_managed_transfer_resources')).rows[0].request
        const execution = { ...reference, resourceRequest }
        const envelope = { expectedControlPlaneEnvironment: 'production', execution }
        const { handleManagedTransferResourceAuthorityFetch } = await import('~~/workers/page-studio-management/src/managedTransferResourceAuthority')
        const invoke = () => handleManagedTransferResourceAuthorityFetch(new Request('https://page-studio-management.internal/managed-transfer-resource-authority', {
          method: 'POST', body: JSON.stringify(envelope)
        }), { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }, runTransaction)
        const accepted = await invoke()
        expect(accepted.status).toBe(200)
        expect(accepted.headers.get('x-request-digest')).toBe(await collectionDigest(envelope))
        expect(await accepted.json()).toEqual(await admission(execution))
        await db.query(sql)
        let directStatus: unknown
        try {
          await admission(execution)
        } catch (error) {
          directStatus = (error as { statusCode?: number }).statusCode
        }
        expect([403, 409]).toContain(directStatus)
        const denied = await invoke()
        expect(denied.status).toBe(directStatus)
        expect(denied.headers.get('x-request-digest')).toBe(await collectionDigest(envelope))
        expect(await denied.json()).toBe('Managed transfer resource authority unavailable')
      })
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
            describe('prepared destination execution authority', () => {
              const policy = { version: 1, kind: 'managed-draft-import', accountId: 'a'.repeat(32),
                namespace: 'xeroflow-page-studio-dispatch-production',
                from: { compatibilityDate: '2026-08-18', digest: 'd'.repeat(64) },
                to: { compatibilityDate: '2026-08-18', digest: '8'.repeat(64) } }
              beforeAll(async () => {
                // Only the disposable test schema receives this unapplied migration.
                const file = 'server/database/migrations/464_page_studio_managed_transfer_destination_executions.sql'
                await db.query(readFileSync(file, 'utf8'))
              })
              async function setup(verified = true) {
                const c = await catalogueSetup()
                const catalogue = await c.module.prepareManagedTransferDestinationCatalogue(c.value, c.options)
                const proof = await ready(catalogue)
                if (verified) await coordinate(c, 'verify', { inspectManagedTransferDestinationCatalogue: async () => proof })
                const module = await import('~~/server/utils/pageStudio/managedTransferDestinationExecution')
                const options = { runTransaction, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
                  MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify(policy) } }
                return { ...c, catalogue, proof, module, options }
              }
              type ExecutionRequest = Awaited<ReturnType<typeof import('~~/server/utils/pageStudio/managedTransferDestinationExecution')['prepareManagedTransferDestinationExecution']>>
              async function executionReady(request: ExecutionRequest) {
                const freezeBody = { state: 'frozen', request: structuredClone(request.freezeRequest), createdAt: '2026-10-16T00:00:00.000Z' }
                const freeze = { ...freezeBody, digest: await collectionDigest(freezeBody) }
                const { etag: _etag, ...predecessor } = request.catalogueRequest.baseline.worker
                const catalogue = request.catalogueReceipt
                const route = { activationId: request.catalogueRequest.baseline.preparationId,
                  formDrafts: { digest: catalogue.receiptDigests.forms, receipt: catalogue.receipts.forms },
                  namespace: predecessor.namespace, receipts: { collection: catalogue.receipts.collection, workflow: catalogue.receipts.workflow, staging: catalogue.receipts.staging },
                  scope: request.freezeRequest.scope, scriptName: predecessor.scriptName, target: request.freezeRequest.target }
                const schemaBody = { formatVersion: 1, kind: 'draft-history-import', operationId: `transfer_${request.operationId}_destination_import`,
                  nativeIntentDigest: request.intentDigest, predecessor: catalogue.receipts.forms,
                  schemaDigest: '65fbb83440cd62ebc9165006a6a25daa414212181209c06e7be771a624434680' }
                const executionBody = { formatVersion: 1, freeze, originalRouteDigest: await collectionDigest(route), owner: structuredClone(request.successor),
                  policy: structuredClone(request.policy), predecessor, schemaReceipt: { ...schemaBody, digest: await collectionDigest(schemaBody) }, workerReceipt: { etag: 'actual-successor-etag' } }
                const identity = await collectionDigest(executionBody)
                const proofBody = { formatVersion: 1, operationId: request.operationId, intentDigest: request.intentDigest,
                  requestDigest: await collectionDigest(request), catalogueReceiptDigest: catalogue.digest,
                  envelope: { kind: 'managed-execution', route, execution: { ...executionBody, identity } } }
                return { operationId: request.operationId, intentDigest: request.intentDigest, requestDigest: proofBody.requestDigest,
                  state: 'ready', identity, proof: { ...proofBody, digest: await collectionDigest(proofBody) } }
              }
              describe('prepared destination execution coordinator', () => {
                beforeAll(async () => {
                  await db.query(readFileSync('server/database/migrations/465_page_studio_managed_transfer_destination_execution_verifications.sql', 'utf8'))
                })
                async function executionCoordinate(c: Awaited<ReturnType<typeof setup>>, action: string, methods: Record<string, unknown> = {}, transaction = runTransaction) {
                  const { coordinateManagedTransferDestinationExecution } = await import('~~/server/utils/pageStudio/managedTransferDestinationExecutionCoordinator')
                  return coordinateManagedTransferDestinationExecution({ ...c.value, action }, { ...c.options, runTransaction: transaction,
                    env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: methods } })
                }
                async function verificationRows() {
                  return (await db.query('SELECT * FROM page_studio_managed_transfer_destination_execution_verifications')).rows
                }
                it('uses the captured callable without invoking remote bind or call properties', async () => {
                  const c = await setup()
                  const method = Object.assign(executionReady, {
                    bind: () => { throw new Error('Remote bind is not local') },
                    call: () => { throw new Error('Remote call is not local') }
                  })
                  expect(await executionCoordinate(c, 'start', { prepareManagedTransferDestinationExecution: method })).toEqual({ operationId: c.value.operationId, state: 'ready' })
                })
                it('rejects a missing inspection result without retaining evidence', async () => {
                  const c = await setup()
                  await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  await expect(executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: async () => null })).rejects.toMatchObject({ statusCode: 409 })
                  expect(await verificationRows()).toEqual([])
                })
                it('serializes concurrent explicit verification and returns the exact original proof on retry', async () => {
                  const c = await setup()
                  await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const methods = { inspectManagedTransferDestinationExecution: executionReady }
                  const attempts = await Promise.allSettled([executionCoordinate(c, 'verify', methods), executionCoordinate(c, 'verify', methods)])
                  expect(attempts.some(result => result.status === 'fulfilled')).toBe(true)
                  for (const result of attempts) if (result.status === 'rejected') expect(result.reason).toMatchObject({ statusCode: 503 })
                  const rows = await verificationRows()
                  expect(rows).toHaveLength(1)
                  expect(await executionCoordinate(c, 'verify', methods)).toEqual({ operationId: c.value.operationId, state: 'execution-verified' })
                  expect(await verificationRows()).toEqual(rows)
                })
                it('rejects corrupt retained proof even on read-only status', async () => {
                  const c = await setup()
                  await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  await executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: executionReady })
                  await db.query('ALTER TABLE page_studio_managed_transfer_destination_execution_verifications DISABLE TRIGGER USER')
                  try {
                    await db.query('UPDATE page_studio_managed_transfer_destination_execution_verifications SET proof_json=\' \' || proof_json')
                  } finally { await db.query('ALTER TABLE page_studio_managed_transfer_destination_execution_verifications ENABLE TRIGGER USER') }
                  await expect(executionCoordinate(c, 'status', { readManagedTransferDestinationExecution: executionReady })).rejects.toMatchObject({ statusCode: 409 })
                })
                it('rejects SQL proof admission detached from its original request digest', async () => {
                  const c = await setup()
                  const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const observed = await executionReady(request)
                  observed.proof.requestDigest = '0'.repeat(64)
                  const { digest: _, ...body } = observed.proof
                  observed.proof.digest = await collectionDigest(body)
                  const json = JSON.stringify(observed.proof)
                  await expect(db.query(`INSERT INTO page_studio_managed_transfer_destination_execution_verifications
                    (operation_id,intent_digest,request_digest,execution_identity,proof,proof_json,proof_digest)
                    VALUES($1,$2,$3,$4,$5::jsonb,$5,$6)`, [c.value.operationId, c.value.intentDigest, observed.proof.requestDigest,
                    observed.identity, json, observed.proof.digest])).rejects.toThrow(/does not match retained request/i)
                })
                it('status does not reserve and resume/verify cannot invent original admission', async () => {
                  const c = await setup()
                  expect(await executionCoordinate(c, 'status')).toEqual({ operationId: c.value.operationId, state: 'not-started' })
                  for (const action of ['resume', 'verify']) await expect(executionCoordinate(c, action)).rejects.toMatchObject({ statusCode: 409 })
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_destination_executions')).rows).toEqual([])
                })
                it.each(['status', 'start', 'resume', 'verify'])('performs %s outside native locks and only explicit inspect retains proof', async (action) => {
                  const c = await setup()
                  if (action !== 'start') await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const method = action === 'status' ? 'readManagedTransferDestinationExecution' : action === 'verify' ? 'inspectManagedTransferDestinationExecution' : 'prepareManagedTransferDestinationExecution'
                  let proof: Awaited<ReturnType<typeof executionReady>> | undefined
                  const methods = { trusted: true, [method]: async function (this: { trusted: boolean }, request: ExecutionRequest, mode?: string) {
                    expect(this.trusted).toBe(true)
                    expect(mode).toBe(['start', 'resume'].includes(action) ? action : undefined)
                    expect(request).toEqual((await db.query('SELECT request FROM page_studio_managed_transfer_destination_executions')).rows[0].request)
                    await db.query('BEGIN')
                    try {
                      await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                    } finally { await db.query('ROLLBACK') }
                    proof = await executionReady(request)
                    return proof
                  } }
                  expect(await executionCoordinate(c, action, methods)).toEqual({ operationId: c.value.operationId, state: action === 'verify' ? 'execution-verified' : 'ready' })
                  const rows = await verificationRows()
                  expect(rows).toHaveLength(action === 'verify' ? 1 : 0)
                  if (action === 'verify') {
                    expect(rows[0]).toMatchObject({ proof: proof!.proof, proof_digest: proof!.proof.digest, execution_identity: proof!.identity })
                    expect(await executionCoordinate(c, action, methods)).toEqual({ operationId: c.value.operationId, state: 'execution-verified' })
                    await expect(db.query('DELETE FROM page_studio_managed_transfer_destination_execution_verifications')).rejects.toThrow(/immutable/i)
                    await expect(db.query('UPDATE page_studio_managed_transfer_destination_execution_verifications SET proof_digest=$1', ['0'.repeat(64)])).rejects.toThrow(/immutable/i)
                  }
                  expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
                  expect((await db.query('SELECT current_checkpoint_id,status FROM page_studio_sites')).rows).toEqual([{ current_checkpoint_id: 'checkpoint_a', status: 'draft' }])
                })
                it.each(['pending', 'resume-required', 'upload-uncertain', 'disabled'])('never turns %s into native verification', async (state) => {
                  const c = await setup()
                  const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const observed = { ...c.value, requestDigest: await collectionDigest(request), state }
                  expect(await executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: async () => observed })).toEqual({ operationId: c.value.operationId, state })
                  expect(await verificationRows()).toEqual([])
                })
                it.each(['request', 'freeze-request', 'freeze-digest', 'route', 'import-operation', 'import-layout', 'owner', 'identity', 'proof-digest', 'extra'])('rejects substituted or rehashed %s evidence', async (field) => {
                  const c = await setup(), request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const observed = await executionReady(request), proof = observed.proof, execution = proof.envelope.execution
                  if (field === 'request') observed.requestDigest = '0'.repeat(64)
                  if (field === 'freeze-request') execution.freeze.request.adoptionId = 'transfer_other_destination'
                  if (field === 'freeze-digest') execution.freeze.digest = '0'.repeat(64)
                  if (field === 'route') proof.envelope.route.target.runtimeDigest = request.successor.runtimeDigest
                  if (field === 'import-operation') execution.schemaReceipt.operationId = 'transfer_other_destination_import'
                  if (field === 'import-layout') execution.schemaReceipt.schemaDigest = '0'.repeat(64)
                  if (field === 'owner') execution.owner.scriptName = `ps-content-${'0'.repeat(32)}`
                  if (field === 'extra') Object.assign(proof.envelope.route, { capability: 'browser-picked' })
                  // Rehash nested layers to prove admission checks semantics, not only hashes.
                  if (field !== 'freeze-digest') {
                    const { digest: _, ...body } = execution.freeze
                    execution.freeze.digest = await collectionDigest(body)
                  }
                  const { digest: _schema, ...schemaBody } = execution.schemaReceipt
                  execution.schemaReceipt.digest = await collectionDigest(schemaBody)
                  execution.originalRouteDigest = await collectionDigest(proof.envelope.route)
                  const { identity: _, ...executionBody } = execution
                  observed.identity = execution.identity = field === 'identity' ? '0'.repeat(64) : await collectionDigest(executionBody)
                  const { digest: _proof, ...proofBody } = proof
                  proof.digest = field === 'proof-digest' ? '0'.repeat(64) : await collectionDigest(proofBody)
                  await expect(executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: async () => observed })).rejects.toMatchObject({ statusCode: 409 })
                  expect(await verificationRows()).toEqual([])
                })
                it('detaches the original request from hostile RPC argument mutation', async () => {
                  const c = await setup()
                  expect(await executionCoordinate(c, 'start', { prepareManagedTransferDestinationExecution: async (request: ExecutionRequest) => {
                    const observed = await executionReady(request)
                    request.successor.scriptName = `ps-content-${'0'.repeat(32)}`
                    return observed
                  } })).toEqual({ operationId: c.value.operationId, state: 'ready' })
                  expect(await verificationRows()).toEqual([])
                })
                it('retains the exact admission across a lost RPC response', async () => {
                  const c = await setup()
                  let original: ExecutionRequest | undefined
                  await expect(executionCoordinate(c, 'start', { prepareManagedTransferDestinationExecution: async (request: ExecutionRequest) => {
                    original = request
                    throw new Error('Lost remote acknowledgement')
                  } })).rejects.toThrow('Lost remote acknowledgement')
                  expect(await executionCoordinate(c, 'resume', { prepareManagedTransferDestinationExecution: async (request: ExecutionRequest) => {
                    expect(request).toEqual(original)
                    return executionReady(request)
                  } })).toEqual({ operationId: c.value.operationId, state: 'ready' })
                })
                it.each(['UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
                  'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()', 'DELETE FROM page_studio_cms_record_heads'])('rejects late authority/source change: %s', async (sql) => {
                  const c = await setup()
                  await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  await expect(executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: async (request: ExecutionRequest) => {
                    const observed = await executionReady(request)
                    await db.query(sql)
                    return observed
                  } })).rejects.toMatchObject({ statusCode: expect.any(Number) })
                  expect(await verificationRows()).toEqual([])
                })
                it('rejects original session revocation even after prior verified evidence', async () => {
                  const c = await setup()
                  await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const remote = vi.fn(executionReady)
                  await executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: remote })
                  await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
                  await expect(executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: remote })).rejects.toMatchObject({ statusCode: 403 })
                  expect(remote).toHaveBeenCalledTimes(1)
                })
                it('rejects a rehashed alternate actual etag after retaining original proof', async () => {
                  const c = await setup()
                  const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const observed = await executionReady(request)
                  await executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: async () => observed })
                  observed.proof.envelope.execution.workerReceipt.etag = 'different-successor-etag'
                  const { identity: _, ...executionBody } = observed.proof.envelope.execution
                  observed.identity = observed.proof.envelope.execution.identity = await collectionDigest(executionBody)
                  const { digest: __, ...proofBody } = observed.proof
                  observed.proof.digest = await collectionDigest(proofBody)
                  await expect(executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: async () => observed })).rejects.toMatchObject({ statusCode: 409 })
                  expect(await verificationRows()).toHaveLength(1)
                })
                it('rolls back evidence if original source changes during native retention', async () => {
                  const c = await setup()
                  await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const changed = <T>(work: (tx: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
                    const query = tx.query.bind(tx)
                    const wrapped = { query: async (sql: string, params?: unknown[]) => {
                      const result = await query(sql, params)
                      if (sql.includes('INSERT INTO page_studio_managed_transfer_destination_execution_verifications')) await query('DELETE FROM page_studio_cms_record_heads')
                      return result
                    } }
                    return work(wrapped as pg.Client)
                  })
                  await expect(executionCoordinate(c, 'verify', { inspectManagedTransferDestinationExecution: executionReady }, changed)).rejects.toMatchObject({ statusCode: 409 })
                  expect(await verificationRows()).toEqual([])
                })
              })
              describe('immutable Forms history admission', () => {
                beforeAll(async () => {
                  await db.query(readFileSync('server/database/migrations/465_page_studio_managed_transfer_destination_execution_verifications.sql', 'utf8'))
                })
                async function historySetup(verified = true) {
                  const c = await setup()
                  const execution = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const observed = await executionReady(execution)
                  if (verified) {
                    const { coordinateManagedTransferDestinationExecution } = await import('~~/server/utils/pageStudio/managedTransferDestinationExecutionCoordinator')
                    await coordinateManagedTransferDestinationExecution({ ...c.value, action: 'verify' }, { ...c.options,
                      env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferDestinationExecution: async () => observed } } })
                  }
                  const scope = sourceFreeze.request.scope, target = sourceFreeze.request.target
                  const sourcePolicy = { version: 1, kind: 'managed-draft-transfer', accountId: target.accountId,
                    namespace: 'xeroflow-page-studio-dispatch-staging', from: { compatibilityDate: '2026-08-18', digest: target.runtimeDigest },
                    to: { compatibilityDate: '2026-08-18', digest: '9'.repeat(64) } }
                  const predecessor = { accountId: target.accountId, databaseId: target.databaseId, scope,
                    namespace: sourcePolicy.namespace, scriptName: `ps-content-${'5'.repeat(32)}`, ownerTag: `ps-owner-${'6'.repeat(32)}`,
                    runtimeDigest: target.runtimeDigest, compatibilityDate: sourcePolicy.from.compatibilityDate, setupDigest: '7'.repeat(64) }
                  const formReceipt = { operationId: 'forms_a', collectionOperationId: 'collection_a', workflowOperationId: 'workflow_a', stagingOperationId: 'staging_a',
                    scope, accountId: target.accountId, databaseId: target.databaseId, name: target.name,
                    sourceDigest: '863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e', targetDigest: 'c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2' }
                  const { prepareManagedTransferExecution } = await import('~~/server/utils/pageStudio/managedTransferExecution')
                  await prepareManagedTransferExecution(c.value, { runTransaction, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
                    MANAGED_TRANSFER_EXECUTION_POLICY: JSON.stringify(sourcePolicy), PAGE_STUDIO_PROVISIONER: { discoverManagedTransferExecution: async () => ({
                      formatVersion: 1, ...c.value, sourceScope: scope, sourceTarget: target, freezeDigest: sourceFreeze.digest, predecessor, freeze: sourceFreeze, formReceipt }) } } })
                  const { prepareManagedTransferSourceDrafts } = await import('~~/server/utils/pageStudio/managedTransferSourceDrafts')
                  const sourceRequest = await prepareManagedTransferSourceDrafts(c.value, { runTransaction, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
                    PAGE_STUDIO_PROVISIONER: { inspectManagedTransferExecution: async () => ({ ...c.value, state: 'ready', identity: '1'.repeat(64) }) } } })
                  const fenceBody = { state: 'frozen', request: sourceRequest.fenceIntent, identityDigest: await collectionDigest(sourceRequest.fenceIntent) }
                  const fence = { ...fenceBody, digest: await collectionDigest(fenceBody) }
                  const { formsHistoryFixture } = await import('../../helpers/pageStudio/formsHistory')
                  const history = await formsHistoryFixture(scope, fence.digest)
                  const readFence = vi.fn(async () => structuredClone(fence)), readHistory = vi.fn(async () => structuredClone(history))
                  const options = { ...c.options, env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: {
                    readManagedTransferSourceDraftsFence: readFence, readManagedTransferSourceDraftsHistory: readHistory } } }
                  const module = await import('~~/server/utils/pageStudio/managedTransferFormsHistory')
                  await db.query(readFileSync('server/database/migrations/467_page_studio_managed_transfer_forms_history_requests.sql', 'utf8'))
                  return { ...c, module, options, sourceRequest, execution, observed, fence, history, readFence, readHistory }
                }
                it('private preparation transport starts Forms history through both source read bindings', async () => {
                  const c = await historySetup()
                  const { handleManagedTransferPreparation } = await import('~~/workers/page-studio-management/src/managedTransferPreparation')
                  const prepare = vi.fn(async (request: unknown) => {
                    const saved = await c.module.readManagedTransferFormsHistoryAdmission(c.value, c.options)
                    return { ...c.value, requestDigest: await collectionDigest(request), state: 'ready', receipt: saved!.expectedReceipt }
                  })
                  const env = { ...c.options.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
                    PAGE_STUDIO_PROVISIONER: { ...c.options.env.PAGE_STUDIO_PROVISIONER, prepareManagedTransferFormsHistory: prepare } }
                  expect(await handleManagedTransferPreparation({ ...c.value, phase: 'forms-history', action: 'start', expectedEnvironment: 'production' }, env, runTransaction))
                    .toMatchObject({ ok: true, value: { operationId: c.value.operationId, state: 'ready' } })
                  expect(c.readHistory).toHaveBeenCalledTimes(1)
                  expect(prepare).toHaveBeenCalledTimes(1)
                })
                describe('Forms history coordinator', () => {
                  beforeAll(async () => {
                    await db.query(readFileSync('server/database/migrations/467_page_studio_managed_transfer_forms_history_requests.sql', 'utf8'))
                  })
                  async function preparedHistory() {
                    const c = await historySetup()
                    const request = await c.module.prepareManagedTransferFormsHistory(c.value, c.options)
                    const saved = await c.module.readManagedTransferFormsHistoryAdmission(c.value, c.options)
                    const ready = { operationId: request.operationId, intentDigest: request.intentDigest, requestDigest: await collectionDigest(request), state: 'ready', receipt: saved!.expectedReceipt }
                    const module = await import('~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator')
                    await db.query(readFileSync('server/database/migrations/469_page_studio_managed_transfer_forms_history_verifications.sql', 'utf8'))
                    return { ...c, coordinator: module, request, ready }
                  }
                  async function coordinateHistory(c: Awaited<ReturnType<typeof preparedHistory>>, action: string, service: Record<string, unknown>) {
                    return c.coordinator.coordinateManagedTransferFormsHistory({ ...c.value, action }, { ...c.options, env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: service } })
                  }
                  it('status cannot reserve and resume/verify require an original admission', async () => {
                    const c = await historySetup(), unexpected = vi.fn()
                    const module = await import('~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator')
                    await db.query(readFileSync('server/database/migrations/469_page_studio_managed_transfer_forms_history_verifications.sql', 'utf8'))
                    const options = { ...c.options, env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: { readManagedTransferFormsHistory: unexpected } } }
                    expect(await module.coordinateManagedTransferFormsHistory({ ...c.value, action: 'status' }, options)).toEqual({ operationId: c.value.operationId, state: 'not-started' })
                    for (const action of ['resume', 'verify']) await expect(module.coordinateManagedTransferFormsHistory({ ...c.value, action }, options)).rejects.toMatchObject({ statusCode: 409 })
                    expect(unexpected).not.toHaveBeenCalled()
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_requests')).rows).toEqual([])
                  })
                  it.each(['status', 'start', 'resume'])('keeps %s ready as progress without verified retention', async (action) => {
                    const c = await preparedHistory(), method = vi.fn(async () => c.ready)
                    const status = await coordinateHistory(c, action, { readManagedTransferFormsHistory: method, prepareManagedTransferFormsHistory: method })
                    expect(status).toEqual({ operationId: c.value.operationId, state: 'ready' })
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_verifications')).rows).toEqual([])
                    if (action !== 'status') expect(method).toHaveBeenCalledWith(c.request, action)
                  })
                  it('uses distinct independent inspect and retains one exact immutable verified result', async () => {
                    const c = await preparedHistory(), inspect = vi.fn(async () => structuredClone(c.ready)), unexpected = vi.fn()
                    const service = { inspectManagedTransferFormsHistory: inspect, prepareManagedTransferFormsHistory: unexpected }
                    expect(await coordinateHistory(c, 'verify', service)).toEqual({ operationId: c.value.operationId, state: 'verified', receiptDigest: c.ready.receipt.digest })
                    expect(await coordinateHistory(c, 'verify', service)).toEqual({ operationId: c.value.operationId, state: 'verified', receiptDigest: c.ready.receipt.digest })
                    expect(unexpected).not.toHaveBeenCalled()
                    const rows = (await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_verifications')).rows
                    expect(rows).toHaveLength(1)
                    expect(rows[0].receipt).toEqual(c.ready.receipt)
                    const { withReservedManagedTransfer } = await import('~~/server/utils/pageStudio/managedTransferIntent')
                    expect(await withReservedManagedTransfer(c.value, (tx, intent) => c.coordinator.retainedManagedTransferFormsHistoryVerification(tx, intent, c.options.env), { runTransaction })).toEqual({ request: c.request, requestDigest: c.ready.requestDigest, receipt: c.ready.receipt, receiptDigest: c.ready.receipt.digest })
                    await expect(db.query('DELETE FROM page_studio_managed_transfer_forms_history_verifications')).rejects.toThrow(/immutable/i)
                  })
                  it.each(['pending', 'resume-required'])('does not verify %s', async (state) => {
                    const c = await preparedHistory()
                    const { receipt: _, ...refs } = c.ready
                    await expect(coordinateHistory(c, 'verify', { inspectManagedTransferFormsHistory: async () => ({ ...refs, state }) })).rejects.toMatchObject({ statusCode: 409 })
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_verifications')).rows).toEqual([])
                  })
                  it.each(['request', 'intent', 'digest', 'history', 'fence', 'scope', 'unknown'])('rejects changed %s proof even if rehashed', async (kind) => {
                    const c = await preparedHistory(), response = structuredClone(c.ready)
                    if (kind === 'request') response.requestDigest = '0'.repeat(64)
                    if (kind === 'intent') response.intentDigest = '0'.repeat(64)
                    if (kind === 'digest') response.receipt.digest = '0'.repeat(64)
                    if (kind === 'history') response.receipt.destinationHistoryDigest = '0'.repeat(64)
                    if (kind === 'fence') response.receipt.source.fenceDigest = '0'.repeat(64)
                    if (kind === 'scope') response.receipt.destination.scope.siteId = 'other_site'
                    if (kind !== 'digest') {
                      const { digest: _, ...body } = response.receipt
                      response.receipt.digest = await collectionDigest(body)
                    }
                    await expect(coordinateHistory(c, 'verify', { inspectManagedTransferFormsHistory: async () => kind === 'unknown' ? { ...response, provider: 'secret' } : response })).rejects.toMatchObject({ statusCode: 409 })
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_verifications')).rows).toEqual([])
                  })
                  it('captures real RPC and owns request/response across async validation', async () => {
                    const c = await preparedHistory()
                    const hostile = () => {
                      throw new Error('Remote method property')
                    }
                    const inspect = Object.assign(async (request: typeof c.request) => {
                      request.importRequest.historyDigest = '0'.repeat(64)
                      return structuredClone(c.ready)
                    }, { bind: hostile, call: hostile })
                    expect(await coordinateHistory(c, 'verify', { inspectManagedTransferFormsHistory: inspect })).toMatchObject({ state: 'verified' })
                  })
                  it.each(['owner', 'operator', 'head'])('rechecks original %s after inspecting outside locks', async (kind) => {
                    const c = await preparedHistory()
                    const inspect = async () => {
                      await db.query('BEGIN')
                      try {
                        await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                      } finally {
                        await db.query('ROLLBACK')
                      }
                      await db.query(kind === 'head' ? 'DELETE FROM page_studio_cms_record_heads' : `UPDATE ${kind === 'owner' ? 'page_studio_customer_sessions' : 'page_studio_login_sessions'} SET revoked_at=clock_timestamp()`)
                      return structuredClone(c.ready)
                    }
                    await expect(coordinateHistory(c, 'verify', { inspectManagedTransferFormsHistory: inspect })).rejects.toThrow()
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_verifications')).rows).toEqual([])
                  })
                  it('rejects original session revocation after a prior successful verification', async () => {
                    const c = await preparedHistory(), inspect = vi.fn(async () => c.ready)
                    await coordinateHistory(c, 'verify', { inspectManagedTransferFormsHistory: inspect })
                    await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
                    await expect(coordinateHistory(c, 'verify', { inspectManagedTransferFormsHistory: inspect })).rejects.toMatchObject({ statusCode: 403 })
                    expect(inspect).toHaveBeenCalledTimes(1)
                  })
                })
                it('retains complete typed history and expected receipt without selecting or writing destination', async () => {
                  const c = await historySetup()
                  expect(await c.module.readManagedTransferFormsHistoryAdmission(c.value, c.options)).toBeNull()
                  expect(c.readHistory).not.toHaveBeenCalled()
                  const request = await c.module.prepareManagedTransferFormsHistory(c.value, c.options)
                  expect(request.sourceRequest).toEqual(c.sourceRequest)
                  expect(request.destinationProof).toEqual(c.observed.proof)
                  expect(request.importRequest.historyDigest).toBe(c.history.digest)
                  const rows = (await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_requests')).rows
                  expect(rows).toHaveLength(1)
                  expect(rows[0].expected_receipt.planDigest).toBe(request.importRequest.planDigest)
                  expect(await c.module.readManagedTransferFormsHistoryAdmission(c.value, c.options)).toEqual({ request, expectedReceipt: rows[0].expected_receipt })
                  expect(await c.module.authorizeManagedTransferFormsHistory({ action: 'prepare', request }, c.options)).toEqual({ action: 'prepare', request })
                  expect(await c.module.prepareManagedTransferFormsHistory(c.value, c.options)).toEqual(request)
                  expect(c.readHistory).toHaveBeenCalledTimes(1)
                  expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
                  await expect(db.query('DELETE FROM page_studio_managed_transfer_forms_history_requests')).rejects.toThrow(/immutable/i)
                })
                it('requires465 independent verification before source RPC', async () => {
                  const c = await historySetup(false)
                  await expect(c.module.prepareManagedTransferFormsHistory(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
                  expect(c.readHistory).not.toHaveBeenCalled()
                })
                it.each(['fence', 'history', 'target', 'proof', 'extra'])('rejects substituted admitted %s', async (field) => {
                  const c = await historySetup(), request = await c.module.prepareManagedTransferFormsHistory(c.value, c.options)
                  if (field === 'fence') request.importRequest.intent.source.fenceDigest = '0'.repeat(64)
                  if (field === 'history') request.importRequest.historyDigest = '0'.repeat(64)
                  if (field === 'target') request.importRequest.intent.destination.target.routeId = 'other_route'
                  if (field === 'proof') request.destinationProof.envelope.execution.workerReceipt.etag = 'other_etag'
                  const changed = field === 'extra' ? { ...request, history: c.history } : request
                  await expect(c.module.authorizeManagedTransferFormsHistory({ action: 'prepare', request: changed }, c.options)).rejects.toThrow()
                })
                it.each(['cancelled', 'hash', 'incomplete'])('rejects source %s before retaining history', async (field) => {
                  const c = await historySetup()
                  if (field === 'cancelled') c.readFence.mockImplementation(async () => ({ ...c.fence, state: 'cancelled' }))
                  if (field === 'hash') c.readFence.mockImplementation(async () => ({ ...c.fence, digest: '0'.repeat(64) }))
                  if (field === 'incomplete') c.readHistory.mockImplementation(async () => ({ ...c.history, entries: c.history.entries.slice(1) }))
                  await expect(c.module.prepareManagedTransferFormsHistory(c.value, c.options)).rejects.toThrow()
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_requests')).rows).toEqual([])
                })
                it.each(['owner', 'operator', 'head'])('reads outside locks and rejects late %s revocation', async (field) => {
                  const c = await historySetup()
                  c.readHistory.mockImplementation(async () => {
                    await db.query('BEGIN')
                    try {
                      await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                    } finally {
                      await db.query('ROLLBACK')
                    }
                    await db.query(field === 'head' ? 'DELETE FROM page_studio_cms_record_heads' : `UPDATE ${field === 'owner' ? 'page_studio_customer_sessions' : 'page_studio_login_sessions'} SET revoked_at=clock_timestamp()`)
                    return structuredClone(c.history)
                  })
                  await expect(c.module.prepareManagedTransferFormsHistory(c.value, c.options)).rejects.toThrow()
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_requests')).rows).toEqual([])
                })
                it('rechecks original authority on every callback after successful admission', async () => {
                  const c = await historySetup(), request = await c.module.prepareManagedTransferFormsHistory(c.value, c.options)
                  await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
                  await expect(c.module.authorizeManagedTransferFormsHistory({ action: 'read', request }, c.options)).rejects.toMatchObject({ statusCode: 403 })
                })
                it('rejects a changed actual fence after reading history without retaining evidence', async () => {
                  const c = await historySetup()
                  c.readFence.mockResolvedValueOnce(c.fence).mockResolvedValueOnce({ ...c.fence, digest: '0'.repeat(64) })
                  await expect(c.module.prepareManagedTransferFormsHistory(c.value, c.options)).rejects.toThrow()
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_requests')).rows).toEqual([])
                })
                it('uses captured real RPC methods and detached requests and observations', async () => {
                  const c = await historySetup()
                  const hostileMethod = () => {
                    throw new Error('Remote method property')
                  }
                  Object.assign(c.readFence, { bind: hostileMethod, call: hostileMethod })
                  Object.assign(c.readHistory, { bind: hostileMethod, call: hostileMethod })
                  const original = structuredClone(c.sourceRequest)
                  c.readHistory.mockImplementation(async (request: unknown) => {
                    ;(request as typeof c.sourceRequest).fenceIntent.target.routeId = 'hostile_route'
                    return structuredClone(c.history)
                  })
                  const request = await c.module.prepareManagedTransferFormsHistory(c.value, c.options)
                  expect(request.sourceRequest).toEqual(original)
                })
                it('rolls back an admission when source heads change inside the final native transaction', async () => {
                  const c = await historySetup()
                  const changed = <T>(work: (tx: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
                    const query = tx.query.bind(tx)
                    return work({ query: async (sql: string, params?: unknown[]) => {
                      const result = await query(sql, params)
                      if (sql.includes('INSERT INTO page_studio_managed_transfer_forms_history_requests')) await query('DELETE FROM page_studio_cms_record_heads')
                      return result
                    } } as pg.Client)
                  })
                  await expect(c.module.prepareManagedTransferFormsHistory(c.value, { ...c.options, runTransaction: changed })).rejects.toMatchObject({ statusCode: 409 })
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_requests')).rows).toEqual([])
                })
                it('serializes identical attempts and retains a single exact retry request', async () => {
                  const c = await historySetup()
                  const results = await Promise.allSettled([c.module.prepareManagedTransferFormsHistory(c.value, c.options), c.module.prepareManagedTransferFormsHistory(c.value, c.options)])
                  const done = results.filter(r => r.status === 'fulfilled')
                  expect(done.length).toBeGreaterThan(0)
                  for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ statusCode: 503 })
                  const replay = await c.module.prepareManagedTransferFormsHistory(c.value, c.options)
                  for (const r of done) expect(r.value).toEqual(replay)
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_forms_history_requests')).rows).toHaveLength(1)
                })
              })
              describe('immutable copy and graph admission', () => {
                beforeAll(async () => {
                  await db.query(readFileSync('server/database/migrations/465_page_studio_managed_transfer_destination_execution_verifications.sql', 'utf8'))
                  await db.query(readFileSync('server/database/migrations/466_page_studio_managed_transfer_copy_graph_requests.sql', 'utf8'))
                })
                async function copySetup(verified = true) {
                  // Replace placeholder bytes in this disposable fixture before any transfer reservation.
                  const scope = sourceFreeze.request.scope
                  const definition = { formatVersion: 1, id: 'products', label: 'Products', scope, version: 1, displayFieldId: 'name',
                    fields: [{ id: 'name', label: 'Name', type: 'text', required: true, visibility: 'public' }] }
                  const bodies = { schema: definition, content: { schemaVersion: 1, scope, collections: [] },
                    record: { collectionId: 'products', id: 'first', revision: 1, schemaVersion: 1, scope, archived: false, values: { name: 'Stretch' } } }
                  const manifest = structuredClone(JSON.parse(readFileSync('shared/pageStudio/generated/builderGraphFixtures.json', 'utf8'))[0].input.base.checkpoint.manifest)
                  manifest.id = scope.siteId
                  delete manifest.builderLibrary
                  const digest = await collectionDigest(manifest)
                  for (const table of ['page_studio_cms_objects', 'page_studio_application_versions', 'page_studio_checkpoints']) await db.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`)
                  try {
                    for (const [kind, body] of Object.entries(bodies)) {
                      const current = (await db.query('SELECT storage_pin FROM page_studio_cms_objects WHERE kind=$1', [kind])).rows[0].storage_pin
                      const { collectionCanonical } = await import('~~/shared/pageStudio/collectionApi')
                      await db.query('UPDATE page_studio_cms_objects SET storage_pin=$1 WHERE kind=$2', [{ ...current,
                        bytes: new TextEncoder().encode(collectionCanonical(body)).byteLength, sha256: await collectionDigest(body) }, kind])
                    }
                    const app = (await db.query('SELECT manifest FROM page_studio_application_versions')).rows[0].manifest
                    app.checkpoint.digest = digest
                    await db.query('UPDATE page_studio_application_versions SET manifest=$1,digest=$2', [app, await collectionDigest(app)])
                    await db.query('UPDATE page_studio_checkpoints SET digest=$1', [digest])
                  } finally {
                    for (const table of ['page_studio_cms_objects', 'page_studio_application_versions', 'page_studio_checkpoints']) await db.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`)
                  }
                  const c = await setup()
                  const execution = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                  const proof = await executionReady(execution)
                  if (verified) {
                    const { coordinateManagedTransferDestinationExecution } = await import('~~/server/utils/pageStudio/managedTransferDestinationExecutionCoordinator')
                    await coordinateManagedTransferDestinationExecution({ ...c.value, action: 'verify' }, { ...c.options,
                      env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferDestinationExecution: async () => proof } } })
                  }
                  const rows = (await db.query('SELECT * FROM page_studio_cms_objects')).rows
                  const schemaPin = rows.find(row => row.kind === 'schema').storage_pin
                  const read = vi.fn(async ({ pins }: { pins: unknown[] }) => pins.map((pin) => {
                    const row = rows.find(row => collectionCanonical(row.storage_pin) === collectionCanonical(pin))
                    if (!row) throw new Error('No exact fixture pin')
                    return { pin: row.storage_pin, body: bodies[row.kind as keyof typeof bodies], schema: row.kind === 'record' ? schemaPin : null,
                      actorId: row.actor_id, createdAt: row.created_at.toISOString(), head: true }
                  }))
                  const env = { ...c.options.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
                    PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: { readManagedCmsTarget: async () => sourceFreeze.request.target, readManagedCmsObjectsAtTarget: read },
                    PAGE_STUDIO_CMS_STAGING_CHECKPOINTS: { get: vi.fn(async () => ({ body: new Response(JSON.stringify({ schemaVersion: 1,
                      checkpointId: 'checkpoint_a', digest, manifest, scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } })).body! })) } }
                  const module = await import('~~/workers/page-studio-management/src/managedTransferCopyAdmission')
                  return { ...c, admission: module, execution, proof, read, env, options: { ...c.options, env } }
                }
                describe('private copy graph inspection coordinator', () => {
                  beforeAll(async () => {
                    await db.query(readFileSync('server/database/migrations/470_page_studio_managed_transfer_copy_graph_verifications.sql', 'utf8'))
                  })
                  async function copyContextSetup() {
                    const c = await copySetup()
                    await c.admission.prepareManagedTransferCopyGraph(c.value, c.options)
                    const scope = sourceFreeze.request.scope, target = sourceFreeze.request.target
                    const sourcePolicy = { version: 1, kind: 'managed-draft-transfer', accountId: target.accountId,
                      namespace: 'xeroflow-page-studio-dispatch-staging', from: { compatibilityDate: '2026-08-18', digest: target.runtimeDigest },
                      to: { compatibilityDate: '2026-08-18', digest: '9'.repeat(64) } }
                    const predecessor = { accountId: target.accountId, databaseId: target.databaseId, scope,
                      namespace: sourcePolicy.namespace, scriptName: `ps-content-${'5'.repeat(32)}`, ownerTag: `ps-owner-${'6'.repeat(32)}`,
                      runtimeDigest: target.runtimeDigest, compatibilityDate: sourcePolicy.from.compatibilityDate, setupDigest: '7'.repeat(64) }
                    const formReceipt = { operationId: 'forms_a', collectionOperationId: 'collection_a', workflowOperationId: 'workflow_a', stagingOperationId: 'staging_a',
                      scope, accountId: target.accountId, databaseId: target.databaseId, name: target.name,
                      sourceDigest: '863be4f1fa6709c12fcdc8be3c5432c754dcdc535995f31042613e8072571e0e', targetDigest: 'c4f79d0a585c725b72fd8f85ad52ed0494268b7d57853965a673149170b033b2' }
                    const { prepareManagedTransferExecution } = await import('~~/server/utils/pageStudio/managedTransferExecution')
                    await prepareManagedTransferExecution(c.value, { runTransaction, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
                      MANAGED_TRANSFER_EXECUTION_POLICY: JSON.stringify(sourcePolicy), PAGE_STUDIO_PROVISIONER: { discoverManagedTransferExecution: async () => ({
                        formatVersion: 1, ...c.value, sourceScope: scope, sourceTarget: target, freezeDigest: sourceFreeze.digest, predecessor, freeze: sourceFreeze, formReceipt }) } } })
                    const { prepareManagedTransferSourceDrafts } = await import('~~/server/utils/pageStudio/managedTransferSourceDrafts')
                    await prepareManagedTransferSourceDrafts(c.value, { runTransaction, env: { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
                      PAGE_STUDIO_PROVISIONER: { inspectManagedTransferExecution: async () => ({ ...c.value, state: 'ready', identity: '1'.repeat(64) }) } } })
                    const coordinator = await import('~~/workers/page-studio-management/src/managedTransferCopyCoordinator')
                    return { ...c, coordinator }
                  }
                  describe('atomic terminal authoring handoff', () => {
                    beforeAll(async () => {
                      for (const name of ['467_page_studio_managed_transfer_forms_history_requests.sql', '469_page_studio_managed_transfer_forms_history_verifications.sql', '471_page_studio_managed_transfer_completions.sql']) {
                        await db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
                      }
                    })
                    async function terminalSetup() {
                      const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                      const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                      const ready = await managedTransferCopyGraphReady(context)
                      const fenceBody = { state: 'frozen', request: context.sourceRequest.fenceIntent, identityDigest: await collectionDigest(context.sourceRequest.fenceIntent) }
                      const fence = { ...fenceBody, digest: await collectionDigest(fenceBody) }
                      const { formsHistoryFixture } = await import('../../helpers/pageStudio/formsHistory')
                      const history = await formsHistoryFixture(context.sourceRequest.fenceIntent.scope, fence.digest)
                      const inspectCopy = vi.fn(async () => structuredClone(ready))
                      const service = { inspectManagedTransferCopyGraph: inspectCopy,
                        readManagedTransferSourceDraftsFence: async () => fence, readManagedTransferSourceDraftsHistory: async () => history,
                        inspectManagedTransferFormsHistory: vi.fn() }
                      const options = { ...c.options, env: { ...c.env, PAGE_STUDIO_PROVISIONER: service } }
                      await c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options)
                      const forms = await import('~~/server/utils/pageStudio/managedTransferFormsHistory')
                      const request = await forms.prepareManagedTransferFormsHistory(c.value, options)
                      const receipt = (await db.query('SELECT expected_receipt FROM page_studio_managed_transfer_forms_history_requests WHERE operation_id=$1', [c.value.operationId])).rows[0].expected_receipt
                      service.inspectManagedTransferFormsHistory.mockImplementation(async () => ({ ...c.value, requestDigest: await collectionDigest(request), state: 'ready', receipt: structuredClone(receipt) }))
                      const { coordinateManagedTransferFormsHistory } = await import('~~/server/utils/pageStudio/managedTransferFormsHistoryCoordinator')
                      await coordinateManagedTransferFormsHistory({ ...c.value, action: 'verify' }, options)
                      inspectCopy.mockClear()
                      service.inspectManagedTransferFormsHistory.mockClear()
                      const module = await import('~~/workers/page-studio-management/src/managedTransferCompletion')
                      return { ...c, context, ready, service, options, terminal: module }
                    }
                    it.each(['execution/context', 'execution/authorize', 'source-drafts/authorize', 'destination-catalogue/authorize', 'destination-execution/authorize', 'copy-graph/authorize', 'forms-history/authorize', 'source-retention/authorize'] as const)('placed %s preserves exact SQL/parameters and fresh authority denial', async (key) => {
                      const c = await terminalSetup()
                      const execution = await import('~~/server/utils/pageStudio/managedTransferExecution')
                      const source = await import('~~/server/utils/pageStudio/managedTransferSourceDrafts')
                      const catalogue = await import('~~/server/utils/pageStudio/managedTransferDestinationCatalogue')
                      const destination = await import('~~/server/utils/pageStudio/managedTransferDestinationExecution')
                      const forms = await import('~~/server/utils/pageStudio/managedTransferFormsHistory')
                      const retention = await import('~~/workers/page-studio-management/src/managedTransferSourceRetention')
                      const { handleManagedTransferAuthorityFetch } = await import('~~/workers/page-studio-management/src/managedTransferAuthority')
                      const row = async (table: string) => (await db.query(`SELECT request FROM ${table} WHERE operation_id=$1`, [c.value.operationId])).rows[0].request
                      const inputs: Record<string, unknown> = {
                        'execution/context': c.value,
                        'execution/authorize': await row('page_studio_managed_transfer_executions'),
                        'source-drafts/authorize': { action: 'read', request: c.context.sourceRequest },
                        'destination-catalogue/authorize': { action: 'read', request: await row('page_studio_managed_transfer_destination_catalogues') },
                        'destination-execution/authorize': { action: 'read', request: await row('page_studio_managed_transfer_destination_executions') },
                        'copy-graph/authorize': { ...c.value, action: 'inspect', requestDigest: await collectionDigest(c.context.admission), contextDigest: await collectionDigest(c.context) },
                        'forms-history/authorize': { action: 'read', request: await row('page_studio_managed_transfer_forms_history_requests') }
                      }
                      if (key === 'source-retention/authorize') {
                        await c.terminal.completeManagedTransfer(c.value, c.options)
                        inputs[key] = { action: 'retain', request: await retention.readManagedTransferSourceRetention(c.value, c.options) }
                      }
                      const handlers = { 'execution/context': execution.readManagedTransferExecutionContext, 'execution/authorize': execution.authorizeManagedTransferExecution,
                        'source-drafts/authorize': source.authorizeManagedTransferSourceDrafts, 'destination-catalogue/authorize': catalogue.authorizeManagedTransferDestinationCatalogue,
                        'destination-execution/authorize': destination.authorizeManagedTransferDestinationExecution, 'copy-graph/authorize': c.coordinator.authorizeManagedTransferCopyGraph,
                        'forms-history/authorize': forms.authorizeManagedTransferFormsHistory, 'source-retention/authorize': retention.authorizeManagedTransferSourceRetention }
                      const env = { ...c.options.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
                        PAGE_STUDIO_PROVISIONER: { ...c.options.env.PAGE_STUDIO_PROVISIONER, createProvisioning: async () => null, readProvisioning: async () => null } }
                      const queries: unknown[][] = []
                      let transactions = 0
                      const traced: typeof runTransaction = work => runTransaction(async (tx) => {
                        transactions++
                        return work({ query: async (sql: string, params?: unknown[]) => { queries.push([sql, structuredClone(params)]); return tx.query(sql, params) } } as pg.Client)
                      })
                      const direct = () => handlers[key](inputs[key], { env, runTransaction: traced })
                      const wire = { expectedEnvironment: 'production', input: inputs[key] }
                      const placed = () => handleManagedTransferAuthorityFetch(new Request(`https://page-studio-management.internal/internal/page-studio/managed-transfers/${key}`, { method: 'POST', body: JSON.stringify(wire) }), env, traced)
                      const expected = await direct(), expectedQueries = structuredClone(queries), expectedTransactions = transactions
                      queries.length = 0; transactions = 0
                      const result = await placed()
                      expect(result.status).toBe(200)
                      expect(await result.json()).toEqual(expected)
                      expect(result.headers.get('x-request-digest')).toBe(await collectionDigest(wire))
                      expect(queries).toEqual(expectedQueries)
                      expect(transactions).toBe(expectedTransactions)
                      // Terminal retention uses current owner/plan, intentionally not expired original sessions.
                      await db.query(key === 'source-retention/authorize' ? "UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()" : "UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()")
                      let status: unknown
                      try { await direct() } catch (error) { status = (error as { statusCode?: number }).statusCode }
                      expect([403, 409]).toContain(status)
                      expect((await placed()).status).toBe(status)
                    })
                    it('independently inspects both stores then switches all native metadata in one transaction', async () => {
                      const c = await terminalSetup()
                      const receipt = await c.terminal.completeManagedTransfer(c.value, c.options)
                      expect(receipt.operationId).toBe(c.value.operationId)
                      expect(c.service.inspectManagedTransferCopyGraph).toHaveBeenCalledTimes(1)
                      expect(c.service.inspectManagedTransferFormsHistory).toHaveBeenCalledTimes(1)
                      expect((await db.query('SELECT state,environment,adoption_id,transfer_id,retained_by_transfer_id FROM page_studio_cms_scopes ORDER BY environment')).rows).toEqual([
                        { state: 'managed', environment: 'production', adoption_id: null, transfer_id: c.value.operationId, retained_by_transfer_id: null },
                        { state: 'retained', environment: 'staging', adoption_id: 'adoption_a', transfer_id: null, retained_by_transfer_id: c.value.operationId }
                      ])
                      expect((await db.query('SELECT current_checkpoint_id,current_release_id FROM page_studio_sites')).rows[0]).toEqual({ current_checkpoint_id: receipt.destination.checkpoint.id, current_release_id: null })
                      expect((await db.query('SELECT count(*) FROM page_studio_cms_objects WHERE transfer_id=$1', [c.value.operationId])).rows[0].count).toBe(String(c.ready.proof.destinationObjects.length))
                      const { lockCmsContext } = await import('~~/server/utils/pageStudio/cmsVisibility')
                      expect((await runTransaction(tx => lockCmsContext(tx, receipt.destination.scope))).application.id).toBe(receipt.destination.application.id)
                      await expect(runTransaction(tx => lockCmsContext(tx, receipt.source.scope))).rejects.toThrow()
                    })
                    it('recovers the identical committed result without recopying or inspecting again', async () => {
                      const c = await terminalSetup(), receipt = await c.terminal.completeManagedTransfer(c.value, c.options)
                      c.service.inspectManagedTransferCopyGraph.mockRejectedValue(new Error('Must not retry remote work'))
                      c.service.inspectManagedTransferFormsHistory.mockRejectedValue(new Error('Must not retry remote work'))
                      expect(await c.terminal.completeManagedTransfer(c.value, c.options)).toEqual(receipt)
                      expect((await db.query('SELECT count(*) FROM page_studio_managed_transfer_completions')).rows[0].count).toBe('1')
                    })
                    it.each(['owner', 'operator', 'plan', 'source-head'])('rejects late %s changes before selection and releases locks during inspection', async (field) => {
                      const c = await terminalSetup(), original = c.service.inspectManagedTransferFormsHistory.getMockImplementation()!
                      c.service.inspectManagedTransferFormsHistory.mockImplementation(async () => {
                        await db.query('BEGIN')
                        try {
                          await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                        } finally {
                          await db.query('ROLLBACK')
                        }
                        await db.query(field === 'owner'
                          ? 'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()'
                          : field === 'operator'
                            ? 'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'
                            : field === 'plan' ? 'UPDATE page_studio_entitlements SET plan_metadata=\'{}\'' : 'UPDATE page_studio_sites SET current_checkpoint_id=NULL')
                        return original()
                      })
                      await expect(c.terminal.completeManagedTransfer(c.value, c.options)).rejects.toThrow()
                      expect((await db.query('SELECT state FROM page_studio_cms_scopes')).rows).toEqual([{ state: 'managed' }])
                      expect((await db.query('SELECT * FROM page_studio_managed_transfer_completions')).rows).toEqual([])
                    })
                    it.each(['copy', 'history'])('rejects changed fresh %s bytes despite retained verification', async (field) => {
                      const c = await terminalSetup()
                      if (field === 'copy') {
                        const corrupt = structuredClone(c.ready)
                        corrupt.proof.destinationObjects[0].body = {}
                        const { digest: _, ...body } = corrupt.proof
                        corrupt.proof.digest = await collectionDigest(body)
                        c.service.inspectManagedTransferCopyGraph.mockResolvedValue(corrupt)
                      } else c.service.inspectManagedTransferFormsHistory.mockResolvedValue({ ...c.value, state: 'pending', requestDigest: 'f'.repeat(64) })
                      await expect(c.terminal.completeManagedTransfer(c.value, c.options)).rejects.toThrow()
                      expect((await db.query('SELECT * FROM page_studio_managed_transfer_completions')).rows).toEqual([])
                    })
                    it('rolls back all transferred metadata on a late native write failure', async () => {
                      const c = await terminalSetup()
                      await db.query(`CREATE FUNCTION reject_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'terminal fault'; END $$;
                        CREATE TRIGGER terminal_fault BEFORE INSERT ON page_studio_managed_transfer_completions FOR EACH ROW EXECUTE FUNCTION reject_terminal()`)
                      try {
                        await expect(c.terminal.completeManagedTransfer(c.value, c.options)).rejects.toThrow('terminal fault')
                        expect((await db.query('SELECT state FROM page_studio_cms_scopes')).rows).toEqual([{ state: 'managed' }])
                        expect((await db.query('SELECT count(*) FROM page_studio_cms_objects WHERE transfer_id IS NOT NULL')).rows[0].count).toBe('0')
                      } finally { await db.query('DROP TRIGGER terminal_fault ON page_studio_managed_transfer_completions; DROP FUNCTION reject_terminal()') }
                    })
                    it('authorizes source retention only after the exact terminal commit', async () => {
                      const c = await terminalSetup()
                      const module = await import('~~/workers/page-studio-management/src/managedTransferSourceRetention')
                      await expect(module.readManagedTransferSourceRetention(c.value, c.options)).rejects.toThrow()
                      const completion = await c.terminal.completeManagedTransfer(c.value, c.options)
                      const request = await module.readManagedTransferSourceRetention(c.value, c.options)
                      expect(request.completion).toEqual(completion)
                      expect(request.sourceRequest).toEqual(c.context.sourceRequest)
                      for (const action of ['read', 'retain']) expect(await module.authorizeManagedTransferSourceRetention({ action, request }, c.options)).toEqual({ action, request })
                      await expect(c.coordinator.authorizeManagedTransferCopyGraph({ ...c.value, action: 'inspect', requestDigest: await collectionDigest(c.context.admission), contextDigest: await collectionDigest(c.context) }, c.options)).rejects.toThrow()
                    })
                    it.each(['source', 'receipt', 'owner'])('rejects substituted terminal retention %s', async (field) => {
                      const c = await terminalSetup()
                      await c.terminal.completeManagedTransfer(c.value, c.options)
                      const module = await import('~~/workers/page-studio-management/src/managedTransferSourceRetention')
                      const request = await module.readManagedTransferSourceRetention(c.value, c.options)
                      if (field === 'source') request.sourceRequest.executionIdentity = 'f'.repeat(64)
                      if (field === 'receipt') {
                        request.completion.auditId = randomUUID()
                        const { digest: _, ...body } = request.completion
                        request.completion.digest = await collectionDigest(body)
                      }
                      if (field === 'owner') await db.query('UPDATE page_studio_workspace_memberships SET revoked_at=clock_timestamp()')
                      await expect(module.authorizeManagedTransferSourceRetention({ action: 'retain', request }, c.options)).rejects.toThrow()
                    })
                    it('permits exact source retention after original owner and operator sessions expire', async () => {
                      const c = await terminalSetup()
                      await c.terminal.completeManagedTransfer(c.value, c.options)
                      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
                      await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
                      const module = await import('~~/workers/page-studio-management/src/managedTransferSourceRetention')
                      const request = await module.readManagedTransferSourceRetention(c.value, c.options)
                      expect(await module.authorizeManagedTransferSourceRetention({ action: 'retain', request }, c.options)).toEqual({ action: 'retain', request })
                      await expect(module.readManagedTransferSourceRetention({ ...c.value, intentDigest: 'f'.repeat(64) }, c.options)).rejects.toThrow()
                      await db.query('UPDATE page_studio_entitlements SET plan_metadata=jsonb_set(plan_metadata,\'{publishingEnabled}\',\'false\')')
                      await expect(module.readManagedTransferSourceRetention(c.value, c.options)).rejects.toThrow()
                    })
                    it('recovers an uncertain source-retention acknowledgement by read without repeating mutation', async () => {
                      const c = await terminalSetup()
                      await c.terminal.completeManagedTransfer(c.value, c.options)
                      const module = await import('~~/workers/page-studio-management/src/managedTransferSourceRetention')
                      const request = await module.readManagedTransferSourceRetention(c.value, c.options)
                      const body = { state: 'retained', request: request.sourceRequest.fenceIntent, identityDigest: await collectionDigest(request.sourceRequest.fenceIntent) }
                      const receipt = { ...body, digest: await collectionDigest(body) }
                      const retain = vi.fn(async () => {
                          throw new Error('response lost')
                        }), read = vi.fn(async () => receipt)
                      const options = { ...c.options, env: { ...c.options.env, PAGE_STUDIO_PROVISIONER: { retainManagedTransferSourceDrafts: retain, readManagedTransferSourceRetention: read } } }
                      await expect(module.coordinateManagedTransferSourceRetention({ ...c.value, action: 'retain' }, options)).rejects.toThrow()
                      expect(await module.coordinateManagedTransferSourceRetention({ ...c.value, action: 'status' }, options)).toEqual({ operationId: c.value.operationId, state: 'retained' })
                      expect(retain).toHaveBeenCalledTimes(1)
                    })
                    it('recovery still requires original current owner authority', async () => {
                      const c = await terminalSetup()
                      await c.terminal.completeManagedTransfer(c.value, c.options)
                      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
                      await expect(c.terminal.completeManagedTransfer(c.value, c.options)).rejects.toMatchObject({ statusCode: 403 })
                    })
                  })
                  it('derives a detached exact context without changing original selection', async () => {
                    const c = await copyContextSetup()
                    const context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    expect(context.admission.copy.transferId).toBe(c.value.operationId)
                    expect(context.sourceRequest.executionIdentity).toBe('1'.repeat(64))
                    expect(context.destinationProof).toEqual(c.proof.proof)
                    expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
                  })
                  it('authorizes only the exact small retained context reference', async () => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const wire = { ...c.value, action: 'inspect', requestDigest: await collectionDigest(context.admission), contextDigest: await collectionDigest(context) }
                    expect(await c.coordinator.authorizeManagedTransferCopyGraph(wire, c.options)).toEqual(wire)
                    await expect(c.coordinator.authorizeManagedTransferCopyGraph({ ...wire, contextDigest: 'f'.repeat(64) }, c.options)).rejects.toThrow()
                    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
                    await expect(c.coordinator.authorizeManagedTransferCopyGraph(wire, c.options)).rejects.toMatchObject({ statusCode: 403 })
                  })
                  it('retains only explicit full inspected proof and replays the same immutable result', async () => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                    const ready = await managedTransferCopyGraphReady(context)
                    const inspect = vi.fn(async () => ready)
                    const options = { ...c.options, env: { ...c.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferCopyGraph: inspect } } }
                    const first = await c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options)
                    expect(first).toEqual({ operationId: c.value.operationId, state: 'verified', proofDigest: ready.proof.digest })
                    expect(await c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options)).toEqual(first)
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_verifications')).rows).toHaveLength(1)
                    const { withReservedManagedTransfer } = await import('~~/server/utils/pageStudio/managedTransferIntent')
                    const saved = await withReservedManagedTransfer(c.value, (tx, intent) => c.coordinator.readVerifiedCopyGraph(tx, intent, c.env), { runTransaction })
                    expect(saved).toMatchObject({ request: context.admission, context, proof: ready.proof, proofDigest: ready.proof.digest })
                    await expect(db.query('DELETE FROM page_studio_managed_transfer_copy_graph_verifications')).rejects.toThrow(/immutable/i)
                  })
                  it.each(['body', 'mapping', 'graph', 'freeze', 'context'])('rejects rehashed substituted physical %s proof', async (field) => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                    const ready = await managedTransferCopyGraphReady(context)
                    if (field === 'body') ready.proof.destinationObjects[0].body = {}
                    if (field === 'mapping') ready.proof.copyReceipt.objects[0].destination.sha256 = 'f'.repeat(64)
                    if (field === 'graph') ready.proof.graphReceipt.graph.base.application.manifest.applicationId = randomUUID()
                    if (field === 'freeze') ready.proof.copyReceipt.freeze.digest = 'f'.repeat(64)
                    if (field === 'context') ready.proof.contextDigest = 'f'.repeat(64)
                    for (const object of [ready.proof.copyReceipt, ready.proof.graphReceipt, ready.proof]) {
                      const { digest: _, ...body } = object
                      object.digest = await collectionDigest(body)
                    }
                    await expect(c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, { ...c.options,
                      env: { ...c.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferCopyGraph: async () => ready } } })).rejects.toMatchObject({ statusCode: 409 })
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_verifications')).rows).toEqual([])
                  })
                  it.each(['owner', 'operator', 'head'])('rejects late %s revocation and holds no SQL locks across remote inspection', async (field) => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                    const ready = await managedTransferCopyGraphReady(context)
                    const inspect = async () => {
                      await db.query('BEGIN')
                      try {
                        await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                      } finally {
                        await db.query('ROLLBACK')
                      }
                      await db.query(field === 'head' ? 'UPDATE page_studio_sites SET current_checkpoint_id=NULL' : `UPDATE ${field === 'owner' ? 'page_studio_customer_sessions' : 'page_studio_login_sessions'} SET revoked_at=clock_timestamp()`)
                      return ready
                    }
                    await expect(c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, { ...c.options,
                      env: { ...c.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferCopyGraph: inspect } } })).rejects.toThrow()
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_verifications')).rows).toEqual([])
                  })
                  it('captures RPC function and receiver and detaches outbound context', async () => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                    const ready = await managedTransferCopyGraphReady(context)
                    const service = { inspectManagedTransferCopyGraph: async function (input: typeof context) {
                      expect(this).toBe(service)
                      input.admission.copy.transferId = randomUUID()
                      return ready
                    } }
                    Object.assign(service.inspectManagedTransferCopyGraph, { bind: () => {
                      throw new Error('Remote bind')
                    }, call: () => {
                      throw new Error('Remote call')
                    } })
                    expect(await c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, { ...c.options, env: { ...c.env, PAGE_STUDIO_PROVISIONER: service } }))
                      .toMatchObject({ state: 'verified' })
                    expect(await c.coordinator.readManagedTransferCopyContext(c.value, c.options)).toEqual(context)
                  })
                  it('never retains verification from preparation or status even with a ready response', async () => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                    const ready = await managedTransferCopyGraphReady(context)
                    const prepare = vi.fn(async () => ready), read = vi.fn(async () => ready)
                    const options = { ...c.options, env: { ...c.env, PAGE_STUDIO_PROVISIONER: { prepareManagedTransferCopyGraph: prepare, readManagedTransferCopyGraph: read } } }
                    for (const action of ['start', 'resume', 'status']) expect(await c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action }, options)).toMatchObject({ state: 'ready' })
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_verifications')).rows).toEqual([])
                    expect(prepare).toHaveBeenCalledTimes(2)
                    expect(read).toHaveBeenCalledTimes(1)
                  })
                  it('withholds proof after a lost acknowledgement until explicit verification succeeds', async () => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                    const ready = await managedTransferCopyGraphReady(context), inspect = vi.fn().mockRejectedValueOnce(new Error('Lost acknowledgement')).mockResolvedValue(ready)
                    const options = { ...c.options, env: { ...c.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferCopyGraph: inspect } } }
                    await expect(c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options)).rejects.toThrow('Lost acknowledgement')
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_verifications')).rows).toEqual([])
                    expect(await c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options)).toMatchObject({ state: 'verified' })
                  })
                  it('serializes exact concurrent verifications and rejects replacement observations', async () => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const { managedTransferCopyGraphReady } = await import('../../helpers/pageStudio/managedTransferCopyGraph')
                    const ready = await managedTransferCopyGraphReady(context)
                    const options = { ...c.options, env: { ...c.env, PAGE_STUDIO_PROVISIONER: { inspectManagedTransferCopyGraph: async () => ready } } }
                    const results = await Promise.allSettled([c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options), c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options)])
                    expect(results.some(r => r.status === 'fulfilled')).toBe(true)
                    for (const result of results) if (result.status === 'rejected') expect(result.reason).toMatchObject({ statusCode: 503 })
                    expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_verifications')).rows).toHaveLength(1)
                    ready.proof.graphReceipt.checkpoint.etag = 'replaced-physical-etag'
                    for (const object of [ready.proof.graphReceipt, ready.proof]) {
                      const { digest: _, ...body } = object
                      object.digest = await collectionDigest(body)
                    }
                    await expect(c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, options)).rejects.toMatchObject({ statusCode: 409 })
                  })
                  it('rejects wrong environment, missing service and changed reviewed policy', async () => {
                    const c = await copyContextSetup()
                    await expect(c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'verify' }, c.options)).rejects.toMatchObject({ statusCode: 503 })
                    await expect(c.coordinator.readManagedTransferCopyContext(c.value, { ...c.options, env: { ...c.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' } })).rejects.toMatchObject({ statusCode: 503 })
                    await expect(c.coordinator.readManagedTransferCopyContext(c.value, { ...c.options, env: { ...c.env, MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: '{}' } })).rejects.toThrow()
                  })
                  it('status never invokes preparation or retains a proof', async () => {
                    const c = await copyContextSetup(), context = await c.coordinator.readManagedTransferCopyContext(c.value, c.options)
                    const read = vi.fn(async () => ({ ...c.value, requestDigest: await collectionDigest(context.admission), contextDigest: await collectionDigest(context), state: 'pending' }))
                    const result = await c.coordinator.coordinateManagedTransferCopyGraph({ ...c.value, action: 'status' }, { ...c.options, env: { ...c.env, PAGE_STUDIO_PROVISIONER: { readManagedTransferCopyGraph: read } } })
                    expect(result).toEqual({ operationId: c.value.operationId, state: 'pending' })
                    expect(read).toHaveBeenCalledTimes(1)
                  })
                })
                it('retains exact native closure and deterministic graph ids without changing authoring selection', async () => {
                  const c = await copySetup()
                  const first = await c.admission.prepareManagedTransferCopyGraph(c.value, c.options)
                  expect(first.copy.destination.freezeReceipt).toEqual(c.proof.proof.envelope.execution.freeze)
                  expect(first.copy.transferId).toBe(c.value.operationId)
                  expect(first.copy.source.objects).toHaveLength(3)
                  expect(first.objectIds).toHaveLength(3)
                  expect(first.destinationGraph.schemaObjects).toHaveLength(1)
                  expect(first.destinationGraph.generation).not.toBe(generation)
                  const reads = c.read.mock.calls.length
                  expect(await c.admission.prepareManagedTransferCopyGraph(c.value, c.options)).toEqual(first)
                  expect(c.read).toHaveBeenCalledTimes(reads)
                  expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
                  expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows).toEqual([{ current_checkpoint_id: 'checkpoint_a' }])
                  await expect(db.query('DELETE FROM page_studio_managed_transfer_copy_graph_requests')).rejects.toThrow(/immutable/i)
                })
                it('requires retained465 verification before reading source bytes', async () => {
                  const c = await copySetup(false)
                  await expect(c.admission.prepareManagedTransferCopyGraph(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
                  expect(c.read).not.toHaveBeenCalled()
                })
                it('keeps source reads outside SQL locks and rechecks late owner revocation', async () => {
                  const c = await copySetup(), original = c.read.getMockImplementation()!
                  c.read.mockImplementation(async (input) => {
                    await db.query('BEGIN')
                    try {
                      await db.query('SELECT id FROM page_studio_sites FOR UPDATE NOWAIT')
                    } finally {
                      await db.query('ROLLBACK')
                    }
                    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
                    return original(input)
                  })
                  await expect(c.admission.prepareManagedTransferCopyGraph(c.value, c.options)).rejects.toMatchObject({ statusCode: 403 })
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_requests')).rows).toEqual([])
                })
                it('rejects corrupt source body and missing trusted staging bindings before admission', async () => {
                  const c = await copySetup()
                  const original = c.read.getMockImplementation()!
                  c.read.mockImplementation(async (input) => {
                    const rows = await original(input)
                    rows[0]!.body = {}
                    return rows
                  })
                  await expect(c.admission.prepareManagedTransferCopyGraph(c.value, c.options)).rejects.toThrow()
                  await expect(c.admission.prepareManagedTransferCopyGraph(c.value, { ...c.options, env: { ...c.env, PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER: undefined } })).rejects.toMatchObject({ statusCode: 503 })
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_requests')).rows).toEqual([])
                })
                it('retains one winner after concurrent discoveries and replays a lost acknowledgement', async () => {
                  const c = await copySetup()
                  const outcomes = await Promise.allSettled([
                    c.admission.prepareManagedTransferCopyGraph(c.value, c.options),
                    c.admission.prepareManagedTransferCopyGraph(c.value, c.options)
                  ])
                  const completed = outcomes.filter(outcome => outcome.status === 'fulfilled')
                  expect(completed.length).toBeGreaterThan(0)
                  for (const outcome of outcomes) if (outcome.status === 'rejected') expect(outcome.reason).toMatchObject({ statusCode: 503 })
                  const a = completed[0]!.value
                  for (const outcome of completed) expect(outcome.value).toEqual(a)
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_requests')).rows).toHaveLength(1)
                  expect(await c.admission.readManagedTransferCopyGraph(c.value, c.options)).toEqual(a)
                })
                it('rejects a changed original head after discovery without saving a new request', async () => {
                  const c = await copySetup(), original = c.read.getMockImplementation()!
                  c.read.mockImplementation(async (input) => {
                    const result = await original(input)
                    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
                    return result
                  })
                  await expect(c.admission.prepareManagedTransferCopyGraph(c.value, c.options)).rejects.toThrow()
                  expect((await db.query('SELECT * FROM page_studio_managed_transfer_copy_graph_requests')).rows).toEqual([])
                })
                it('rejects rehashed stored substitution against the original immutable plan', async () => {
                  const c = await copySetup()
                  const request = await c.admission.prepareManagedTransferCopyGraph(c.value, c.options)
                  request.objectIds[0]!.destinationObjectId = randomUUID()
                  const json = collectionCanonical(request)
                  await db.query('ALTER TABLE page_studio_managed_transfer_copy_graph_requests DISABLE TRIGGER USER')
                  try {
                    await db.query('UPDATE page_studio_managed_transfer_copy_graph_requests SET request=$1::jsonb,request_json=$2,request_digest=$3', [json, json, await collectionDigest(request)])
                  } finally {
                    await db.query('ALTER TABLE page_studio_managed_transfer_copy_graph_requests ENABLE TRIGGER USER')
                  }
                  await expect(c.admission.readManagedTransferCopyGraph(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
                })
                it('read-only status neither discovers nor admits and saved requests remain authority checked', async () => {
                  const c = await copySetup()
                  expect(await c.admission.readManagedTransferCopyGraph(c.value, c.options)).toBeNull()
                  expect(c.read).not.toHaveBeenCalled()
                  await c.admission.prepareManagedTransferCopyGraph(c.value, c.options)
                  await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
                  await expect(c.admission.readManagedTransferCopyGraph(c.value, c.options)).rejects.toMatchObject({ statusCode: 403 })
                })
              })
              it('retains one deterministic destination request with its own unexecuted freeze', async () => {
                const c = await setup()
                const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                expect(request).toMatchObject({ formatVersion: 1, ...c.value, catalogueRequest: c.catalogue, catalogueReceipt: c.proof.receipt,
                  policy: { kind: 'managed-draft-import', formReceiptDigest: c.proof.receipt.receiptDigests.forms },
                  freezeRequest: { adoptionId: `transfer_${c.value.operationId}_destination`, scope: c.catalogue.resourceRequest.resourceRequest.scope,
                    actor: c.catalogue.resourceRequest.resourceRequest.actor, target: { databaseId: c.physical.database.databaseId,
                      routeId: c.physical.preparationId, runtimeDigest: c.physical.worker.runtimeDigest } } })
                expect(request).not.toHaveProperty('freeze')
                expect(request).not.toHaveProperty('state')
                expect(request.successor.scriptName).not.toBe(c.physical.worker.scriptName)
                expect(request.successor.ownerTag).not.toBe(c.physical.worker.ownerTag)
                expect(request.successor.runtimeDigest).toBe(policy.to.digest)
                expect(request.freezeRequest.target.databaseId).not.toBe(sourceFreeze.request.target.databaseId)
                const { etag: _etag, ...predecessor } = c.physical.worker
                const identity = await collectionDigest({ ...c.value, catalogueRequestDigest: c.proof.requestDigest,
                  catalogueReceiptDigest: c.proof.receipt.digest, predecessor, policy: request.policy })
                expect(request.successor.scriptName).toBe(`ps-content-${identity.slice(0, 32)}`)
                expect(request.successor.ownerTag).toBe(`ps-owner-${(await collectionDigest({ identity, purpose: 'owner' })).slice(0, 32)}`)
                expect(await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)).toEqual(request)
                for (const action of ['prepare', 'read']) {
                  expect(await c.module.authorizeManagedTransferDestinationExecution({ action, request }, c.options)).toEqual({ action, request })
                }
                const rows = (await db.query('SELECT request,request_json,request_digest FROM page_studio_managed_transfer_destination_executions')).rows
                const { collectionCanonical } = await import('~~/shared/pageStudio/collectionApi')
                expect(rows).toEqual([{ request, request_json: collectionCanonical(request), request_digest: await collectionDigest(request) }])
                expect((await db.query('SELECT environment,state FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging', state: 'managed' }])
                expect((await db.query('SELECT current_checkpoint_id,status FROM page_studio_sites')).rows).toEqual([{ current_checkpoint_id: 'checkpoint_a', status: 'draft' }])
              })
              it('requires independently retained catalogue verification before reserving execution', async () => {
                const c = await setup(false)
                await expect(c.module.prepareManagedTransferDestinationExecution(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
                expect((await db.query('SELECT * FROM page_studio_managed_transfer_destination_executions')).rows).toEqual([])
              })
              it.each(['staging', undefined, 'preview'])('refuses untrusted release environment %s', async (environment) => {
                const c = await setup()
                await expect(c.module.prepareManagedTransferDestinationExecution(c.value, { ...c.options, env: { ...c.options.env, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: environment } })).rejects.toMatchObject({ statusCode: 503 })
              })
              it.each(['account', 'namespace', 'runtime', 'compatibility', 'same-runtime'])('rejects policy %s mismatch before saving', async (field) => {
                const c = await setup(), changed = structuredClone(policy)
                if (field === 'account') changed.accountId = 'b'.repeat(32)
                if (field === 'namespace') changed.namespace = 'xeroflow-page-studio-dispatch-staging'
                if (field === 'runtime') changed.from.digest = '0'.repeat(64)
                if (field === 'compatibility') changed.from.compatibilityDate = '2026-07-15'
                if (field === 'same-runtime') changed.to.digest = changed.from.digest
                await expect(c.module.prepareManagedTransferDestinationExecution(c.value, { ...c.options,
                  env: { ...c.options.env, MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify(changed) } })).rejects.toMatchObject({ statusCode: expect.any(Number) })
                expect((await db.query('SELECT * FROM page_studio_managed_transfer_destination_executions')).rows).toEqual([])
              })
              it('does not replace a retained request when the reviewed policy changes', async () => {
                const c = await setup()
                const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                const changed = { ...c.options, env: { ...c.options.env, MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify({ ...policy, to: { ...policy.to, digest: '9'.repeat(64) } }) } }
                await expect(c.module.prepareManagedTransferDestinationExecution(c.value, changed)).rejects.toMatchObject({ statusCode: 409 })
                await expect(c.module.authorizeManagedTransferDestinationExecution({ action: 'read', request }, changed)).rejects.toMatchObject({ statusCode: 409 })
                expect(await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)).toEqual(request)
                await expect(db.query('UPDATE page_studio_managed_transfer_destination_executions SET request_digest=$1', ['0'.repeat(64)])).rejects.toThrow(/immutable/i)
                await expect(db.query('DELETE FROM page_studio_managed_transfer_destination_executions')).rejects.toThrow(/immutable/i)
              })
              it.each(['source-freeze', 'actor', 'script', 'catalogue', 'action', 'extra'])('rejects substituted callback %s', async (field) => {
                const c = await setup()
                const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                const callback: Record<string, unknown> = { action: 'prepare', request }
                if (field === 'source-freeze') request.freezeRequest = sourceFreeze.request
                if (field === 'actor') request.freezeRequest.actor.userId = randomUUID()
                if (field === 'script') request.successor.scriptName = `ps-content-${'0'.repeat(32)}`
                if (field === 'catalogue') request.catalogueReceipt.digest = '0'.repeat(64)
                if (field === 'action') callback.action = 'activate'
                if (field === 'extra') callback.freeze = sourceFreeze
                await expect(c.module.authorizeManagedTransferDestinationExecution(callback, c.options)).rejects.toMatchObject({ statusCode: 403 })
              })
              it.each([
                'UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()',
                'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()',
                'UPDATE page_studio_workspace_memberships SET role=\'manager\'',
                'UPDATE page_studio_entitlements SET storage_bytes_limit=storage_bytes_limit+1 WHERE status=\'active\'',
                'DELETE FROM page_studio_cms_record_heads'
              ])('rechecks original source authority on every prepared callback: %s', async (sql) => {
                const c = await setup()
                const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                await db.query(sql)
                for (const action of ['prepare', 'read']) await expect(c.module.authorizeManagedTransferDestinationExecution({ action, request }, c.options)).rejects.toMatchObject({ statusCode: expect.any(Number) })
              })
              it('rejects a corrupt historical catalogue verification instead of trusting its ready label', async () => {
                const c = await setup()
                await db.query('ALTER TABLE page_studio_managed_transfer_catalogue_verifications DISABLE TRIGGER USER')
                try {
                  await db.query('UPDATE page_studio_managed_transfer_catalogue_verifications SET receipt_digest=$1,receipt=jsonb_set(receipt,\'{digest}\',to_jsonb($1::text))', ['0'.repeat(64)])
                } finally {
                  await db.query('ALTER TABLE page_studio_managed_transfer_catalogue_verifications ENABLE TRIGGER USER')
                }
                await expect(c.module.prepareManagedTransferDestinationExecution(c.value, c.options)).rejects.toMatchObject({ statusCode: 409 })
              })
              it.each(['request_digest', 'request_json'])('rejects corrupted retained %s on callback', async (field) => {
                const c = await setup()
                const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                await db.query('ALTER TABLE page_studio_managed_transfer_destination_executions DISABLE TRIGGER USER')
                try {
                  if (field === 'request_digest') await db.query('UPDATE page_studio_managed_transfer_destination_executions SET request_digest=$1', ['0'.repeat(64)])
                  else await db.query('UPDATE page_studio_managed_transfer_destination_executions SET request_json=\' \' || request_json')
                } finally { await db.query('ALTER TABLE page_studio_managed_transfer_destination_executions ENABLE TRIGGER USER') }
                await expect(c.module.authorizeManagedTransferDestinationExecution({ action: 'read', request }, c.options)).rejects.toMatchObject({ statusCode: 403 })
              })
              it('requires a saved execution before admitting a valid independently derived request', async () => {
                const c = await setup()
                const { planManagedTransferDestinationExecution } = await import('~~/shared/pageStudio/managed-transfer-destination-execution')
                const request = await planManagedTransferDestinationExecution(c.catalogue, c.proof.receipt,
                  { version: policy.version, kind: policy.kind, from: policy.from, to: policy.to, formReceiptDigest: c.proof.receipt.receiptDigests.forms })
                await expect(c.module.authorizeManagedTransferDestinationExecution({ action: 'prepare', request }, c.options)).rejects.toMatchObject({ statusCode: 403 })
                expect((await db.query('SELECT * FROM page_studio_managed_transfer_destination_executions')).rows).toEqual([])
              })
              it('serializes competing reservations and returns the same immutable request on retry', async () => {
                const c = await setup()
                const results = await Promise.allSettled([c.module.prepareManagedTransferDestinationExecution(c.value, c.options),
                  c.module.prepareManagedTransferDestinationExecution(c.value, c.options)])
                expect(results.some(r => r.status === 'fulfilled')).toBe(true)
                for (const result of results) if (result.status === 'rejected') expect(result.reason).toMatchObject({ statusCode: 503 })
                const request = await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)
                for (const result of results) if (result.status === 'fulfilled') expect(result.value).toEqual(request)
                request.successor.scriptName = `ps-content-${'0'.repeat(32)}`
                expect((await c.module.prepareManagedTransferDestinationExecution(c.value, c.options)).successor.scriptName).not.toBe(request.successor.scriptName)
                expect((await db.query('SELECT count(*) FROM page_studio_managed_transfer_destination_executions')).rows[0].count).toBe('1')
              })
              it('rolls back prepared admission when the source changes before commit', async () => {
                const c = await setup()
                const changed = <T>(work: (tx: pg.Client) => Promise<T>) => runTransaction(async (tx) => {
                  const query = tx.query.bind(tx)
                  const wrapped = { query: async (sql: string, params?: unknown[]) => {
                    const result = await query(sql, params)
                    if (sql.includes('INSERT INTO page_studio_managed_transfer_destination_executions')) await query('DELETE FROM page_studio_cms_record_heads')
                    return result
                  } }
                  return work(wrapped as pg.Client)
                })
                await expect(c.module.prepareManagedTransferDestinationExecution(c.value, { ...c.options, runTransaction: changed })).rejects.toMatchObject({ statusCode: 409 })
                expect((await db.query('SELECT * FROM page_studio_managed_transfer_destination_executions')).rows).toEqual([])
              })
            })
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
          it('private preparation transport preserves original authority and never advances status', async () => {
            const c = await setup()
            const { handleManagedTransferPreparation } = await import('~~/workers/page-studio-management/src/managedTransferPreparation')
            const prepare = vi.fn(async () => ({ ...c.value, state: 'ready', identity: '1'.repeat(64) }))
            const env = { ...c.options.env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production',
              PAGE_STUDIO_PROVISIONER: { ...c.service, prepareManagedTransferExecution: prepare } }
            const request = { ...c.value, phase: 'source-execution', action: 'status', expectedEnvironment: 'production' }
            expect(await handleManagedTransferPreparation(request, env, runTransaction)).toMatchObject({ ok: true, value: { state: 'not-started' } })
            expect(c.service.discoverManagedTransferExecution).not.toHaveBeenCalled()
            expect(prepare).not.toHaveBeenCalled()
            expect(await handleManagedTransferPreparation({ ...request, action: 'start' }, env, runTransaction)).toMatchObject({ ok: true, value: { state: 'ready' } })
            expect(prepare).toHaveBeenCalledTimes(1)
            await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
            expect(await handleManagedTransferPreparation(request, env, runTransaction)).toMatchObject({ ok: false, error: { statusCode: 403 } })
            expect(prepare).toHaveBeenCalledTimes(1)
          })
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
