/* eslint-disable @typescript-eslint/no-explicit-any -- Mutable untrusted transport fixtures deliberately supply malformed wire values. */
import { createCmsConsumerService } from '~~/server/utils/pageStudio/cmsConsumers'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectionDigest, collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import {
  CmsObjectPinSchema,
  CmsPreparationSchema,
  cmsItemIdentity
} from '~~/shared/pageStudio/cmsManaged'
import {
  readPageStudioBusinessContent,
  writePageStudioBusinessContent
} from '~~/server/utils/pageStudio/businessContent'
import { executePageStudioCollection } from '~~/server/utils/pageStudio/collections'
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
describe.runIf(Boolean(databaseUrl))('managed CMS consumers on disposable PostgreSQL', () => {
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
    await observer.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_VIEW\')', [
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
  const key = () =>
    JSON.stringify([
      scope.tenantId,
      scope.clientId,
      scope.businessId,
      scope.siteId,
      scope.environment
    ])
  async function seed() {
    const generation = randomUUID(),
      applicationId = randomUUID(),
      schemaId = randomUUID()
    const actor = {
      kind: 'agency-user',
      userId: request.login.userId,
      loginSessionHash: request.login.tokenHash
    }
    const freezeBody = {
      state: 'frozen',
      createdAt: new Date().toISOString(),
      request: { formatVersion: 1, scope, actor, adoptionId: 'adoption_a', target }
    }
    const freeze = { ...freezeBody, digest: await collectionDigest(freezeBody) }
    const definition = {
      formatVersion: 1,
      id: 'fleet',
      label: 'Fleet',
      version: 1,
      displayFieldId: 'name',
      scope,
      fields: [{ id: 'name', label: 'Name', type: 'text', required: true, visibility: 'public' }]
    }
    const pin = {
      kind: 'schema',
      collectionId: 'fleet',
      recordId: '',
      version: 1,
      origin: 'legacy',
      operationId: 'adoption_a',
      freezeDigest: freeze.digest,
      sha256: await collectionDigest(definition),
      bytes: new TextEncoder().encode(collectionCanonical(definition)).byteLength
    }
    const checkpoint = { id: 'checkpoint_a', digest: 'e'.repeat(64) }
    const manifest = {
      formatVersion: 1,
      scope,
      generation,
      applicationId,
      checkpoint,
      schemas: [{ collectionId: 'fleet', objectId: schemaId }],
      components: [],
      actions: [],
      previousApplicationId: null
    }
    const digest = await collectionDigest(manifest)
    await observer.query('BEGIN')
    await observer.query(
      `INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest) VALUES($1,$2,$3,$4,$5,$6,'importing','adoption_a',$7,$8,$9)`,
      [
        key(),
        scope.tenantId,
        scope.clientId,
        scope.businessId,
        scope.siteId,
        scope.environment,
        generation,
        target,
        freeze.digest
      ]
    )
    await observer.query(
      `INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,actor_id,created_at,adoption_id) VALUES($1,$2,$3,'schema','fleet','',1,$4,$5,clock_timestamp(),'adoption_a')`,
      [key(), generation, schemaId, pin, actor.userId]
    )
    await observer.query(
      `INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id) VALUES($1,$2,$3,$4,$5,'adoption_a')`,
      [key(), generation, applicationId, digest, manifest]
    )
    await observer.query(
      `INSERT INTO page_studio_cms_application_schemas(scope_key,generation,application_id,collection_id,object_id) VALUES($1,$2,$3,'fleet',$4)`,
      [key(), generation, applicationId, schemaId]
    )
    await observer.query(
      `UPDATE page_studio_cms_scopes SET state='managed',current_application_id=$2 WHERE scope_key=$1`,
      [key(), applicationId]
    )
    await observer.query(
      `INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at) VALUES($1,$2,$3,$4,$5,'fixture','fixture',clock_timestamp())`,
      [checkpoint.id, scope.tenantId, scope.clientId, scope.siteId, checkpoint.digest]
    )
    await observer.query(`UPDATE page_studio_sites SET current_checkpoint_id=$2 WHERE id=$1`, [
      scope.siteId,
      checkpoint.id
    ])
    await observer.query('COMMIT')
    return {
      generation,
      applicationId,
      schemaId,
      actor,
      freeze,
      definition,
      pin,
      checkpoint,
      digest
    }
  }

  async function service(s: Awaited<ReturnType<typeof seed>>) {
    const stored = new Map<string, any>()
    const operations = new Map<string, any>()
    const metadata = (
      await observer.query('SELECT created_at FROM page_studio_cms_objects WHERE id=$1', [
        s.schemaId
      ])
    ).rows[0]
    stored.set(collectionCanonical(s.pin), {
      pin: s.pin,
      body: s.definition,
      schema: null,
      actorId: s.actor.userId,
      createdAt: metadata.created_at.toISOString(),
      head: true
    })
    const transport = {
      readManagedCmsTarget: vi.fn(async () => target),
      readManagedCmsFreeze: vi.fn(async () => s.freeze),
      readManagedCmsObjects: vi.fn(async ({ pins }: any) =>
        pins.map((pin: any) => structuredClone(stored.get(collectionCanonical(pin))))
      ),
      readManagedCmsOperation: vi.fn(async ({ operationId, requestDigest }: any) => {
        const op = operations.get(operationId)
        if (!op || op.receipt.requestDigest !== requestDigest) throw new Error('Operation mismatch')
        return structuredClone(op)
      }),
      prepareManagedCmsOperation: vi.fn(async (raw: any) => {
        const input = CmsPreparationSchema.parse(raw)
        const old = operations.get(input.operationId)
        if (old) {
          if (old.receipt.requestDigest !== (await collectionDigest(input)))
            throw new Error('Operation conflict')
          return old.receipt
        }
        const createdAt = new Date().toISOString()
        const pins = await Promise.all(
          input.items.map(async item =>
            CmsObjectPinSchema.parse({
              ...cmsItemIdentity(item),
              origin: 'prepared',
              operationId: input.operationId,
              freezeDigest: input.freezeDigest,
              sha256: await collectionDigest(item.body),
              bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength
            })
          )
        )
        const body = {
          state: 'prepared',
          scope,
          operationId: input.operationId,
          freezeDigest: input.freezeDigest,
          requestDigest: await collectionDigest(input),
          items: pins,
          createdAt
        }
        const receipt = { ...body, digest: await collectionDigest(body) }
        input.items.forEach((item, i) =>
          stored.set(collectionCanonical(pins[i]), {
            pin: pins[i],
            body: item.body,
            schema: item.kind === 'record' ? item.schema : null,
            actorId: input.actor.userId,
            createdAt,
            head: false
          })
        )
        operations.set(input.operationId, { request: input, receipt })
        return receipt
      })
    }
    request.env.PAGE_STUDIO_CONTENT_ROUTER = transport
    const adapter = createCmsConsumerService(request, scope, {
      db: observer as unknown as PageStudioControlQueryClient,
      runTransaction: async work => transactionFor(await connect())(work)
    })
    return {
      adapter,
      transport,
      stored,
      operations,
      dependencies: {
        query: async (sql: string, params: unknown[]) =>
          (await observer.query(sql, params)).rows[0] ?? null,
        cms: {
          db: observer as unknown as PageStudioControlQueryClient,
          runTransaction: async work => transactionFor(await connect())(work)
        }
      }
    }
  }
  it('reads accepted schema bytes and empty current content without exposing private objects', async () => {
    const s = await seed(),
      { adapter, transport } = await service(s)
    expect((await adapter.readCollectionDefinition({ scope, id: 'fleet' })).definition).toEqual(
      s.definition
    )
    expect((await adapter.listCollectionDefinitions({ scope, limit: 50 })).items).toHaveLength(1)
    expect(await adapter.readContent(scope)).toBeNull()
    expect(
      (
        await adapter.listCollectionRecords({
          scope,
          collectionId: 'fleet',
          limit: 50,
          includeArchived: false
        })
      ).items
    ).toEqual([])
    expect(transport.prepareManagedCmsOperation).not.toHaveBeenCalled()
  })
  it('creates updates archives and replays original revisions without rewinding current data', async () => {
    const s = await seed(),
      { adapter } = await service(s)
    const input = {
      scope,
      actorId: request.actor.actorId,
      collectionId: 'fleet',
      id: 'first',
      schemaVersion: 1,
      archived: false,
      values: { name: 'first' },
      expectedRevision: 0
    }
    expect((await adapter.writeCollectionRecord(input)).record.revision).toBe(1)
    expect(
      (
        await adapter.writeCollectionRecord({
          ...input,
          expectedRevision: 1,
          archived: true,
          values: { name: 'next' }
        })
      ).record.revision
    ).toBe(2)
    expect((await adapter.writeCollectionRecord(input)).record.revision).toBe(1)
    expect(
      (await adapter.readCollectionRecord({ scope, collectionId: 'fleet', id: 'first' })).record
        .revision
    ).toBe(2)
    expect(
      (
        await adapter.readCollectionRecord({
          scope,
          collectionId: 'fleet',
          id: 'first',
          revision: 1
        })
      ).record.values
    ).toEqual({ name: 'first' })
    expect(
      (
        await adapter.listCollectionRecords({
          scope,
          collectionId: 'fleet',
          limit: 50,
          includeArchived: false
        })
      ).items
    ).toEqual([])
    expect(
      (
        await adapter.listCollectionRecords({
          scope,
          collectionId: 'fleet',
          limit: 50,
          includeArchived: true
        })
      ).items
    ).toHaveLength(1)
  })
  it('rejects tampered bytes, a changed target and managed schema edits', async () => {
    const s = await seed(),
      { adapter, transport, stored } = await service(s)
    stored.get(collectionCanonical(s.pin)).body.label = 'tampered'
    await expect(adapter.readCollectionDefinition({ scope, id: 'fleet' })).rejects.toThrow()
    transport.readManagedCmsTarget.mockResolvedValue({ ...target, routeId: 'different' })
    await expect(adapter.readContent(scope)).rejects.toThrow()
    await expect(adapter.writeCollectionDefinition({})).rejects.toThrow()
  })
  it('routes ordinary authenticated content edits through native acceptance and retains replay after another edit', async () => {
    const s = await seed(),
      { dependencies, transport } = await service(s)
    const first = { collections: [], expectedRevision: 0 }
    expect(
      (await writePageStudioBusinessContent({ ...request, body: first }, dependencies)).revision
    ).toBe(1)
    expect(
      (
        await writePageStudioBusinessContent(
          { ...request, body: { ...first, expectedRevision: 1 } },
          dependencies
        )
      ).revision
    ).toBe(2)
    expect(
      (await writePageStudioBusinessContent({ ...request, body: first }, dependencies)).revision
    ).toBe(1)
    expect((await readPageStudioBusinessContent(request, dependencies)).revision).toBe(2)
    expect(transport.prepareManagedCmsOperation).toHaveBeenCalledTimes(2)
  })
  it('keeps prepared orphan records and schemas outside normal current and historical reads', async () => {
    const s = await seed(),
      { adapter, transport } = await service(s)
    await transport.prepareManagedCmsOperation({
      formatVersion: 1,
      scope,
      actor: s.actor,
      freezeDigest: s.freeze.digest,
      operationId: 'orphan',
      action: null,
      candidateDigest: null,
      items: [
        {
          kind: 'record',
          expectedBase: null,
          version: 1,
          schema: s.pin,
          body: {
            scope,
            id: 'orphan',
            collectionId: 'fleet',
            revision: 1,
            schemaVersion: 1,
            archived: false,
            values: { name: 'orphan' }
          }
        }
      ]
    })
    expect(
      (await adapter.listCollectionRecords({ scope, collectionId: 'fleet', limit: 50 })).items
    ).toEqual([])
    await expect(
      adapter.readCollectionRecord({ scope, collectionId: 'fleet', id: 'orphan', revision: 1 })
    ).resolves.toBeNull()
  })
  it('denies transition reads and writes without falling back to legacy transport', async () => {
    const s = await seed(),
      { dependencies, transport } = await service(s)
    await observer.query('UPDATE page_studio_cms_scopes SET state=\'importing\' WHERE scope_key=$1', [
      key()
    ])
    await expect(readPageStudioBusinessContent(request, dependencies)).rejects.toMatchObject({
      code: 'CMS_ADOPTION_IN_PROGRESS'
    })
    await expect(
      writePageStudioBusinessContent(
        { ...request, body: { collections: [], expectedRevision: 0 } },
        dependencies
      )
    ).rejects.toMatchObject({ code: 'CMS_ADOPTION_IN_PROGRESS' })
    await expect(
      executePageStudioCollection(request, 'listDefinitions', {}, dependencies)
    ).rejects.toMatchObject({ code: 'CMS_ADOPTION_IN_PROGRESS' })
    expect(transport.readManagedCmsTarget).not.toHaveBeenCalled()
  })
  it('withholds a read revoked during private byte loading', async () => {
    const s = await seed(),
      { dependencies, transport } = await service(s)
    const original = transport.readManagedCmsObjects.getMockImplementation()!
    transport.readManagedCmsObjects.mockImplementationOnce(async (input: any) => {
      const result = await original(input)
      await observer.query(
        'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',
        [request.login.tokenHash]
      )
      return result
    })
    await expect(
      executePageStudioCollection(
        request,
        'readDefinition',
        { collectionId: 'fleet' },
        dependencies
      )
    ).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects a foreign returned pin and a current snapshot changed while loading bytes', async () => {
    const s = await seed(),
      { adapter, transport } = await service(s)
    const original = transport.readManagedCmsObjects.getMockImplementation()!
    transport.readManagedCmsObjects.mockImplementationOnce(async (input: any) => {
      const result = await original(input)
      result[0].pin.operationId = 'foreign'
      return result
    })
    await expect(adapter.readCollectionDefinition({ scope, id: 'fleet' })).rejects.toThrow()
    transport.readManagedCmsObjects.mockImplementationOnce(async (input: any) => {
      const result = await original(input)
      await observer.query(
        'UPDATE page_studio_cms_scopes SET state=\'importing\' WHERE scope_key=$1',
        [key()]
      )
      return result
    })
    await expect(adapter.readCollectionDefinition({ scope, id: 'fleet' })).rejects.toThrow()
  })
  it('paginates accepted record heads using public logical IDs and rejects structured foreign cursors', async () => {
    const s = await seed(),
      { adapter } = await service(s)
    for (const id of ['alpha', 'beta', 'gamma'])
      await adapter.writeCollectionRecord({
        scope,
        actorId: request.actor.actorId,
        collectionId: 'fleet',
        id,
        schemaVersion: 1,
        archived: false,
        values: { name: id },
        expectedRevision: 0
      })
    const first = await adapter.listCollectionRecords({ scope, collectionId: 'fleet', limit: 2 })
    expect(first.nextCursor).toBe('beta')
    expect(
      (
        await adapter.listCollectionRecords({
          scope,
          collectionId: 'fleet',
          limit: 2,
          after: first.nextCursor
        })
      ).items.map((item: any) => item.record.id)
    ).toEqual(['gamma'])
    await expect(
      adapter.listCollectionRecords({
        scope,
        collectionId: 'fleet',
        limit: 2,
        after: { scopeKey: 'foreign' }
      })
    ).rejects.toThrow()
  })
  it('admits one conflicting create and denies stale checkpoint coherence', async () => {
    const s = await seed(),
      { adapter } = await service(s)
    const input = {
      scope,
      actorId: request.actor.actorId,
      collectionId: 'fleet',
      id: 'race',
      schemaVersion: 1,
      archived: false,
      values: { name: 'first' },
      expectedRevision: 0
    }
    const results = await Promise.allSettled([
      adapter.writeCollectionRecord(input),
      adapter.writeCollectionRecord({ ...input, values: { name: 'second' } })
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL WHERE id=$1', [
      scope.siteId
    ])
    await expect(
      adapter.writeContent({
        actorId: request.actor.actorId,
        content: { schemaVersion: 1, scope, collections: [] },
        expectedRevision: 0
      })
    ).rejects.toThrow()
  })
  it('does not retry ambiguous commit and explicitly replays its original persisted request', async () => {
    const s = await seed(),
      { transport, adapter } = await service(s)
    const actual = transactionFor(await connect())
    const runTransaction = vi.fn(async (work: any) => {
      await actual(work)
      throw new Error('lost native response')
    })
    const ambiguous = createCmsConsumerService(request, scope, {
      db: observer as unknown as PageStudioControlQueryClient,
      runTransaction
    })
    const input = {
      scope,
      actorId: request.actor.actorId,
      collectionId: 'fleet',
      id: 'lost',
      schemaVersion: 1,
      archived: false,
      values: { name: 'first' },
      expectedRevision: 0
    }
    await expect(ambiguous.writeCollectionRecord(input)).rejects.toThrow('lost native response')
    expect(runTransaction).toHaveBeenCalledTimes(1)
    expect((await adapter.writeCollectionRecord(input)).record.revision).toBe(1)
    expect(transport.prepareManagedCmsOperation).toHaveBeenCalledTimes(1)
  })
  it('uses an actual portal editor login for ordinary record writes and denies a portal viewer', async () => {
    const s = await seed()
    const id = randomUUID(),
      hash = 'f'.repeat(64)
    await observer.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'member\')', [
      id,
      scope.clientId
    ])
    await observer.query(
      'INSERT INTO client_sessions VALUES($1,$2,clock_timestamp()+INTERVAL \'1day\')',
      [hash, id]
    )
    const login = (
      await observer.query(
        'INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES(\'client\',$1,$2,date_trunc(\'milliseconds\',clock_timestamp())-INTERVAL \'1hour\',date_trunc(\'milliseconds\',clock_timestamp())+INTERVAL \'1day\') RETURNING *',
        [hash, id]
      )
    ).rows[0]
    await observer.query(
      'INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role) VALUES($1,$2,$3,$4,\'editor\')',
      [scope.tenantId, scope.clientId, scope.siteId, id]
    )
    request = {
      ...request,
      actor: { role: 'client', actorId: id, clientId: scope.clientId },
      login: {
        role: 'client',
        userId: id,
        tokenHash: hash,
        issuedAt: login.issued_at,
        expiresAt: login.expires_at
      }
    }
    const { dependencies } = await service(s)
    const input = {
      collectionId: 'fleet',
      recordId: 'portal',
      body: { schemaVersion: 1, expectedRevision: 0, archived: false, values: { name: 'portal' } }
    }
    expect(
      (await executePageStudioCollection(request, 'writeRecord', input, dependencies)).record
        .revision
    ).toBe(1)
    await observer.query('UPDATE page_studio_site_memberships SET role=\'viewer\' WHERE user_id=$1', [
      id
    ])
    await expect(
      executePageStudioCollection(
        request,
        'writeRecord',
        { ...input, body: { ...input.body, expectedRevision: 1 } },
        dependencies
      )
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(
      (
        await executePageStudioCollection(
          request,
          'readRecord',
          { collectionId: 'fleet', recordId: 'portal' },
          dependencies
        )
      ).record.revision
    ).toBe(1)
  })
  it('does not publish preparation when native login is revoked before final commit', async () => {
    const s = await seed(),
      { dependencies, transport } = await service(s)
    const original = transport.prepareManagedCmsOperation.getMockImplementation()!
    transport.prepareManagedCmsOperation.mockImplementationOnce(async (input: unknown) => {
      const receipt = await original(input)
      await observer.query(
        'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',
        [request.login.tokenHash]
      )
      return receipt
    })
    await expect(
      writePageStudioBusinessContent(
        { ...request, body: { collections: [], expectedRevision: 0 } },
        dependencies
      )
    ).rejects.toThrow()
    expect(
      (await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_commits')).rows[0]
        .count
    ).toBe(0)
    expect(transport.prepareManagedCmsOperation).toHaveBeenCalledTimes(1)
  })
  it('preserves null for missing current and historical objects but rejects missing accepted bytes', async () => {
    const s = await seed(),
      { adapter, stored } = await service(s)
    expect(await adapter.readCollectionDefinition({ scope, id: 'missing' })).toBeNull()
    expect(await adapter.readCollectionDefinition({ scope, id: 'fleet', version: 2 })).toBeNull()
    expect(
      await adapter.readCollectionRecord({ scope, collectionId: 'fleet', id: 'missing' })
    ).toBeNull()
    stored.clear()
    await expect(adapter.readCollectionDefinition({ scope, id: 'fleet' })).rejects.toThrow()
  })
})
