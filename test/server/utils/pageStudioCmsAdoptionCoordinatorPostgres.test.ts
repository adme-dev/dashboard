/* eslint-disable @typescript-eslint/no-explicit-any -- Deliberately mutable private transport fixtures test malformed bytes and authority transitions. */
import { coordinateCmsAdoption } from '~~/server/utils/pageStudio/cmsAdoptionCoordinator'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectionDigest, collectionCanonical } from '~~/shared/pageStudio/collectionApi'
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

  async function setup(inventoryCount = 0) {
    const manifest = {
      schemaVersion: 1,
      id: scope.siteId,
      name: 'Site',
      defaultLocale: 'en-AU',
      pages: [{}],
      theme: {},
      integrations: []
    }
    const digest = await collectionDigest(manifest),
      checkpointId = 'checkpoint_a'
    const objectKey = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json`
    await observer.query(
      'INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at) VALUES($1,$2,$3,$4,$5,$6,\'fixture\',clock_timestamp())',
      [checkpointId, scope.tenantId, scope.clientId, scope.siteId, digest, objectKey]
    )
    await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=$2 WHERE id=$1', [
      scope.siteId,
      checkpointId
    ])
    let freeze: any = null
    const transport = {
      readManagedCmsTarget: vi.fn(async () => target),
      freezeManagedCms: vi.fn(async (value: any) => {
        if (!freeze) {
          const body = { state: 'frozen', createdAt: new Date().toISOString(), request: value }
          freeze = { ...body, digest: await collectionDigest(body) }
        }
        return freeze
      }),
      readManagedCmsFreeze: vi.fn(async () => freeze),
      readFrozenCmsPage: vi.fn(async (value: any) => {
        const counts = { content: inventoryCount, record: 0, schema: 0 },
          inventoryIdentity = await collectionDigest({
            counts,
            formatVersion: 1,
            freezeDigest: freeze.digest
          })
        const start = value.cursor?.version ?? 0,
          body = { schemaVersion: 1, scope, collections: [] }
        const items = await Promise.all(
          Array.from(
            { length: Math.min(value.limit, inventoryCount - start) },
            async (_, index) => ({
              body,
              schema: null,
              head: start + index + 1 === inventoryCount,
              actorId: 'original_actor',
              createdAt: '2026-09-01T00:00:00.000Z',
              pin: {
                kind: 'content',
                collectionId: '',
                recordId: '',
                version: start + index + 1,
                origin: 'legacy',
                operationId: freeze.request.adoptionId,
                freezeDigest: freeze.digest,
                sha256: await collectionDigest(body),
                bytes: new TextEncoder().encode(collectionCanonical(body)).byteLength
              }
            })
          )
        )
        const nextCursor
          = start + items.length < inventoryCount
            ? {
                kind: 'content',
                collectionId: '',
                recordId: '',
                version: start + items.length,
                formatVersion: 1,
                freezeDigest: freeze.digest
              }
            : null
        return {
          counts,
          inventoryIdentity,
          items,
          nextCursor,
          pageDigest: await collectionDigest({
            cursor: value.cursor,
            formatVersion: 1,
            inventoryIdentity,
            items: items.map(({ body: _body, ...item }) => item),
            limit: value.limit,
            nextCursor
          })
        }
      }),
      readManagedCmsObjects: vi.fn(async () => [])
    }
    const bucket = {
      get: vi.fn(async (key: string) => {
        if (key !== objectKey) return null
        const raw = JSON.stringify({
          schemaVersion: 1,
          scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId },
          checkpointId,
          digest,
          manifest
        })
        return {
          size: new TextEncoder().encode(raw).byteLength,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(raw))
              controller.close()
            }
          })
        }
      })
    }
    request.env.PAGE_STUDIO_CONTENT_ROUTER = transport
    request.env.PAGE_STUDIO_CHECKPOINTS = bucket
    const run = (
      input: unknown,
      principal: unknown = { source: 'native-login', request },
      overrides: Record<string, unknown> = {}
    ) =>
      coordinateCmsAdoption(input, principal as never, {
        runTransaction: async work => transactionFor(await connect())(work),
        ...overrides
      })
    return { run, transport, bucket, manifest, digest, objectKey }
  }
  it('derives a durable original intent and advances one bounded phase without exposing private identity', async () => {
    const { run, transport } = await setup()
    expect((await run({ action: 'status' })).phase).toBe('idle')
    const start = await run({ action: 'start' })
    expect(start.phase).toBe('freezing')
    expect(transport.freezeManagedCms).not.toHaveBeenCalled()
    expect(await run({ action: 'start' })).toEqual(start)
    expect(JSON.stringify(start)).not.toContain(request.login.tokenHash)
    const next = await run({
      action: 'advance',
      adoptionId: start.adoptionId,
      expectedProgressDigest: start.progressDigest
    })
    expect(next.phase).toBe('importing')
    expect(transport.readFrozenCmsPage).not.toHaveBeenCalled()
    expect(
      await run({
        action: 'advance',
        adoptionId: start.adoptionId,
        expectedProgressDigest: start.progressDigest
      })
    ).toEqual(next)
    const ready = await run({
      action: 'advance',
      adoptionId: next.adoptionId,
      expectedProgressDigest: next.progressDigest
    })
    expect(ready.phase).toBe('ready')
    expect(transport.readFrozenCmsPage).toHaveBeenCalledTimes(1)
    const done = await run({
      action: 'advance',
      adoptionId: ready.adoptionId,
      expectedProgressDigest: ready.progressDigest
    })
    expect(done.phase).toBe('managed')
    expect(await run({ action: 'status' })).toEqual(done)
  })
  async function replaceLogin() {
    const old = request.login.tokenHash,
      hash = randomUUID().replaceAll('-', '').repeat(2)
    await observer.query(
      'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',
      [old]
    )
    const login = (
      await observer.query(
        'INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES(\'agency\',$1,$2,date_trunc(\'milliseconds\',clock_timestamp())-INTERVAL \'1hour\',date_trunc(\'milliseconds\',clock_timestamp())+INTERVAL \'1day\') RETURNING *',
        [hash, request.actor.actorId]
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
  }
  const advance = (run: any, status: any) =>
    run({
      action: 'advance',
      adoptionId: status.adoptionId,
      expectedProgressDigest: status.progressDigest
    })
  it('returns redacted progress under fresh login and requires explicit audited recovery', async () => {
    const { run, transport } = await setup()
    const started = await run({ action: 'start' })
    await replaceLogin()
    const current = await run({ action: 'status' })
    expect(current.recoveryRequired).toBe(true)
    expect(JSON.stringify(current)).not.toContain(request.login.tokenHash)
    await expect(advance(run, current)).rejects.toThrow('explicit content setup recovery')
    expect(transport.freezeManagedCms).not.toHaveBeenCalled()
    const recovery = {
      action: 'recover',
      adoptionId: started.adoptionId,
      recoveryId: 'recovery_a',
      expectedRecoveryId: null
    }
    const resumed = await run(recovery)
    expect(resumed.recoveryRequired).toBe(false)
    expect(await run(recovery)).toEqual(resumed)
    expect((await advance(run, resumed)).phase).toBe('importing')
    const row = (
      await observer.query(
        'SELECT adoption_request,adoption_recovery_id FROM page_studio_cms_scopes'
      )
    ).rows[0]
    expect(row.adoption_request.actor.loginSessionHash).not.toBe(request.login.tokenHash)
    expect(row.adoption_recovery_id).toBe('recovery_a')
  })
  it('authorizes Studio child without AI permission and requires recovery when a recovered principal changes source', async () => {
    const { run } = await setup()
    const now = Math.floor(Date.now() / 1000),
      claims = {
        tenantId: scope.tenantId,
        clientId: scope.clientId,
        siteId: scope.siteId,
        userId: request.actor.actorId,
        role: 'agency',
        nonce: randomUUID(),
        issuedAt: now - 10,
        expiresAt: now + 600,
        capabilities: ['workspace:checkpoint']
      }
    await observer.query(
      'INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)',
      [
        claims.nonce,
        scope.tenantId,
        scope.clientId,
        scope.siteId,
        claims.userId,
        claims.role,
        JSON.stringify(claims.capabilities),
        claims.issuedAt,
        claims.expiresAt,
        request.login.tokenHash
      ]
    )
    const principal = {
      source: 'studio-session',
      claims,
      env: request.env,
      capability: 'workspace:checkpoint'
    }
    const status = await run({ action: 'start' }, principal)
    const recovered = await run(
      {
        action: 'recover',
        adoptionId: status.adoptionId,
        recoveryId: 'child_recovery',
        expectedRecoveryId: null
      },
      principal
    )
    expect(recovered.recoveryRequired).toBe(false)
    expect((await run({ action: 'status' })).recoveryRequired).toBe(true)
    expect(
      (
        await run(
          {
            action: 'advance',
            adoptionId: recovered.adoptionId,
            expectedProgressDigest: recovered.progressDigest
          },
          principal
        )
      ).phase
    ).toBe('importing')
    await observer.query(
      'UPDATE page_studio_sessions SET revoked_at=clock_timestamp() WHERE nonce=$1',
      [claims.nonce]
    )
    await expect(run({ action: 'status' }, principal)).rejects.toThrow()
  })
  it('freshly denies revoked login before dispatching a private freeze', async () => {
    const { run, transport } = await setup(),
      started = await run({ action: 'start' })
    transport.readManagedCmsTarget.mockImplementationOnce(async () => {
      await observer.query(
        'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',
        [request.login.tokenHash]
      )
      return target
    })
    await expect(advance(run, started)).rejects.toThrow()
    expect(transport.freezeManagedCms).not.toHaveBeenCalled()
  })
  it('recovers an unknown freeze acknowledgement without creating another intent', async () => {
    const { run, transport } = await setup(),
      started = await run({ action: 'start' })
    const freeze = transport.freezeManagedCms.getMockImplementation()!
    transport.freezeManagedCms.mockImplementationOnce(async (input: any) => {
      await freeze(input)
      throw new Error('lost freeze acknowledgement')
    })
    await expect(advance(run, started)).rejects.toThrow('lost freeze acknowledgement')
    expect(await run({ action: 'status' })).toEqual(started)
    expect((await advance(run, started)).phase).toBe('importing')
    expect(
      (await observer.query('SELECT count(*)::int AS n FROM page_studio_cms_scopes')).rows[0].n
    ).toBe(1)
  })
  it('rejects changed target without automatic retarget and rejects damaged checkpoint bytes before activation', async () => {
    const { run, transport, bucket } = await setup(),
      started = await run({ action: 'start' })
    transport.readManagedCmsTarget.mockResolvedValueOnce({ ...target, routeId: 'other' })
    await expect(advance(run, started)).rejects.toThrow('target changed')
    expect(transport.freezeManagedCms).not.toHaveBeenCalled()
    const imported = await advance(run, started),
      ready = await advance(run, imported)
    bucket.get.mockImplementationOnce(async () => ({
      size: 2,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{}'))
          controller.close()
        }
      })
    }))
    await expect(advance(run, ready)).rejects.toThrow()
    expect((await run({ action: 'status' })).phase).toBe('ready')
    expect(
      (await observer.query('SELECT count(*)::int AS n FROM page_studio_application_versions'))
        .rows[0].n
    ).toBe(0)
  })
  it('serializes competing starts and bounds concurrent duplicate progress requests', async () => {
    const { run, transport } = await setup()
    const starts = await Promise.all([run({ action: 'start' }), run({ action: 'start' })])
    expect(starts[0].adoptionId).toBe(starts[1].adoptionId)
    const next = await Promise.all([advance(run, starts[0]), advance(run, starts[1])])
    expect(next.every(value => value.phase === 'importing')).toBe(true)
    expect(transport.readFrozenCmsPage).not.toHaveBeenCalled()
    const ready = await advance(run, next[0])
    const repeated = await advance(run, next[0])
    expect(repeated).toEqual(ready)
    expect(transport.readFrozenCmsPage).toHaveBeenCalledTimes(1)
  })

  it('imports at most20 items per explicit advance and preserves all21 historical revisions', async () => {
    const { run, transport } = await setup(21)
    const start = await run({ action: 'start' }),
      frozen = await advance(run, start)
    const page1 = await advance(run, frozen)
    expect(page1.phase).toBe('importing')
    expect(page1.progress?.consumed.content).toBe(20)
    expect(transport.readFrozenCmsPage).toHaveBeenCalledTimes(1)
    const page2 = await advance(run, page1)
    expect(page2.phase).toBe('ready')
    expect(page2.progress?.consumed.content).toBe(21)
    expect((await advance(run, page2)).phase).toBe('managed')
    expect(
      (await observer.query('SELECT count(*)::int AS n FROM page_studio_cms_objects')).rows[0].n
    ).toBe(21)
  })

  it('reports a committed activation after lost acknowledgement without dispatching another phase', async () => {
    const { run, transport } = await setup(),
      started = await run({ action: 'start' }),
      frozen = await advance(run, started),
      ready = await advance(run, frozen)
    const transaction = transactionFor(await connect())
    await expect(
      run(
        {
          action: 'advance',
          adoptionId: ready.adoptionId,
          expectedProgressDigest: ready.progressDigest
        },
        undefined,
        {
          runTransaction: async (work: any) => {
            const result: any = await transaction(work)
            if (result?.state === 'managed') throw new Error('lost activation acknowledgement')
            return result
          }
        }
      )
    ).rejects.toThrow('lost activation acknowledgement')
    const done = await run({ action: 'status' })
    expect(done.phase).toBe('managed')
    expect(await advance(run, ready)).toEqual(done)
    expect(transport.readFrozenCmsPage).toHaveBeenCalledTimes(1)
  })
  it('admits a real portal admin login and denies a portal viewer before storage', async () => {
    const { run, transport } = await setup(),
      id = randomUUID(),
      hash = 'f'.repeat(64)
    await observer.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'admin\')', [
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
    const started = await run({ action: 'start' })
    expect(started.phase).toBe('freezing')
    await observer.query('UPDATE page_studio_site_memberships SET role=\'viewer\' WHERE user_id=$1', [
      id
    ])
    await expect(advance(run, started)).rejects.toThrow()
    expect(transport.freezeManagedCms).not.toHaveBeenCalled()
  })
  it('does not project a corrupted terminal receipt as completed progress', async () => {
    const { run } = await setup()
    const start = await run({ action: 'start' })
    const frozen = await advance(run, start)
    const ready = await advance(run, frozen)
    await advance(run, ready)
    // Simulate out-of-band corruption only inside this disposable schema.
    await observer.query('ALTER TABLE page_studio_cms_scopes DISABLE TRIGGER USER')
    await observer.query(
      'UPDATE page_studio_cms_scopes SET adoption_receipt=jsonb_set(adoption_receipt,\'{digest}\',to_jsonb(repeat(\'0\',64)))'
    )
    await expect(run({ action: 'status' })).rejects.toThrow()
  })
})
