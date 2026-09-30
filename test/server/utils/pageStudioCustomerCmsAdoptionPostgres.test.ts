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

describe.runIf(Boolean(databaseUrl))('native customer CMS adoption on PostgreSQL', () => {
  const schema = `customer_adoption_${randomUUID().replaceAll('-', '')}`
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
    await db.query('DROP FUNCTION IF EXISTS fail_customer_activation() CASCADE')
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
  const managed = async (adopted = true) => {
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
    if (adopted) {
      await db.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest)
      VALUES($1,$2,$3,$4,$5,'staging','legacy','fixture_adoption',$6,$7,$8)`, [key, scope.tenantId, scope.clientId, scope.businessId, scope.siteId, generation, graphFixture.base.target, 'b'.repeat(64)])
      await db.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id)
      VALUES($1,$2,$3,$4,$5,'fixture_adoption')`, [key, generation, appId, await collectionDigest(application), application])
      await db.query('UPDATE page_studio_cms_scopes SET state=\'managed\',current_application_id=$2 WHERE scope_key=$1', [key, appId])
    }
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
  const setupAdoption = async () => {
    const f = await managed(false)
    let freeze: Record<string, unknown> | null = null
    const router = {
      readManagedCmsTarget: vi.fn(async () => graphFixture.base.target),
      freezeManagedCms: vi.fn(async (request: unknown) => {
        if (!freeze) {
          const body = { state: 'frozen', createdAt: new Date().toISOString(), request }
          freeze = { ...body, digest: await collectionDigest(body) }
        }
        return freeze
      }),
      readManagedCmsFreeze: vi.fn(async () => freeze),
      readFrozenCmsPage: vi.fn(async (request: { cursor: unknown, limit: number }) => {
        const counts = { content: 0, schema: 0, record: 0 }
        const inventoryIdentity = await collectionDigest({ counts, formatVersion: 1, freezeDigest: freeze!.digest })
        return { counts, inventoryIdentity, items: [], nextCursor: null,
          pageDigest: await collectionDigest({ cursor: request.cursor, limit: request.limit, inventoryIdentity,
            formatVersion: 1, items: [], nextCursor: null }) }
      }),
      readManagedCmsObjects: vi.fn(async () => [])
    }
    const principal = { ...f.principal, capability: 'workspace:create' as const,
      env: { ...f.env, PAGE_STUDIO_CONTENT_ROUTER: router } }
    const call = async (input: unknown, authority = principal) => {
      const { coordinateCmsAdoption } = await import('~~/server/utils/pageStudio/cmsAdoptionCoordinator')
      return coordinateCmsAdoption(input, authority, { runTransaction })
    }
    const advance = async (current: Awaited<ReturnType<typeof call>>) => call({ action: 'advance',
      adoptionId: current.adoptionId, expectedProgressDigest: current.progressDigest })
    return { ...f, router, principal, call, advance }
  }
  it('adopts an owned customer CMS, retains its component and permits a subsequent page save', async () => {
    const f = await setupAdoption()
    expect((await f.call({ action: 'status' })).phase).toBe('idle')
    expect(f.router.readManagedCmsTarget).not.toHaveBeenCalled()
    const started = await f.call({ action: 'start' })
    expect(started.phase).toBe('freezing')
    expect(await f.call({ action: 'start' })).toEqual(started)
    const imported = await f.advance(started)
    expect(imported.phase).toBe('importing')
    expect(imported.progress?.consumed).toBe(0)
    const ready = await f.advance(imported)
    expect(ready.phase).toBe('ready')
    const done = await f.advance(ready)
    expect(done.phase).toBe('managed')
    expect(await f.advance(ready)).toEqual(done)
    const adoption = (await db.query('SELECT adoption_request,adoption_receipt FROM page_studio_cms_scopes')).rows[0]
    expect(adoption.adoption_request.actor).toEqual({ kind: 'customer-user', userId: f.claims.userId, loginSessionHash: hash(token) })
    expect(adoption.adoption_receipt.activatedBy.source).toBe('customer-session')
    expect((await db.query('SELECT actor_role FROM page_studio_audit_events WHERE action=\'cms.adopt\'')).rows).toEqual([{ actor_role: 'customer' }])
    expect(JSON.stringify(done)).not.toContain(hash(token))
    expect(await f.commit(await f.draft())).toMatchObject({ acknowledged: true, isCurrent: true })
    expect((await db.query('SELECT app.manifest FROM page_studio_application_versions app JOIN page_studio_cms_scopes scope ON scope.current_application_id=app.id')).rows[0].manifest.components).toEqual([f.pin])
  })
  it('requires setup capability and leaves checkpoint authority insufficient', async () => {
    const f = await setupAdoption()
    await expect(f.call({ action: 'start' }, { ...f.principal, capability: 'workspace:checkpoint' } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.router.readManagedCmsTarget).not.toHaveBeenCalled()
  })
  it('rejects logout between target discovery and intent persistence', async () => {
    const f = await setupAdoption()
    f.router.readManagedCmsTarget.mockImplementationOnce(async () => {
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
      return graphFixture.base.target
    })
    await expect(f.call({ action: 'start' })).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT count(*) FROM page_studio_cms_scopes')).rows[0].count).toBe('0')
    expect(f.router.freezeManagedCms).not.toHaveBeenCalled()
  })
  it('retains pending state when logout happens during a remote freeze', async () => {
    const f = await setupAdoption(), started = await f.call({ action: 'start' })
    const freeze = f.router.freezeManagedCms.getMockImplementation()!
    f.router.freezeManagedCms.mockImplementationOnce(async (request) => {
      const result = await freeze(request)
      await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp()')
      return result
    })
    await expect(f.advance(started)).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.query('SELECT state FROM page_studio_cms_scopes')).rows[0].state).toBe('freezing')
    expect((await db.query('SELECT count(*) FROM page_studio_application_versions')).rows[0].count).toBe('0')
  })
  it.each(['production', 'foreign-site'])('denies %s setup before storage calls', async (reason) => {
    const f = await setupAdoption()
    if (reason === 'production') f.principal.env.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'production'
    else f.principal.claims.siteId = randomUUID()
    await expect(f.call({ action: 'start' })).rejects.toMatchObject({ statusCode: 403 })
    expect(f.router.readManagedCmsTarget).not.toHaveBeenCalled()
  })
  it('serializes competing setup requests onto one durable intent', async () => {
    const f = await setupAdoption()
    const [a, b] = await Promise.all([f.call({ action: 'start' }), f.call({ action: 'start' })])
    expect(a).toEqual(b)
    expect((await db.query('SELECT count(*) FROM page_studio_cms_scopes')).rows[0].count).toBe('1')
    expect(f.router.freezeManagedCms).not.toHaveBeenCalled()
  })
  it('requires explicit recovery for a fresh login and preserves original setup provenance', async () => {
    const f = await setupAdoption(), original = await f.call({ action: 'start' })
    const nextToken = 'b'.repeat(64)
    await db.query(`INSERT INTO page_studio_customer_sessions(token_hash,account_id,expires_at)
      SELECT $1,account_id,expires_at FROM page_studio_customer_sessions WHERE token_hash=$2`, [hash(nextToken), hash(token)])
    const { issueCustomerEditorHandoff } = await import('~~/server/utils/pageStudio/customerEditorHandoff')
    const exchanged = await exchange((await issueCustomerEditorHandoff(nextToken, config, { runTransaction })).token)
    const { verifyCustomerEditorToken } = await import('~~/server/utils/pageStudio/customerEditorToken')
    const fresh = { ...f.principal, claims: await verifyCustomerEditorToken(exchanged.token, publicPem, issuer) }
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [hash(token)])
    const current = await f.call({ action: 'status' }, fresh)
    expect(current.recoveryRequired).toBe(true)
    await expect(f.call({ action: 'advance', adoptionId: original.adoptionId, expectedProgressDigest: current.progressDigest }, fresh)).rejects.toMatchObject({ statusCode: 409 })
    const recovery = { action: 'recover', adoptionId: original.adoptionId, recoveryId: 'recovery_customer', expectedRecoveryId: null }
    let recovered = await f.call(recovery, fresh)
    expect(recovered.recoveryRequired).toBe(false)
    expect(await f.call(recovery, fresh)).toEqual(recovered)
    for (let page = 0; page < 3; page++) recovered = await f.call({ action: 'advance', adoptionId: original.adoptionId, expectedProgressDigest: recovered.progressDigest }, fresh)
    expect(recovered.phase).toBe('managed')
    const row = (await db.query('SELECT adoption_request,adoption_receipt FROM page_studio_cms_scopes')).rows[0]
    expect(row.adoption_request.actor.loginSessionHash).toBe(hash(token))
    expect(row.adoption_receipt.activatedBy.actor.loginSessionHash).toBe(hash(nextToken))
    expect((await db.query('SELECT actor_role FROM page_studio_audit_events WHERE action=\'cms.adoption.recover\'')).rows).toEqual([{ actor_role: 'customer' }])
    await expect(f.call({ action: 'status' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects changed storage targets before dispatching a freeze', async () => {
    const f = await setupAdoption(), started = await f.call({ action: 'start' })
    f.router.readManagedCmsTarget.mockResolvedValue({ ...graphFixture.base.target, databaseId: randomUUID() })
    await expect(f.advance(started)).rejects.toThrow('target changed')
    expect(f.router.freezeManagedCms).not.toHaveBeenCalled()
  })
  it('rolls back application and audit when activation cannot update the CMS pointer', async () => {
    const f = await setupAdoption()
    const ready = await f.advance(await f.advance(await f.call({ action: 'start' })))
    await db.query(`CREATE FUNCTION fail_customer_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.state='managed' THEN RAISE EXCEPTION 'activation failed'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_customer_activation BEFORE UPDATE ON page_studio_cms_scopes FOR EACH ROW EXECUTE FUNCTION fail_customer_activation();`)
    await expect(f.advance(ready)).rejects.toThrow('activation failed')
    expect((await db.query('SELECT count(*) FROM page_studio_application_versions')).rows[0].count).toBe('0')
    expect((await db.query('SELECT count(*) FROM page_studio_audit_events WHERE action=\'cms.adopt\'')).rows[0].count).toBe('0')
    expect((await db.query('SELECT state FROM page_studio_cms_scopes')).rows[0].state).toBe('importing')
  })
  it('rejects caller-selected scope or storage in setup requests', async () => {
    const f = await setupAdoption()
    await expect(f.call({ action: 'start', scope: f.scope })).rejects.toMatchObject({ statusCode: 400 })
    await expect(f.call({ action: 'start', target: graphFixture.base.target })).rejects.toMatchObject({ statusCode: 400 })
    expect(f.router.readManagedCmsTarget).not.toHaveBeenCalled()
  })
  it.each(['business-content', 'collection-schema', 'collection-record', 'action-execution', 'image-billing', 'customer-checkpoint'])('setup authority cannot perform %s mutations', async (mutation) => {
    const f = await setupAdoption()
    const { withCmsCommitAuthority } = await import('~~/server/utils/pageStudio/cmsCommitAuthority')
    const work = vi.fn()
    await expect(withCmsCommitAuthority({ scope: f.scope, principal: f.principal, mutation: mutation as never }, work, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(work).not.toHaveBeenCalled()
  })
  it('rejects a changed checkpoint before accepting the initial application', async () => {
    const f = await setupAdoption()
    const ready = await f.advance(await f.advance(await f.call({ action: 'start' })))
    await db.query('UPDATE page_studio_checkpoints SET digest=$1', ['f'.repeat(64)])
    await expect(f.advance(ready)).rejects.toThrow()
    expect((await db.query('SELECT count(*) FROM page_studio_application_versions')).rows[0].count).toBe('0')
  })
})
