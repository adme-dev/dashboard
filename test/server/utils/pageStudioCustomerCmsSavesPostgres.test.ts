import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import graphFixture from '../../fixtures/pageStudioCmsGraph.json'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: native.transaction, transactionWithoutRetry: native.transaction }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const ids = { owner: randomUUID(), other: randomUUID(), client: randomUUID(), staff: randomUUID() }

describe.runIf(Boolean(databaseUrl))('native customer managed CMS saves on PostgreSQL', () => {
  const schema = `customer_cms_${randomUUID().replaceAll('-', '')}`
  let db: pg.Client
  let workspaces: typeof import('~~/server/utils/pageStudio/customerWorkspaces')
  const runTransaction = async <T>(callback: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { await client.end() }
  }
  const workspace = async (identityId = ids.owner) => (await workspaces.createCustomerWorkspace({ identityId, requestId: randomUUID(), name: 'Customer business' }, runTransaction)).workspace.id

  let privatePem: string, publicPem: string
  beforeAll(async () => {
    const keys = await generateKeyPair('ES256', { extractable: true })
    privatePem = await exportPKCS8(keys.privateKey)
    publicPem = await exportSPKI(keys.publicKey)
    expect(['127.0.0.1', 'localhost']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID REFERENCES agency_clients(id), status TEXT, role TEXT);
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT, UNIQUE (role_id, permission_group));
    `)
    await db.query(migration('402_page_studio_control_plane.sql'))
    await db.query(migration('442_page_studio_customer_workspaces.sql'))
    await db.query(migration('443_page_studio_customer_signup.sql'))
    await db.query(migration(ownershipMigration))
    await db.query(migration('445_page_studio_customer_provisioning.sql'))
    await db.query(migration('445_page_studio_customer_provisioning.sql'))
    await db.query(migration('446_page_studio_customer_editor_handoffs.sql'))
    await db.query(migration('446_page_studio_customer_editor_handoffs.sql'))
    await db.query(migration('447_page_studio_customer_editor_sessions.sql'))
    await db.query(migration('447_page_studio_customer_editor_sessions.sql'))
    await db.query(migration('404_page_studio_documents.sql'))
    await db.query(migration('422_page_studio_cms_visibility.sql'))
    await db.query(migration('425_page_studio_cms_authoring_scope.sql'))
    workspaces = await import('~~/server/utils/pageStudio/customerWorkspaces')
  })
  beforeEach(async () => {
    await db.query('DROP FUNCTION IF EXISTS fail_customer_pointer() CASCADE')
    await db.query(`TRUNCATE agency_clients, team_members, page_studio_customer_identities CASCADE`)
    await db.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [ids.client])
    await db.query('INSERT INTO team_members VALUES ($1, TRUE)', [ids.staff])
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, verified_at)
      VALUES ($1::uuid, 'studio', $1::uuid::text, NOW()), ($2::uuid, 'studio', $2::uuid::text, NOW())`, [ids.owner, ids.other])
    native.transaction.mockImplementation(runTransaction)
  })
  afterAll(async () => {
    if (!db) return
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })

  const token = 'a'.repeat(64)
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  beforeEach(async () => {
    const wid = await workspace()
    const accountId = randomUUID()
    await db.query(`UPDATE page_studio_customer_identities SET subject = $1 WHERE id = $2`, [accountId, ids.owner])
    await db.query(`INSERT INTO page_studio_customer_accounts (id, email, name, identity_id, status, terms_version)
      VALUES ($1, 'owner@example.test', 'Owner', $2, 'active', 'v1')`, [accountId, ids.owner])
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash, account_id, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '1 day')`, [hash(token), accountId])
    const { createCustomerPreviewSite } = await import('~~/server/utils/pageStudio/customerSites')
    await createCustomerPreviewSite({ workspaceId: wid, identityId: ids.owner, requestId: randomUUID(),
      name: 'Customer Flowers', route: 'flowers', starterVersion: 'floristry-v1' }, { runTransaction,
      previewPolicy: { approvalId: randomUUID(), approvedBy: ids.staff, expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        pagesPerSiteLimit: 5, storageBytesLimit: 104857600, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 1073741824 } })
    await db.query('INSERT INTO page_studio_customer_setup_drafts (identity_id, workspace_id, draft) VALUES ($1, $2, $3::jsonb)', [ids.owner, wid, JSON.stringify({ businessName: 'Customer Flowers', businessType: 'Florist', timezone: 'UTC', goals: ['enquiries'] })])
  })
  const config = { enabled: true, dashboardOrigin: 'https://customers.example.test', editorOrigin: 'https://studio.example.test' }
  const issuer = config.dashboardOrigin
  const ticket = async () => {
    const api = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    return api.issueCustomerEditorHandoff(token, config, { runTransaction })
  }
  const exchange = async (value: string, signOverride?: (claims: unknown) => Promise<string>) => {
    const api = await import('~~/server/utils/pageStudio/customerEditorSessions')
    const jwt = await import('~~/server/utils/pageStudio/customerEditorToken')
    return api.exchangeCustomerEditorSession(value, config, { runTransaction,
      signToken: signOverride ?? (claims => jwt.signCustomerEditorToken(claims, privatePem, issuer)) })
  }
  const session = async () => {
    const result = await exchange((await ticket()).token)
    const { verifyCustomerEditorToken } = await import('~~/server/utils/pageStudio/customerEditorToken')
    return { ...result, claims: await verifyCustomerEditorToken(result.token, publicPem, issuer) }
  }
  const checkpoint = (claims: { siteId: string, clientId: string, tenantId: string, userId: string }, id = `draft_${randomUUID()}`) => ({
    checkpointId: id, createdAt: new Date().toISOString(), digest: 'a'.repeat(64), etag: 'saved-etag', userId: claims.userId,
    objectKey: `tenants/${claims.tenantId}/clients/${claims.clientId}/sites/${claims.siteId}/checkpoints/${id}.json`,
    scope: { siteId: claims.siteId, clientId: claims.clientId, tenantId: claims.tenantId }
  })
  const managed = async () => {
    const { claims } = await session()
    const scope = { tenantId: claims.tenantId, clientId: claims.clientId, businessId: claims.clientId, siteId: claims.siteId, environment: 'staging' as const }
    const key = JSON.stringify(Object.values(scope))
    const generation = randomUUID(), appId = randomUUID()
    const artifact = JSON.parse(graphFixture.artifactBytes[0]!)
    artifact.scope = scope
    const pin = { ...graphFixture.base.application.manifest.components[0]!, sha256: await collectionDigest(artifact) }
    const manifest = { ...structuredClone(graphFixture.base.checkpoint.manifest), id: scope.siteId }
    manifest.builderLibrary = { scope, components: [pin] }
    const baseDigest = await collectionDigest(manifest)
    const application = { ...structuredClone(graphFixture.base.application.manifest), scope, generation, applicationId: appId,
      checkpoint: { id: 'base_checkpoint', digest: baseDigest }, components: [pin] }
    const objectKey = (id: string) => `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${id}.json`
    await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
      VALUES('base_checkpoint',$1,$2,$3,$4,$5,'base',clock_timestamp())`, [scope.tenantId, scope.clientId, scope.siteId, baseDigest, objectKey('base_checkpoint')])
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=\'base_checkpoint\' WHERE id=$1', [scope.siteId])
    await db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest)
      VALUES($1,$2,$3,$4,$5,'staging','legacy','fixture_adoption',$6,$7,$8)`, [key, scope.tenantId, scope.clientId, scope.businessId, scope.siteId, generation, graphFixture.base.target, 'b'.repeat(64)])
    await db.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id)
      VALUES($1,$2,$3,$4,$5,'fixture_adoption')`, [key, generation, appId, await collectionDigest(application), application])
    await db.query('UPDATE page_studio_cms_scopes SET state=\'managed\',current_application_id=$2 WHERE scope_key=$1', [key, appId])
    const texts = new Map<string, string>()
    texts.set(objectKey('base_checkpoint'), JSON.stringify({ schemaVersion: 1, checkpointId: 'base_checkpoint', scope, manifest, digest: baseDigest }))
    texts.set(`builder-artifacts/v1/${hash(key)}/component/${pin.id}/${pin.version}/${pin.sha256}.json`, collectionCanonical(artifact))
    const get = vi.fn(async (key: string) => {
      const raw = texts.get(key)
      if (!raw) return null
      return { body: new Response(raw).body!, size: new TextEncoder().encode(raw).byteLength }
    })
    const env = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CHECKPOINTS: { get },
      PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget: async () => graphFixture.base.target } }
    const principal = { source: 'customer-session' as const, claims, env, capability: 'workspace:checkpoint' as const }
    const draft = async (id = `save_${randomUUID()}`) => {
      const next = structuredClone(manifest)
      next.pages[0]!.title = 'Customer edited home'
      const cp = { ...checkpoint(claims, id), digest: await collectionDigest(next) }
      texts.set(cp.objectKey, JSON.stringify({ schemaVersion: 1, checkpointId: cp.checkpointId, scope, manifest: next, digest: cp.digest }))
      return { checkpoint: cp, expectedCheckpointId: 'base_checkpoint' }
    }
    const commit = async (input: Awaited<ReturnType<typeof draft>>) => {
      const { commitCustomerEditorCheckpoint } = await import('~~/server/utils/pageStudio/customerEditorSessions')
      return commitCustomerEditorCheckpoint(input, claims, { runTransaction, env })
    }
    return { claims, scope, key, appId, pin, principal, env, texts, get, draft, commit }
  }
  it('atomically saves pages and the managed application with customer provenance', async () => {
    const f = await managed(), input = await f.draft()
    expect(await f.commit(input)).toMatchObject({ acknowledged: true, checkpointId: input.checkpoint.checkpointId, isCurrent: true })
    const app = (await db.query('SELECT manifest FROM page_studio_application_versions WHERE previous_application_id=$1', [f.appId])).rows[0].manifest
    expect(app.checkpoint.id).toBe(input.checkpoint.checkpointId)
    expect(app.components).toEqual([f.pin])
    expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe(input.checkpoint.checkpointId)
    const audits = (await db.query('SELECT actor_role,metadata FROM page_studio_audit_events WHERE action=\'workspace.checkpointed\'')).rows
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ actor_role: 'customer', metadata: { customerEditor: { sessionId: f.claims.nonce, workspaceId: f.claims.workspaceId } } })
    expect(audits[0].metadata.stagingOrigin).toBeUndefined()
    expect((await db.query('SELECT COUNT(*) FROM page_studio_versions')).rows[0].count).toBe('0')
    expect(await f.commit(input)).toMatchObject({ isCurrent: true })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_application_versions')).rows[0].count).toBe('2')
  })
  it('rejects revoked native authority after remote bytes are read', async () => {
    const f = await managed(), input = await f.draft()
    const get = f.get.getMockImplementation()!
    f.get.mockImplementationOnce(async (key) => {
      const result = await get(key)
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
      return result
    })
    await expect(f.commit(input)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe('base_checkpoint')
    expect((await db.query('SELECT COUNT(*) FROM page_studio_application_versions')).rows[0].count).toBe('1')
  })
  it('keeps the accepted graph unchanged for stale saves and tampered content', async () => {
    const f = await managed(), input = await f.draft()
    await expect(f.commit({ ...input, expectedCheckpointId: null })).rejects.toMatchObject({ statusCode: 409 })
    f.texts.set(input.checkpoint.objectKey, '{}')
    await expect(f.commit(input)).rejects.toThrow()
    expect((await db.query('SELECT COUNT(*) FROM page_studio_cms_commits')).rows[0].count).toBe('0')
  })
  it.each(['collection-schema', 'collection-record', 'action-execution', 'image-billing', 'business-content'])('denies unrelated %s mutation', async (mutation) => {
    const f = await managed()
    const { withCmsCommitAuthority } = await import('~~/server/utils/pageStudio/cmsCommitAuthority')
    const work = vi.fn()
    await expect(withCmsCommitAuthority({ scope: f.scope, principal: f.principal, mutation: mutation as never }, work, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(work).not.toHaveBeenCalled()
  })
  it.each(['scope', 'author', 'origin-environment'])('denies a foreign %s without remote storage reads', async (reason) => {
    const f = await managed(), input = await f.draft()
    const { coordinateCmsGraphCheckpoint } = await import('~~/server/utils/pageStudio/cmsGraphCoordinator')
    if (reason === 'scope') input.checkpoint.scope.siteId = randomUUID()
    if (reason === 'author') input.checkpoint.userId = randomUUID()
    if (reason === 'origin-environment') f.env.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'production'
    await expect(coordinateCmsGraphCheckpoint(input, f.principal, { runTransaction })).rejects.toThrow()
    expect(f.get).not.toHaveBeenCalled()
  })
  it('cannot use customer authority for feature, AI or history acceptance', async () => {
    const f = await managed(), input = await f.draft()
    const api = await import('~~/server/utils/pageStudio/cmsGraphCoordinator')
    const { coordinateCmsAdoption } = await import('~~/server/utils/pageStudio/cmsAdoptionCoordinator')
    await expect(coordinateCmsAdoption({ action: 'start' }, f.principal, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    await expect(api.coordinateCmsGraphTransition({} as never, f.principal, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    await expect(api.coordinateCmsGraphRestore({}, f.principal, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    await expect(api.coordinateCmsGraphCheckpoint(input, f.principal, { runTransaction }, { mode: 'ai-page' })).rejects.toMatchObject({ statusCode: 403 })
    expect(f.get).not.toHaveBeenCalled()
  })
  it('rejects modifying the retained graph through an ordinary page save', async () => {
    const f = await managed(), input = await f.draft()
    const raw = JSON.parse(f.texts.get(input.checkpoint.objectKey)!)
    raw.manifest.builderLibrary.components = []
    raw.digest = await collectionDigest(raw.manifest)
    input.checkpoint.digest = raw.digest
    f.texts.set(input.checkpoint.objectKey, JSON.stringify(raw))
    await expect(f.commit(input)).rejects.toThrow()
    expect((await db.query('SELECT current_application_id FROM page_studio_cms_scopes')).rows[0].current_application_id).toBe(f.appId)
  })
  it('rolls back both heads and audit when the final CMS pointer write fails', async () => {
    const f = await managed(), input = await f.draft()
    await db.query(`CREATE FUNCTION fail_customer_pointer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
      CREATE TRIGGER fail_customer_pointer BEFORE UPDATE ON page_studio_cms_scopes FOR EACH ROW EXECUTE FUNCTION fail_customer_pointer();`)
    await expect(f.commit(input)).rejects.toThrow('injected failure')
    expect((await db.query('SELECT current_application_id FROM page_studio_cms_scopes')).rows[0].current_application_id).toBe(f.appId)
    expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe('base_checkpoint')
    expect((await db.query('SELECT COUNT(*) FROM page_studio_application_versions')).rows[0].count).toBe('1')
    expect((await db.query('SELECT COUNT(*) FROM page_studio_audit_events WHERE action=\'cms.graph.accepted\'')).rows[0].count).toBe('0')
  })
  it('serializes competing saves without splitting the CMS and page heads', async () => {
    const f = await managed(), a = await f.draft(), b = await f.draft()
    const results = await Promise.allSettled([f.commit(a), f.commit(b)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } })
    const saved = (await db.query(`SELECT site.current_checkpoint_id, app.manifest FROM page_studio_sites site
      JOIN page_studio_cms_scopes cms ON cms.site_id=site.id JOIN page_studio_application_versions app ON app.id=cms.current_application_id`)).rows[0]
    expect(saved.manifest.checkpoint.id).toBe(saved.current_checkpoint_id)
    expect((await db.query('SELECT COUNT(*) FROM page_studio_cms_commits')).rows[0].count).toBe('1')
  })
  it('denies replay after native logout', async () => {
    const f = await managed(), input = await f.draft()
    await f.commit(input)
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
    await expect(f.commit(input)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT COUNT(*) FROM page_studio_cms_commits')).rows[0].count).toBe('1')
  })
  it('rolls back work when native authority expires before transaction completion', async () => {
    const f = await managed()
    await db.query('UPDATE page_studio_customer_sessions SET expires_at=clock_timestamp()+INTERVAL \'500 milliseconds\'')
    const { withCmsCommitAuthority } = await import('~~/server/utils/pageStudio/cmsCommitAuthority')
    await expect(withCmsCommitAuthority({ scope: f.scope, principal: f.principal, mutation: 'customer-checkpoint' }, async (tx) => {
      await tx.query('UPDATE page_studio_sites SET name=\'uncommitted\'')
      await vi.waitFor(async () => {
        expect((await db.query('SELECT expires_at < clock_timestamp() AS expired FROM page_studio_customer_sessions')).rows[0].expired).toBe(true)
      }, { timeout: 2500, interval: 10 })
    }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT name FROM page_studio_sites')).rows[0].name).toBe('Customer Flowers')
  })
})
