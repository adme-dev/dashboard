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
import {
  readAcceptedCmsObject,
  listAcceptedCmsHistory
} from '~~/server/utils/pageStudio/cmsVisibility'
import { collectionDigest, collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { CmsObjectPinSchema } from '~~/shared/pageStudio/cmsManaged'
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
describe.runIf(Boolean(databaseUrl))('durable CMS adoption on disposable PostgreSQL', () => {
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
  async function fixture(empty = false) {
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
    const definition = {
      formatVersion: 1,
      id: 'fleet',
      version: 1,
      label: 'Fleet',
      scope,
      displayFieldId: 'name',
      fields: [{ id: 'name', type: 'text', required: true, visibility: 'public', label: 'Name' }]
    }
    const pin = async (
      kind: string,
      body: unknown,
      version: number,
      collectionId = '',
      recordId = ''
    ) =>
      CmsObjectPinSchema.parse({
        kind,
        collectionId,
        recordId,
        version,
        origin: 'legacy',
        operationId: intent.adoptionId,
        freezeDigest: freeze.digest,
        sha256: await collectionDigest(body),
        bytes: new TextEncoder().encode(collectionCanonical(body)).byteLength
      })
    const schemaPin = await pin('schema', definition, 1, 'fleet')
    const metadata = {
      actorId: 'original_actor',
      createdAt: '2026-09-01T00:00:00.000Z',
      head: true
    }
    const schemaObject = { ...metadata, pin: schemaPin, body: definition, schema: null }
    const content = { schemaVersion: 1, scope, collections: [] }
    const record = {
      scope,
      collectionId: 'fleet',
      id: 'first',
      revision: 1,
      schemaVersion: 1,
      archived: false,
      values: { name: 'Original' }
    }
    const archived = { ...record, revision: 2, archived: true }
    const items = empty
      ? []
      : [
          { ...metadata, pin: await pin('content', content, 1), body: content, schema: null },
          {
            ...metadata,
            head: false,
            pin: await pin('record', record, 1, 'fleet', 'first'),
            body: record,
            schema: schemaPin
          },
          {
            ...metadata,
            pin: await pin('record', archived, 2, 'fleet', 'first'),
            body: archived,
            schema: schemaPin
          },
          schemaObject
        ]
    const counts = empty
      ? { content: 0, record: 0, schema: 0 }
      : { content: 1, record: 2, schema: 1 }
    const inventoryIdentity = await collectionDigest({
      counts,
      formatVersion: 1,
      freezeDigest: freeze.digest
    })
    async function page(cursor: unknown = null, limit = 1) {
      const cursorPin = cursor as {
        kind: string
        collectionId: string
        recordId: string
        version: number
      } | null
      const start = cursorPin
        ? items.findIndex(
          item =>
            item.pin.kind === cursorPin.kind
            && item.pin.collectionId === cursorPin.collectionId
            && item.pin.recordId === cursorPin.recordId
            && item.pin.version === cursorPin.version
        ) + 1
        : 0
      const selected = items.slice(start, start + limit),
        last = selected.at(-1)?.pin
      const nextCursor
        = start + selected.length < items.length && last
          ? {
              formatVersion: 1,
              freezeDigest: freeze.digest,
              kind: last.kind,
              collectionId: last.collectionId,
              recordId: last.recordId,
              version: last.version
            }
          : null
      const pageDigest = await collectionDigest({
        cursor,
        formatVersion: 1,
        inventoryIdentity,
        items: selected.map(({ body: _body, ...value }) => value),
        limit,
        nextCursor
      })
      return { counts, inventoryIdentity, items: selected, nextCursor, pageDigest }
    }
    return { intent, freeze, items, schemaObject, component, componentPin, manifest, page }
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
        readSchemas: async () => [s.schemaObject]
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
  it('retains inactive intent and freeze, rejects rewrites and recovers exact retries', async () => {
    const s = await fixture()
    const intent = await begin(s)
    expect(await begin(s)).toEqual(intent)
    const freeze = await frozen(s)
    expect(await frozen(s)).toEqual(freeze)
    await expect(
      beginCmsAdoption(
        { ...s.intent, target: { ...target, runtimeDigest: '0'.repeat(64) } },
        principal(),
        await dependencies()
      )
    ).rejects.toThrow()
    await expect(readAcceptedCmsObject(observer, { scope, kind: 'content' })).rejects.toThrow()
  })
  it('imports record-before-schema dependencies once and activates all history with preserved components', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    let cursor: unknown = null
    do {
      const page = await s.page(cursor)
      await ingest(s, cursor)
      await expect(readAcceptedCmsObject(observer, { scope, kind: 'content' })).rejects.toThrow()
      cursor = page.nextCursor
    } while (cursor)
    expect(
      (await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_objects')).rows[0]
        .count
    ).toBe(4)
    const result = await activate(s)
    expect(result.state).toBe('managed')
    expect(await activate(s)).toEqual(result)
    expect(
      (
        await readAcceptedCmsObject(observer, {
          scope,
          kind: 'record',
          collectionId: 'fleet',
          recordId: 'first'
        })
      ).archived
    ).toBe(true)
    expect(
      (
        await listAcceptedCmsHistory(observer, {
          scope,
          kind: 'record',
          collectionId: 'fleet',
          recordId: 'first'
        })
      ).items
    ).toHaveLength(2)
    expect(
      (await observer.query('SELECT manifest FROM page_studio_application_versions')).rows[0]
        .manifest.components
    ).toEqual([s.componentPin])
  })
  it('serializes concurrent pages and exact last-page replay without double progress', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    const results = await Promise.all([ingest(s, null, 20), ingest(s, null, 20)])
    expect(results[0]).toEqual(results[1])
    expect(await ingest(s, null, 20)).toEqual(results[0])
    await activate(s)
    expect(
      (await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_objects')).rows[0]
        .count
    ).toBe(4)
  })
  it('blocks incomplete activation and rejects revoked authority after remote freeze', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    await ingest(s)
    await expect(activate(s)).rejects.toThrow()
    await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    await expect(frozen(s)).rejects.toThrow()
    await expect(ingest(s, (await s.page()).nextCursor)).rejects.toThrow()
    expect((await observer.query('SELECT state FROM page_studio_cms_scopes')).rows[0].state).toBe(
      'importing'
    )
  })
  it('imports an empty inventory but still fences final activation on the accepted checkpoint', async () => {
    const s = await fixture(true)
    await begin(s)
    await frozen(s)
    await ingest(s)
    await expect(observer.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')).rejects.toMatchObject({
      code: 'P0001', message: 'CMS_ADOPTION_IN_PROGRESS'
    })
    expect((await observer.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe(s.intent.expectedCheckpoint.id)
    expect((await activate(s)).state).toBe('managed')
  })
  async function freshLogin() {
    const hash = randomUUID().replaceAll('-', '').repeat(2)
    const login = (
      await observer.query(
        `INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES('agency',$1,$2,date_trunc('milliseconds',clock_timestamp())-INTERVAL '1second',date_trunc('milliseconds',clock_timestamp())+INTERVAL '1day') RETURNING *`,
        [hash, request.login.userId]
      )
    ).rows[0]
    request = {
      ...request,
      login: {
        ...request.login,
        tokenHash: hash,
        issuedAt: login.issued_at,
        expiresAt: login.expires_at
      }
    }
    return { kind: 'agency-user', userId: request.login.userId, loginSessionHash: hash }
  }
  it('recovers explicitly under fresh login without rewriting or impersonating the original freeze actor', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    await ingest(s)
    await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    const actor = await freshLogin()
    const next = (await s.page()).nextCursor
    await expect(ingest(s, next)).rejects.toThrow('explicit recovery')
    const input = {
      intent: s.intent,
      expectedAdoptionDigest: await collectionDigest(s.intent),
      recoveryId: 'recover_a',
      expectedRecoveryId: null,
      actor
    }
    const recovered = await recoverCmsAdoption(input, principal(), await dependencies())
    expect(await recoverCmsAdoption(input, principal(), await dependencies())).toEqual(recovered)
    let cursor: unknown = next
    while (cursor) {
      const page = await s.page(cursor)
      await ingest(s, cursor)
      cursor = page.nextCursor
    }
    const result = await activate(s)
    expect(result.activatedBy.actor).toEqual(actor)
    const row = (
      await observer.query('SELECT adoption_request,freeze_digest FROM page_studio_cms_scopes')
    ).rows[0]
    expect(row.adoption_request).toEqual(s.intent)
    expect(row.freeze_digest).toBe(s.freeze.digest)
    expect(
      (
        await observer.query(
          'SELECT count(*)::int AS count FROM page_studio_audit_events WHERE action=\'cms.adoption.recover\''
        )
      ).rows[0].count
    ).toBe(1)
    await expect(
      recoverCmsAdoption(
        { ...input, expectedAdoptionDigest: '0'.repeat(64) },
        principal(),
        await dependencies()
      )
    ).rejects.toThrow()
    await expect(observer.query('DELETE FROM page_studio_cms_adoption_recoveries')).rejects.toThrow(
      'immutable'
    )
  })
  it('denies recovery without current schema permission and denies changed scope or predecessor', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    const actor = await freshLogin()
    const input = {
      intent: s.intent,
      expectedAdoptionDigest: await collectionDigest(s.intent),
      recoveryId: 'recover_a',
      expectedRecoveryId: null,
      actor
    }
    await expect(
      recoverCmsAdoption(
        { ...input, expectedRecoveryId: 'missing' },
        principal(),
        await dependencies()
      )
    ).rejects.toThrow()
    const foreign = { ...s.intent, scope: { ...scope, environment: 'preview' } }
    await expect(
      recoverCmsAdoption(
        { ...input, intent: foreign, expectedAdoptionDigest: await collectionDigest(foreign) },
        principal(),
        await dependencies()
      )
    ).rejects.toThrow()
    await observer.query(
      'DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_EDIT\''
    )
    await expect(recoverCmsAdoption(input, principal(), await dependencies())).rejects.toThrow()
    expect(
      (
        await observer.query(
          'SELECT count(*)::int AS count FROM page_studio_cms_adoption_recoveries'
        )
      ).rows[0].count
    ).toBe(0)
  })

  async function redigest(
    s: Awaited<ReturnType<typeof fixture>>,
    page: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['page']>>,
    cursor: unknown,
    limit: number
  ) {
    page.inventoryIdentity = await collectionDigest({
      counts: page.counts,
      formatVersion: 1,
      freezeDigest: s.freeze.digest
    })
    page.pageDigest = await collectionDigest({
      cursor,
      formatVersion: 1,
      inventoryIdentity: page.inventoryIdentity,
      items: page.items.map(({ body: _body, ...metadata }) => metadata),
      limit,
      nextCursor: page.nextCursor
    })
    return page
  }
  it('rejects tampered bodies and foreign schema dependency bytes before any import writes', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    const bad = structuredClone(await s.page(null, 20))
    bad.items[0].pin.sha256 = '0'.repeat(64)
    await expect(ingest(s, null, 20, bad)).rejects.toThrow()
    await expect(
      importFrozenCmsPage(
        { intent: s.intent, freezeDigest: s.freeze.digest, cursor: null, limit: 20 },
        principal(),
        {
          ...(await dependencies()),
          readPage: async () => await s.page(null, 20),
          readSchemas: async () => [
            {
              ...s.schemaObject,
              body: { ...s.schemaObject.body, scope: { ...scope, environment: 'preview' } }
            }
          ]
        }
      )
    ).rejects.toThrow()
    expect(
      (await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_objects')).rows[0]
        .count
    ).toBe(0)
  })
  it('rejects out-of-order cursors and a different page replay without advancing progress', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    const first = await s.page()
    await expect(ingest(s, first.nextCursor)).rejects.toThrow('cursor conflict')
    const accepted = await ingest(s)
    await expect(ingest(s, null, 2)).rejects.toThrow('cursor conflict')
    expect(
      (await observer.query('SELECT import_progress FROM page_studio_cms_scopes')).rows[0]
        .import_progress
    ).toEqual(accepted)
  })
  it('rejects incomplete advertised counts and never infers heads from numeric versions', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    const bad = await s.page(null, 20)
    bad.counts = { ...bad.counts, record: 3 }
    await expect(ingest(s, null, 20, await redigest(s, bad, null, 20))).rejects.toThrow(
      'incomplete'
    )
    expect(
      (await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_objects')).rows[0]
        .count
    ).toBe(0)
    const heads = await s.page(null, 20)
    for (const item of heads.items)
      if (item.pin.kind === 'record') item.head = item.pin.version === 1
    await ingest(s, null, 20, await redigest(s, heads, null, 20))
    await expect(activate(s)).rejects.toThrow('head proof')
  })
  it('rejects changed dependency metadata when its schema is later consumed from the cursor', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    let cursor: unknown = null
    for (let i = 0; i < 3; i++) {
      const page = await s.page(cursor)
      await ingest(s, cursor)
      cursor = page.nextCursor
    }
    const schema = await s.page(cursor)
    schema.items[0].actorId = 'changed_actor'
    await expect(ingest(s, cursor, 1, await redigest(s, schema, cursor, 1))).rejects.toThrow(
      'imported identity conflict'
    )
    expect(
      (await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_objects')).rows[0]
        .count
    ).toBe(4)
  })
  it('rolls back all final visibility when the final audit fails and recovers a lost response exactly', async () => {
    const s = await fixture()
    await begin(s)
    await frozen(s)
    await ingest(s, null, 20)
    await observer.query(
      `CREATE FUNCTION fail_adoption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='cms.adopt' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_adoption BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION fail_adoption();`
    )
    await expect(activate(s)).rejects.toThrow('audit unavailable')
    expect(
      (await observer.query('SELECT count(*)::int AS count FROM page_studio_application_versions'))
        .rows[0].count
    ).toBe(0)
    await expect(readAcceptedCmsObject(observer, { scope, kind: 'content' })).rejects.toThrow()
    await observer.query('DROP TRIGGER fail_adoption ON page_studio_audit_events')
    let attempts = 0
    const run = transactionFor(await connect())
    await expect(
      activateCmsAdoption(s.intent, principal(), {
        runTransaction: async (work) => {
          attempts += 1
          await run(work)
          throw new Error('lost acknowledgement')
        },
        readCheckpoint: async () => ({
          checkpointId: s.intent.expectedCheckpoint.id,
          digest: s.intent.expectedCheckpoint.digest,
          manifest: s.manifest
        }),
        readComponent: async () => s.component
      })
    ).rejects.toThrow('lost acknowledgement')
    expect(attempts).toBe(1)
    const receipt = (await observer.query('SELECT adoption_receipt FROM page_studio_cms_scopes'))
      .rows[0].adoption_receipt
    expect(await activate(s)).toEqual(receipt)
    expect(
      (
        await observer.query(
          'SELECT count(*)::int AS count FROM page_studio_audit_events WHERE action=\'cms.adopt\''
        )
      ).rows[0].count
    ).toBe(1)
  })
  it('activates an empty verified inventory and rejects unsupported or damaged checkpoint graphs', async () => {
    const s = await fixture(true)
    await begin(s)
    await frozen(s)
    await ingest(s)
    await expect(
      activateCmsAdoption(s.intent, principal(), {
        ...(await dependencies()),
        readCheckpoint: async () => ({
          checkpointId: s.intent.expectedCheckpoint.id,
          digest: s.intent.expectedCheckpoint.digest,
          manifest: s.manifest
        }),
        readComponent: async () => ({ ...s.component, actions: [{ id: 'unreviewed' }] })
      })
    ).rejects.toThrow()
    const result = await activate(s)
    expect(result.counts).toEqual({ content: 0, schema: 0, record: 0 })
    await expect(readAcceptedCmsObject(observer, { scope, kind: 'content' })).rejects.toThrow()
  })
  it('keeps recorded intent, frozen identity and terminal receipt immutable', async () => {
    const s = await fixture(true)
    await begin(s)
    await frozen(s)
    await expect(observer.query('DELETE FROM page_studio_cms_scopes')).rejects.toThrow('immutable')
    await expect(observer.query('UPDATE page_studio_cms_scopes SET target=\'{}\'')).rejects.toThrow(
      'immutable'
    )
    await expect(
      observer.query('UPDATE page_studio_cms_scopes SET freeze_digest=NULL')
    ).rejects.toThrow('immutable')
    await ingest(s)
    await activate(s)
    await expect(
      observer.query('UPDATE page_studio_cms_scopes SET adoption_receipt=NULL')
    ).rejects.toThrow('immutable')
  })
  it('never rewinds the active recovery fence when an older authorized recovery is replayed', async () => {
    const s = await fixture(true)
    await begin(s)
    await frozen(s)
    const firstActor = await freshLogin(),
      firstPrincipal = principal()
    const first = {
      intent: s.intent,
      expectedAdoptionDigest: await collectionDigest(s.intent),
      recoveryId: 'recover_a',
      expectedRecoveryId: null,
      actor: firstActor
    }
    const initial = await recoverCmsAdoption(first, firstPrincipal, await dependencies())
    const secondActor = await freshLogin()
    await recoverCmsAdoption(
      { ...first, recoveryId: 'recover_b', expectedRecoveryId: 'recover_a', actor: secondActor },
      principal(),
      await dependencies()
    )
    const replay = await recoverCmsAdoption(first, firstPrincipal, await dependencies())
    expect(replay.receipt).toEqual(initial.receipt)
    expect(replay.current).toBe(false)
    await expect(beginCmsAdoption(s.intent, firstPrincipal, await dependencies())).rejects.toThrow(
      'recovery authority'
    )
    expect(
      (await observer.query('SELECT adoption_recovery_id FROM page_studio_cms_scopes')).rows[0]
        .adoption_recovery_id
    ).toBe('recover_b')
    await ingest(s)
    expect((await activate(s)).activatedBy.actor).toEqual(secondActor)
    expect(
      (
        await observer.query(
          'SELECT count(*)::int AS count FROM page_studio_cms_adoption_recoveries'
        )
      ).rows[0].count
    ).toBe(2)
  })
})
