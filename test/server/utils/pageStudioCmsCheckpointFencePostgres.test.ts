import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginCmsAdoption,
  recoverCmsAdoption,
  registerCmsFreeze,
  importFrozenCmsPage,
  activateCmsAdoption
} from '~~/server/utils/pageStudio/cmsAdoption'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import type { ContentAuthorityRequest } from '~~/server/utils/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => {
    throw new Error('Use disposable transaction')
  },
  queryOneFresh: () => {
    throw new Error('Use locked transaction')
  }
}))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1'
    || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname)
    || url.search
  )
    throw new Error('Disposable localhost studio_cms database required')
}
describe.runIf(Boolean(databaseUrl))('CMS adoption checkpoint fence on disposable PostgreSQL', () => {
  let observer: pg.Client,
    connections: pg.Client[],
    schema: string,
    scope: PageStudioContentScope,
    request: ContentAuthorityRequest
  async function connect() {
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connections.push(db)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('SET statement_timeout=\'6s\'')
    return db
  }
  function transactionFor(db: pg.Client) {
    return async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => {
      await db.query('BEGIN')
      try {
        const result = await work(db as unknown as PageStudioControlQueryClient)
        await db.query('COMMIT')
        return result
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      }
    }
  }
  beforeEach(async () => {
    connections = []
    schema = `cms_${randomUUID().replaceAll('-', '')}`
    observer = await connect()
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query(`CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
      CREATE TABLE visible_effects(id BIGSERIAL PRIMARY KEY);`)
    for (const file of [
      '402_page_studio_control_plane.sql',
      '404_page_studio_documents.sql',
      '420_page_studio_login_sessions.sql',
      '422_page_studio_cms_visibility.sql'
    ]) {
      await observer.query(
        readFileSync(
          new URL(`../../../server/database/migrations/${file}`, import.meta.url),
          'utf8'
        )
      )
    }
    const clientId = randomUUID(),
      userId = randomUUID(),
      roleId = randomUUID()
    await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await observer.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    await observer.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\')', [
      roleId
    ])
    const entitlementId = (
      await observer.query(
        `INSERT INTO page_studio_entitlements(tenant_id,client_id,monthly_ai_operation_limit,active_site_limit,portal_creation_enabled,plan_metadata)
      VALUES('cms-tenant',$1,0,2,TRUE,'{"builder":{"collectionSchemas":true}}') RETURNING id`,
        [clientId]
      )
    ).rows[0].id
    const siteId = (
      await observer.query(
        `INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('cms-tenant',$1,$2,'CMS test','cms-test','fixture') RETURNING id`,
        [clientId, entitlementId]
      )
    ).rows[0].id
    scope = {
      tenantId: 'cms-tenant',
      clientId,
      businessId: clientId,
      siteId,
      environment: 'staging'
    }
    const hash = randomUUID().replaceAll('-', '').repeat(2)
    const login = (
      await observer.query(
        `INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,date_trunc('milliseconds',clock_timestamp())-INTERVAL '1hour',date_trunc('milliseconds',clock_timestamp())+INTERVAL '1day') RETURNING *`,
        [hash, userId]
      )
    ).rows[0]
    request = {
      siteId,
      actor: {
        role: 'agency',
        actorId: userId,
        tenantId: scope.tenantId,
        canEdit: true
      },
      login: {
        role: 'agency',
        userId,
        tokenHash: hash,
        issuedAt: login.issued_at,
        expiresAt: login.expires_at
      },
      env: {
        PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
        PAGE_STUDIO_CONTENT_ROUTER: {
          readContent() {
            throw new Error('No remote I/O')
          },
          writeContent() {
            throw new Error('No remote I/O')
          }
        }
      }
    }
  })
  afterEach(async () => {
    await Promise.all(connections.filter(db => db !== observer).map(db => db.end()))
    if (observer) {
      try {
        await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      } finally {
        await observer.end()
      }
    }
  })
  const target = {
    accountId: 'a'.repeat(32),
    databaseId: '20000000-0000-4000-8000-000000000001',
    name: `ps-content-${'b'.repeat(32)}`,
    routeId: 'route_a',
    runtimeDigest: 'a'.repeat(64),
    collectionReceiptDigest: 'b'.repeat(64),
    workflowReceiptDigest: 'c'.repeat(64),
    stagingReceiptDigest: 'd'.repeat(64)
  }
  async function fixture() {
    const actor = {
      kind: 'agency-user',
      userId: request.login.userId,
      loginSessionHash: request.login.tokenHash
    }
    const component = {
      formatVersion: 1,
      id: 'saved_component',
      version: 1,
      kind: 'component',
      scope,
      label: 'Saved',
      actions: [],
      dataBindings: [],
      defaults: {},
      properties: [],
      propertyBindings: [],
      root: { id: 'node_a', type: 'text', props: { text: 'Retained' }, children: [] }
    }
    const componentPin = {
      kind: 'component',
      id: component.id,
      version: 1,
      sha256: await collectionDigest(component)
    }
    const manifest = {
      schemaVersion: 2,
      id: scope.siteId,
      name: 'Site',
      defaultLocale: 'en-AU',
      pages: [{}],
      redirects: [],
      seo: { siteName: 'Site' },
      shell: {},
      theme: {},
      builderLibrary: { scope, components: [componentPin] }
    }
    const checkpoint = { id: 'checkpoint_a', digest: await collectionDigest(manifest) }
    await observer.query(
      `INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at) VALUES($1,$2,$3,$4,$5,$6,'fixture',clock_timestamp())`,
      [
        checkpoint.id,
        scope.tenantId,
        scope.clientId,
        scope.siteId,
        checkpoint.digest,
        `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpoint.id}.json`
      ]
    )
    await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=$2 WHERE id=$1', [
      scope.siteId,
      checkpoint.id
    ])
    const intent = {
      formatVersion: 1,
      scope,
      actor,
      target,
      adoptionId: 'adoption_a',
      generation: randomUUID(),
      expectedCheckpoint: checkpoint
    }
    const freezeBody = {
      state: 'frozen',
      createdAt: new Date().toISOString(),
      request: { formatVersion: 1, scope, actor, target, adoptionId: intent.adoptionId }
    }
    const freeze = { ...freezeBody, digest: await collectionDigest(freezeBody) }
    const page = async (cursor: unknown = null, limit = 1) => {
      const counts = { content: 0, record: 0, schema: 0 }
      const inventoryIdentity = await collectionDigest({ counts, formatVersion: 1, freezeDigest: freeze.digest })
      const items: never[] = []
      return { counts, inventoryIdentity, items, nextCursor: null, pageDigest: await collectionDigest({ cursor, formatVersion: 1, inventoryIdentity, items, limit, nextCursor: null }) }
    }
    return { intent, freeze, component, manifest, page }
  }

  const principal = () => ({ source: 'native-login' as const, request })
  async function dependencies() {
    return { runTransaction: transactionFor(await connect()) }
  }
  async function begin(s: Awaited<ReturnType<typeof fixture>>) {
    return await beginCmsAdoption(s.intent, principal(), await dependencies())
  }
  async function frozen(s: Awaited<ReturnType<typeof fixture>>) {
    return await registerCmsFreeze(s.intent, principal(), {
      ...(await dependencies()),
      readFreeze: async () => s.freeze
    })
  }
  async function ingest(
    s: Awaited<ReturnType<typeof fixture>>,
    cursor: unknown = null,
    limit = 1,
    override?: unknown
  ) {
    return await importFrozenCmsPage(
      { intent: s.intent, freezeDigest: s.freeze.digest, cursor, limit },
      principal(),
      {
        ...(await dependencies()),
        readPage: async () => override ?? (await s.page(cursor, limit)),
        readSchemas: async () => []
      }
    )
  }
  async function activate(s: Awaited<ReturnType<typeof fixture>>) {
    return await activateCmsAdoption(s.intent, principal(), {
      ...(await dependencies()),
      readCheckpoint: async () => ({
        checkpointId: s.intent.expectedCheckpoint.id,
        digest: s.intent.expectedCheckpoint.digest,
        manifest: s.manifest
      }),
      readComponent: async () => s.component
    })
  }

  const fenceError = { code: 'P0001', message: 'CMS_ADOPTION_IN_PROGRESS' }
  async function changeCheckpoint(db = observer, id: string | null = null) {
    return await db.query('UPDATE page_studio_sites SET current_checkpoint_id=$2 WHERE id=$1 RETURNING current_checkpoint_id', [scope.siteId, id])
  }
  async function head() {
    return (await observer.query('SELECT current_checkpoint_id FROM page_studio_sites WHERE id=$1', [scope.siteId])).rows[0].current_checkpoint_id
  }
  const capture = <T>(promise: Promise<T>) => promise.then(value => ({ value, error: null }), error => ({ value: null, error }))
  const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    return { promise, resolve }
  }
  async function blocked(waiter: pg.Client, blocker: pg.Client) {
    const waiterPid = (waiter as unknown as { processID: number }).processID
    const blockerPid = (blocker as unknown as { processID: number }).processID
    await expect.poll(async () => (await observer.query('SELECT $2=ANY(pg_blocking_pids($1)) AS blocked', [waiterPid, blockerPid])).rows[0].blocked, { timeout: 2000, interval: 20 }).toBe(true)
  }

  it.each(['freezing', 'importing'] as const)('blocks DISTINCT checkpoint changes during %s while allowing unchanged pointer', async (state) => {
    const s = await fixture()
    await begin(s)
    if (state === 'importing') await frozen(s)
    await expect(changeCheckpoint()).rejects.toMatchObject(fenceError)
    await expect(changeCheckpoint(observer, s.intent.expectedCheckpoint.id)).resolves.toMatchObject({ rowCount: 1 })
    expect(await head()).toBe(s.intent.expectedCheckpoint.id)
  })

  it('checks all matching site environments and leaves other sites and tenants alone', async () => {
    const s = await fixture()
    const foreignClient = randomUUID()
    await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [foreignClient])
    const createOther = async (tenant: string, clientId: string, route: string) => {
      const entitlement = (await observer.query('INSERT INTO page_studio_entitlements(tenant_id,client_id) VALUES($1,$2) RETURNING id', [tenant, clientId])).rows[0].id
      return (await observer.query('INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version) VALUES($1,$2,$3,\'Other\',$4,\'fixture\') RETURNING id', [tenant, clientId, entitlement, route])).rows[0].id
    }
    const otherTenant = await createOther('other-tenant', foreignClient, 'other')
    const entitlement = (await observer.query('SELECT entitlement_id FROM page_studio_sites WHERE id=$1', [scope.siteId])).rows[0].entitlement_id
    const otherSite = (await observer.query('INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version) VALUES($1,$2,$3,\'Other\',\'other-site\',\'fixture\') RETURNING id', [scope.tenantId, scope.clientId, entitlement])).rows[0].id
    // Independent environment row for the same global page head must also fence.
    const production = { ...s.intent.scope, environment: 'production' }
    const key = JSON.stringify([production.tenantId, production.clientId, production.businessId, production.siteId, production.environment])
    await observer.query('INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,pending_generation,target) VALUES($1,$2,$3,$4,$5,\'production\',\'freezing\',\'other-adoption\',$6,$7)', [key, production.tenantId, production.clientId, production.businessId, production.siteId, randomUUID(), target])
    await expect(changeCheckpoint()).rejects.toMatchObject(fenceError)
    // Seed distinct heads for unrelated sites so their updates exercise the trigger.
    for (const [id, tenant, client] of [[otherSite, scope.tenantId, scope.clientId], [otherTenant, 'other-tenant', foreignClient]]) {
      const checkpointId = `checkpoint_${id}`
      await observer.query('INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at) VALUES($1,$2,$3,$4,$5,$6,\'fixture\',clock_timestamp())', [checkpointId, tenant, client, id, 'e'.repeat(64), `checkpoint/${id}`])
      await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=$2 WHERE id=$1', [id, checkpointId])
    }
    await expect(observer.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL WHERE id=ANY($1::uuid[])', [[otherSite, otherTenant]])).resolves.toMatchObject({ rowCount: 2 })
    await observer.query('UPDATE page_studio_cms_scopes SET state=\'importing\' WHERE scope_key=$1', [key])
    await expect(changeCheckpoint()).rejects.toMatchObject(fenceError)
  })

  it('adoption commits first: an already-started SQL checkpoint update waits then sees the committed fence', async () => {
    const s = await fixture()
    const adopter = await connect(), writer = await connect()
    const ready = deferred(), release = deferred()
    const run = transactionFor(adopter)
    const adoption = capture(beginCmsAdoption(s.intent, principal(), { runTransaction: work => run(async (db) => {
      const result = await work(db)
      ready.resolve()
      await release.promise
      return result
    }) }))
    await ready.promise
    const update = capture(changeCheckpoint(writer))
    try {
      await blocked(writer, adopter)
      release.resolve()
      expect((await adoption).error).toBeNull()
      expect((await update).error).toMatchObject(fenceError)
      expect(await head()).toBe(s.intent.expectedCheckpoint.id)
    } finally {
      release.resolve()
      await adoption
      await update
    }
  })

  it.each(['REPEATABLE READ', 'SERIALIZABLE'] as const)('rejects an older %s snapshot instead of bypassing newly committed adoption', async (isolation) => {
    const s = await fixture()
    const writer = await connect()
    await writer.query(`BEGIN ISOLATION LEVEL ${isolation}`)
    await writer.query('SELECT current_checkpoint_id FROM page_studio_sites WHERE id=$1', [scope.siteId])
    await observer.query('INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,pending_generation,target) VALUES($1,$2,$3,$4,$5,\'staging\',\'freezing\',$6,$7,$8)', [JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment]), scope.tenantId, scope.clientId, scope.businessId, scope.siteId, s.intent.adoptionId, s.intent.generation, target])
    try {
      const result = await capture(changeCheckpoint(writer))
      expect(result.error).toMatchObject({ code: '40001' })
      expect(await head()).toBe(s.intent.expectedCheckpoint.id)
    } finally {
      await writer.query('ROLLBACK')
    }
  })

  it('checkpoint commits first: begin waits then rejects its stale anchor without creating an adoption', async () => {
    const s = await fixture()
    const writer = await connect(), adopter = await connect()
    await writer.query('BEGIN')
    await changeCheckpoint(writer)
    const adoption = capture(beginCmsAdoption(s.intent, principal(), { runTransaction: transactionFor(adopter) }))
    try {
      await blocked(adopter, writer)
      await writer.query('COMMIT')
      expect((await adoption).error).toMatchObject({ message: 'CMS adoption checkpoint is stale' })
      expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_scopes')).rows[0].count).toBe(0)
      expect(await head()).toBeNull()
    } finally {
      await writer.query('ROLLBACK')
      await adoption
    }
  })

  it('failed activation retains the fence; successful whole-baseline activation releases it', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    await ingest(s)
    await observer.query('CREATE FUNCTION reject_adopt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action=\'cms.adopt\' THEN RAISE EXCEPTION \'injected activation failure\'; END IF; RETURN NEW; END $$;CREATE TRIGGER reject_adopt BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION reject_adopt()')
    await expect(activate(s)).rejects.toThrow('injected activation failure')
    await expect(changeCheckpoint()).rejects.toMatchObject(fenceError)
    await observer.query('DROP TRIGGER reject_adopt ON page_studio_audit_events')
    await activate(s)
    await expect(changeCheckpoint()).resolves.toMatchObject({ rowCount: 1 })
  })

  it('explicit recovery under a fresh authorized login keeps the pending checkpoint fence', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    const hash = randomUUID().replaceAll('-', '').repeat(2)
    const login = (await observer.query('INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES(\'agency\',$1,$2,date_trunc(\'milliseconds\',clock_timestamp()),date_trunc(\'milliseconds\',clock_timestamp())+INTERVAL \'1 day\') RETURNING *', [hash, request.login.userId])).rows[0]
    request = { ...request, login: { ...request.login, tokenHash: hash, issuedAt: login.issued_at, expiresAt: login.expires_at } }
    await recoverCmsAdoption({ intent: s.intent, expectedAdoptionDigest: await collectionDigest(s.intent), recoveryId: 'recovery_a', expectedRecoveryId: null, actor: { ...s.intent.actor, loginSessionHash: hash } }, principal(), await dependencies())
    await expect(changeCheckpoint()).rejects.toMatchObject(fenceError)
    expect(await head()).toBe(s.intent.expectedCheckpoint.id)
  })
})
