import { createCmsGraphStorage } from '~~/server/utils/pageStudio/cmsGraphStorage'
import type { CmsGraphSnapshot } from '~~/server/utils/pageStudio/cmsGraphCoordinator'
import { coordinateActionInvocation } from '~~/server/utils/pageStudio/actionCoordinator'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import {
  afterAll,
  beforeAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'
import type { PageStudioSessionClaims } from '~~/server/utils/pageStudio/sessions'
import {
  collectionDigest,
  collectionCanonical
} from '~~/shared/pageStudio/collectionApi'
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
describe.runIf(
  Boolean(databaseUrl && process.env.PAGE_STUDIO_ACTION_TEST_ROOT)
)(
  'connected native action orchestration with actual metered runtime R2 and D1',
  () => {
    let observer: pg.Client,
      connections: pg.Client[],
      schema: string,
      scope: PageStudioContentScope,
      request: ContentAuthorityRequest,
      claims: PageStudioSessionClaims
    let activeTransactions = 0
    async function connect() {
      const db = new pg.Client({ connectionString: databaseUrl })
      await db.connect()
      connections.push(db)
      await db.query(`SET search_path TO "${schema}", pg_catalog`)
      await db.query('SET statement_timeout=\'6s\'')
      return db
    }
    function transactionFor(db: pg.Client) {
      return async <T>(
        work: (db: PageStudioControlQueryClient) => Promise<T>
      ) => {
        await db.query('BEGIN')
        activeTransactions++
        try {
          const result = await work(
            db as unknown as PageStudioControlQueryClient
          )
          await db.query('COMMIT')
          return result
        } catch (error) {
          await db.query('ROLLBACK')
          throw error
        } finally {
          activeTransactions--
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
        '422_page_studio_cms_visibility.sql',
        '421_page_studio_ai_usage.sql',
        '423_page_studio_action_execution_usage.sql', '427_page_studio_public_action_invocations.sql',
        '424_page_studio_action_invocations.sql',
        '424_page_studio_action_invocations.sql'
      ]) {
        await observer.query(
          readFileSync(
            new URL(
              `../../../server/database/migrations/${file}`,
              import.meta.url
            ),
            'utf8'
          )
        )
      }
      const clientId = randomUUID(),
        userId = randomUUID(),
        roleId = randomUUID()
      await observer.query(
        'INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)',
        [userId]
      )
      await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [
        clientId
      ])
      await observer.query(
        'INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)',
        [roleId]
      )
      await observer.query(
        'INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\')',
        [roleId]
      )
      const entitlementId = (
        await observer.query(
          `INSERT INTO page_studio_entitlements(tenant_id,client_id,monthly_ai_operation_limit,active_site_limit,portal_creation_enabled,plan_metadata)
      VALUES('cms-tenant',$1,10,2,TRUE,'{"builder":{"collectionSchemas":true,"actionExecution":true}}') RETURNING id`,
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
      const now = Math.floor(Date.now() / 1000)
      claims = {
        tenantId: scope.tenantId,
        clientId,
        siteId,
        userId,
        role: 'agency',
        nonce: randomUUID(),
        issuedAt: now - 10,
        expiresAt: now + 600,
        capabilities: ['model:invoke', 'workspace:checkpoint']
      }
      await observer.query(
        `INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)`,
        [
          claims.nonce,
          claims.tenantId,
          clientId,
          siteId,
          userId,
          claims.role,
          JSON.stringify(claims.capabilities),
          claims.issuedAt,
          claims.expiresAt,
          hash
        ]
      )
    })
    afterEach(async () => {
      await Promise.all(
        connections.filter(db => db !== observer).map(db => db.end())
      )
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
    async function seed(effects = false, reads = false) {
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
        request: {
          formatVersion: 1,
          scope,
          actor,
          adoptionId: 'adoption_a',
          target
        }
      }
      const freeze = {
        ...freezeBody,
        digest: await collectionDigest(freezeBody)
      }
      const definition = {
        formatVersion: 1,
        id: 'fleet',
        label: 'Fleet',
        version: 1,
        displayFieldId: 'name',
        scope,
        fields: [
          {
            id: 'name',
            label: 'Name',
            type: 'text',
            required: true,
            visibility: 'public'
          },
          {
            id: 'secret',
            label: 'Secret',
            type: 'text',
            required: false,
            visibility: 'private'
          }
        ]
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
        bytes: new TextEncoder().encode(collectionCanonical(definition))
          .byteLength
      }
      const checkpoint = { id: 'checkpoint_a', digest: 'e'.repeat(64) }
      const collectionPin = {
        id: 'fleet',
        kind: 'collection',
        version: 1,
        sha256: await collectionDigest({ kind: 'collection', definition })
      }
      const artifact = {
        collections: reads
          ? [
              {
                id: 'fleet_rows',
                collection: collectionPin,
                fields: ['name'],
                limit: 10
              }
            ]
          : [],
        formatVersion: effects ? 2 : 1,
        id: 'example_action',
        kind: 'action',
        label: 'Example',
        scope,
        source:
          'function(input, data) { return {version:1,commands:[{type:"create",collectionId:"fleet",recordId:"created_record",expectedRevision:0,values:{name:input.name}}],result:{saved:true}}; }',
        tests: [
          {
            data: null,
            input: {},
            expected: effects ? { version: 1, commands: [], result: {} } : {}
          }
        ],
        version: 1,
        ...(effects
          ? {
              effects: {
                version: 1,
                maxCommands: 2,
                permissions: [
                  {
                    collection: collectionPin,
                    fields: ['name'],
                    operations: ['create', 'update', 'archive']
                  }
                ]
              }
            }
          : {})
      }
      const action = {
        id: artifact.id,
        kind: 'action',
        version: 1,
        sha256: await collectionDigest(artifact)
      }
      const manifest = {
        formatVersion: 1,
        scope,
        generation,
        applicationId,
        checkpoint,
        schemas: [{ collectionId: 'fleet', objectId: schemaId }],
        components: [],
        actions: [action],
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
        [
          checkpoint.id,
          scope.tenantId,
          scope.clientId,
          scope.siteId,
          checkpoint.digest
        ]
      )
      await observer.query(
        `UPDATE page_studio_sites SET current_checkpoint_id=$2 WHERE id=$1`,
        [scope.siteId, checkpoint.id]
      )
      const record = {
        scope,
        collectionId: 'fleet',
        id: 'original',
        revision: 1,
        schemaVersion: 1,
        archived: false,
        values: { name: 'Public', secret: 'hidden' }
      }
      const recordPin = {
        ...pin,
        kind: 'record',
        recordId: 'original',
        sha256: await collectionDigest(record),
        bytes: new TextEncoder().encode(collectionCanonical(record)).byteLength
      }
      if (reads) {
        const recordObjectId = randomUUID()
        await observer.query(
          `INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id) VALUES($1,$2,$3,'record','fleet','original',1,$4,$5,FALSE,$6,clock_timestamp(),'adoption_a')`,
          [
            key(),
            generation,
            recordObjectId,
            recordPin,
            schemaId,
            actor.userId
          ]
        )
        await observer.query(
          `INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,'fleet','original',$3)`,
          [key(), generation, recordObjectId]
        )
      }
      await observer.query('COMMIT')
      return {
        record,
        recordPin,
        artifact,
        action,
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

    const root = process.env.PAGE_STUDIO_ACTION_TEST_ROOT ?? ''
    let directory: string
    let modules: {
      coordinateAcceptedAction: (
        input: unknown,
        context: unknown
      ) => Promise<unknown>
      ManagedCmsStore: new (
        db: unknown,
        scope: unknown,
        target: unknown,
      ) => {
        prepare: (input: unknown) => Promise<unknown>
        readOperation: (input: unknown) => Promise<unknown>
        readObjects: (input: unknown) => Promise<unknown>
        readFreeze: (input: unknown) => Promise<unknown>
      }
      CollectionStore: new (
        db: unknown,
        scope: unknown,
      ) => { writeDefinition: (input: unknown) => Promise<unknown> }
    }
    let engine: {
      binding: { execute: (input: unknown) => Promise<unknown> }
      bucket: () => Promise<{
        get: (key: string) => Promise<unknown>
        put: (key: string, value: string) => Promise<unknown>
      }>
      dispose: () => Promise<void>
    }
    let physical: {
      getD1Database: (name: string) => Promise<{
        exec: (sql: string) => Promise<unknown>
        prepare: (sql: string) => {
          bind: (...args: unknown[]) => { run: () => Promise<unknown> }
        }
        withSession: (name: string) => unknown
      }>
      dispose: () => Promise<void>
      ready: Promise<unknown>
    }
    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), 'native-action-connected-'))
      const studioRequire = createRequire(
        join(root, 'services/business-content-worker/package.json')
      )
      const wranglerRequire = createRequire(
        studioRequire.resolve('wrangler/package.json')
      )
      const { build } = wranglerRequire('esbuild')
      const output = join(directory, 'bridge.mjs')
      await build({
        stdin: {
          contents: `export {coordinateAcceptedAction} from ${JSON.stringify(join(root, 'services/sandbox-worker/src/action-orchestration.ts'))}; export {ManagedCmsStore} from ${JSON.stringify(join(root, 'services/business-content-worker/src/cms-managed-store.ts'))}; export {CollectionStore} from ${JSON.stringify(join(root, 'services/business-content-worker/src/collection-store.ts'))};`,
          resolveDir: root,
          loader: 'ts'
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: output,
        alias: {
          '@xeroflow/control-client': join(
            root,
            'services/control-client/src/index.ts'
          ),
          '@xeroflow/protocol': join(root, 'packages/protocol/src/index.ts')
        }
      })
      modules = await import(/* @vite-ignore */ pathToFileURL(output).href)
      const harness = await import(
        /* @vite-ignore */ pathToFileURL(
          join(root, 'services/action-runtime/test/pipeline-harness.mjs')
        ).href
      )
      engine = await harness.createPrivateRuntimeHarness()
      const { Miniflare, convertV4MiniflareOptions }
        = wranglerRequire('miniflare')
      physical = new Miniflare(
        convertV4MiniflareOptions({
          cf: false,
          host: '127.0.0.1',
          port: 0,
          compatibilityDate: '2026-08-18',
          modules: true,
          d1Databases: { DB: 'action-connected' },
          script:
            'export default {fetch(){return new Response(\'private fixture\')}}',
          telemetry: { enabled: false }
        })
      )
      await physical.ready
      const db = await physical.getD1Database('DB')
      for (const file of [
        'migrations/0001_content_revisions.sql',
        'builder-migrations/0001_collection_versions.sql',
        'staging-migrations/0001_collection_proposals.sql',
        'managed-migrations/0001_cms_preparation.sql'
      ]) {
        await db.exec(
          readFileSync(
            join(root, 'services/business-content-worker', file),
            'utf8'
          )
            .replace(/--[^\n]*/g, '')
            .trim()
            .replace(/\s+/g, ' ')
        )
      }
    }, 60000)
    afterAll(async () => {
      await engine?.dispose()
      await physical?.dispose()
      if (directory) rmSync(directory, { recursive: true, force: true })
    })
    async function connected(
      failure:
        | 'none'
        | 'acknowledge'
        | 'complete'
        | 'prepare'
        | 'admit'
        | 'engine'
        | 'missing-body'
        | 'tampered-body'
        | 'wrong-schema' = 'none'
    ) {
      const s = await seed(true)
      const db = await physical.getD1Database('DB')
      const store = new modules.CollectionStore(
        db.withSession('first-primary'),
        scope
      )
      await store.writeDefinition({
        actorId: s.actor.userId,
        definition: s.definition,
        expectedVersion: 0,
        sha256: s.pin.sha256
      })
      const { digest, ...freezeBody } = s.freeze
      await db
        .prepare(
          'INSERT INTO builder_cms_cutovers(scope_key,adoption_id,request_digest,payload,digest) VALUES(?,?,?,?,?)'
        )
        .bind(
          key(),
          'adoption_a',
          await collectionDigest(s.freeze.request),
          collectionCanonical(freezeBody),
          digest
        )
        .run()
      const cms = new modules.ManagedCmsStore(
        db.withSession('first-primary'),
        scope,
        target
      )
      const bucket = await engine.bucket()
      await bucket.put(
        `builder-artifacts/v1/${await collectionDigest(JSON.parse(key()))}/action/${s.action.id}/1/${s.action.sha256}.json`,
        collectionCanonical(s.artifact)
      )
      let lost = false
      const prepares = vi.fn(async (input: unknown) => {
        const value = await cms.prepare(input)
        if (failure === 'prepare' && !lost) {
          lost = true
          throw new Error('lost prepare response')
        }
        return value
      })
      request.env.PAGE_STUDIO_CHECKPOINTS = {
        get: async (key: string) => {
          expect(activeTransactions).toBe(0)
          return bucket.get(key)
        }
      }
      request.env.PAGE_STUDIO_CONTENT_ROUTER = {
        readManagedCmsTarget: async () => {
          expect(activeTransactions).toBe(0)
          return target
        },
        readManagedCmsObjects: async (input: unknown) => {
          const objects = await cms.readObjects(input)
          if (
            objects.some(
              (object: { pin: { kind: string, origin: string } }) =>
                object.pin.kind === 'record'
                && object.pin.origin === 'prepared'
            )
          ) {
            if (failure === 'missing-body') return []
            if (failure === 'tampered-body')
              return objects.map((object: { body: unknown }) => ({
                ...object,
                body: { tampered: true }
              }))
            if (failure === 'wrong-schema')
              return objects.map((object: unknown) => ({
                ...(object as object),
                schema: null
              }))
          }
          return objects
        },
        readManagedCmsFreeze: (input: unknown) => cms.readFreeze(input),
        readManagedCmsOperation: (input: unknown) => cms.readOperation(input),
        prepareManagedCmsOperation: prepares
      }
      const principal = {
        source: 'studio-session' as const,
        claims,
        env: request.env,
        capability: 'model:invoke' as const
      }
      const control = {
        fetch: async (_url: string, init: RequestInit) => {
          const body = JSON.parse(String(init.body))
          const value = await coordinateActionInvocation(body, principal, {
            runTransaction: transactionFor(await connect())
          })
          if (body.phase === failure && !lost) {
            lost = true
            throw new Error(`lost ${failure} response`)
          }
          return Response.json(value)
        }
      }
      const execute = vi.fn(async (input: unknown) => {
        expect(activeTransactions).toBe(0)
        const value = await engine.binding.execute(input)
        if (failure === 'engine' && !lost) {
          lost = true
          throw new Error('lost engine response')
        }
        return value
      })
      const input = {
        intentId: randomUUID(),
        action: s.action,
        input: { name: 'Real runtime' }
      }
      const context = {
        control,
        token: 'fixture-original-child-token',
        scope,
        bucket,
        runtime: { execute }
      }
      return { input, context, execute, prepares, cms }
    }
    it.each(['none', 'acknowledge', 'complete', 'prepare'] as const)(
      'connects actual runtime to one visible record through %s recovery',
      async (failure) => {
        const s = await connected(failure)
        if (failure !== 'none')
          await expect(
            modules.coordinateAcceptedAction(s.input, s.context)
          ).rejects.toThrow('lost')
        const result = await modules.coordinateAcceptedAction(
          s.input,
          s.context
        )
        expect(result).toMatchObject({
          state: 'committed',
          output: { saved: true }
        })
        expect(s.execute).toHaveBeenCalledOnce()
        const commit = (
          await observer.query('SELECT request FROM page_studio_cms_commits')
        ).rows[0].request.input
        const operation = await s.cms.readOperation({
          scope,
          operationId: commit.operationId,
          requestDigest: commit.preparedRequestDigest
        })
        const graphStorage = createCmsGraphStorage(request.env, {
          scope,
          context: { state: { target } }
        } as CmsGraphSnapshot)
        const graphObjects = await graphStorage.readObjects(
          operation.receipt.items
        )
        expect(graphObjects).toHaveLength(1)
        expect(graphObjects[0]).toMatchObject({
          head: false,
          body: operation.request.items[0].body,
          schema: operation.request.items[0].schema
        })
        expect(
          (await observer.query('SELECT * FROM page_studio_ai_usage')).rows
        ).toHaveLength(1)
        expect(
          (await observer.query('SELECT * FROM page_studio_cms_record_heads'))
            .rows
        ).toHaveLength(1)
        expect(
          (await observer.query('SELECT * FROM page_studio_cms_commits')).rows
        ).toHaveLength(1)
        expect(JSON.stringify(result)).not.toContain('claimId')
        expect(
          await modules.coordinateAcceptedAction(s.input, s.context)
        ).toEqual(result)
        expect(s.execute).toHaveBeenCalledOnce()
      },
      60000
    )
    it.each(['missing-body', 'tampered-body', 'wrong-schema'] as const)(
      'rejects %s before native visibility',
      async (failure) => {
        const s = await connected(failure)
        await expect(
          modules.coordinateAcceptedAction(s.input, s.context)
        ).rejects.toThrow()
        expect(s.execute).toHaveBeenCalledOnce()
        expect(
          (await observer.query('SELECT * FROM page_studio_cms_record_heads'))
            .rows
        ).toHaveLength(0)
        expect(
          (await observer.query('SELECT * FROM page_studio_cms_commits')).rows
        ).toHaveLength(0)
        expect(
          (
            await observer.query(
              'SELECT state FROM page_studio_action_invocations'
            )
          ).rows
        ).toEqual([{ state: 'result_ready' }])
      },
      60000
    )
    it.each(['admit', 'engine'] as const)(
      'keeps unknown %s outcomes unresolved with no retry',
      async (failure) => {
        const s = await connected(failure)
        await expect(
          modules.coordinateAcceptedAction(s.input, s.context)
        ).rejects.toThrow('lost')
        expect(
          await modules.coordinateAcceptedAction(s.input, s.context)
        ).toEqual({ state: 'unresolved' })
        expect(s.execute).toHaveBeenCalledTimes(failure === 'engine' ? 1 : 0)
        expect(
          (await observer.query('SELECT * FROM page_studio_ai_usage')).rows
        ).toHaveLength(1)
        expect(
          (await observer.query('SELECT * FROM page_studio_cms_record_heads'))
            .rows
        ).toHaveLength(0)
      },
      60000
    )
    it('rechecks original native authority after replay output bytes are read', async () => {
      const s = await connected()
      await modules.coordinateAcceptedAction(s.input, s.context)
      const bucket = s.context.bucket
      request.env.PAGE_STUDIO_CHECKPOINTS = {
        get: async (key: string) => {
          const value = await bucket.get(key)
          if (key.includes('/action/'))
            await observer.query(
              'UPDATE page_studio_sessions SET revoked_at=clock_timestamp()'
            )
          return value
        }
      }
      await expect(
        modules.coordinateAcceptedAction(s.input, s.context)
      ).rejects.toThrow()
      expect(s.execute).toHaveBeenCalledOnce()
      expect(
        (await observer.query('SELECT * FROM page_studio_cms_record_heads'))
          .rows
      ).toHaveLength(1)
    }, 60000)
  }
)
