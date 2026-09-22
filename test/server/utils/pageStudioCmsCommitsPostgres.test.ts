import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commitManagedCms, verifyCmsPreparation } from '~~/server/utils/pageStudio/cmsCommits'
import {
  readAcceptedCmsObject,
  listAcceptedCmsRecords,
  listAcceptedCmsHistory
} from '~~/server/utils/pageStudio/cmsVisibility'
import { collectionDigest, collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import {
  CmsObjectPinSchema,
  CmsPreparationSchema,
  CmsNativeCommitSchema,
  cmsItemIdentity,
  type CmsObjectPin
} from '~~/shared/pageStudio/cmsManaged'
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
describe.runIf(Boolean(databaseUrl))('accepted CMS metadata on disposable PostgreSQL', () => {
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
  async function operation(
    s: Awaited<ReturnType<typeof seed>>,
    operationId: string,
    records: Array<{ id: string, base?: CmsObjectPin }> = [{ id: 'first' }]
  ) {
    const items = records.map(record => ({
      kind: 'record',
      version: (record.base?.version ?? 0) + 1,
      expectedBase: record.base ?? null,
      schema: s.pin,
      body: {
        scope,
        collectionId: 'fleet',
        id: record.id,
        revision: (record.base?.version ?? 0) + 1,
        schemaVersion: 1,
        archived: false,
        values: { name: operationId }
      }
    }))
    const prepared = {
      formatVersion: 1,
      scope,
      actor: s.actor,
      freezeDigest: s.freeze.digest,
      operationId,
      candidateDigest: null,
      action: null,
      items
    }
    const pins = await Promise.all(
      items.map(async item =>
        CmsObjectPinSchema.parse({
          kind: 'record',
          collectionId: 'fleet',
          recordId: item.body.id,
          version: item.version,
          origin: 'prepared',
          operationId,
          freezeDigest: s.freeze.digest,
          sha256: await collectionDigest(item.body),
          bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength
        })
      )
    )
    const body = {
      state: 'prepared',
      scope,
      operationId,
      freezeDigest: s.freeze.digest,
      requestDigest: await collectionDigest(prepared),
      items: pins,
      createdAt: new Date().toISOString()
    }
    const receipt = { ...body, digest: await collectionDigest(body) }
    const proof = {
      freeze: s.freeze,
      request: prepared,
      receipt,
      schemas: [{ pin: s.pin, definition: s.definition }]
    }
    const input = {
      formatVersion: 1,
      scope,
      operationId,
      generation: s.generation,
      target,
      freezeDigest: s.freeze.digest,
      preparedDigest: receipt.digest,
      preparedRequestDigest: receipt.requestDigest,
      expectedApplication: { id: s.applicationId, digest: s.digest },
      expectedCheckpoint: s.checkpoint,
      expectedContent: null,
      expectedSchemas: [s.pin],
      expectedRecords: records.map(record => ({
        collectionId: 'fleet',
        recordId: record.id,
        base: record.base ?? null
      }))
    }
    return { proof, input, pins }
  }
  async function commit(
    op: { input: unknown, proof: unknown },
    extra: Record<string, unknown> = {}
  ) {
    let locked = false
    const transaction = transactionFor(await connect())
    return await commitManagedCms(
      op.input,
      { source: 'native-login', request },
      {
        readPreparation: async () => {
          expect(locked).toBe(false)
          return op.proof
        },
        runTransaction: async work =>
          await transaction(async (db) => {
            locked = true
            try {
              return await work(db)
            } finally {
              locked = false
            }
          }),
        ...extra
      }
    )
  }
  async function rebind(op: Awaited<ReturnType<typeof operation>>, value: unknown) {
    const prepared = CmsPreparationSchema.parse(value)
    const pins = await Promise.all(
      prepared.items.map(async item =>
        CmsObjectPinSchema.parse({
          ...cmsItemIdentity(item),
          origin: 'prepared',
          operationId: prepared.operationId,
          freezeDigest: prepared.freezeDigest,
          sha256: await collectionDigest(item.body),
          bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength
        })
      )
    )
    const { digest: _digest, ...oldBody } = op.proof.receipt
    const body = { ...oldBody, requestDigest: await collectionDigest(prepared), items: pins }
    const receipt = { ...body, digest: await collectionDigest(body) }
    return {
      ...op,
      pins,
      proof: { ...op.proof, request: prepared, receipt },
      input: {
        ...op.input,
        preparedDigest: receipt.digest,
        preparedRequestDigest: receipt.requestDigest
      }
    }
  }
  it('rejects valid public preparations at the human commit boundary before opening a transaction', async () => {
    const s = await seed()
    const op = await operation(s, 'public_submit')
    const publicOp = await rebind(op, {
      ...op.proof.request,
      formatVersion: 2,
      action: { kind: 'action', id: 'submit_record', version: 1, sha256: 'a'.repeat(64) },
      actor: { kind: 'published-form', invocationId: randomUUID(), activationId: randomUUID(), releaseId: randomUUID(), pointerVersion: 1, identityDigest: 'b'.repeat(64) }
    })
    // Exact receipt/body verification succeeds; provenance is not human authority.
    await expect(verifyCmsPreparation(CmsNativeCommitSchema.parse(publicOp.input), async () => publicOp.proof)).resolves.toBeDefined()
    const runTransaction = vi.fn()
    await expect(commitManagedCms(publicOp.input, { source: 'native-login', request }, {
      readPreparation: async () => publicOp.proof, runTransaction
    })).rejects.toThrow()
    expect(runTransaction).not.toHaveBeenCalled()
    expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
  })
  const metadataCounts = async () =>
    (
      await observer.query(
        `SELECT (SELECT count(*)::int FROM page_studio_cms_objects WHERE kind='record') AS objects,(SELECT count(*)::int FROM page_studio_cms_commits) AS receipts,(SELECT count(*)::int FROM page_studio_audit_events WHERE action='cms.commit') AS audits`
      )
    ).rows[0]
  it('admits one of two concurrent absent creates and publishes only its exact pin', async () => {
    const s = await seed(),
      a = await operation(s, 'one'),
      b = await operation(s, 'two')
    const outcomes = await Promise.allSettled([commit(a), commit(b)])
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1)
    expect(await metadataCounts()).toEqual({ objects: 1, receipts: 1, audits: 1 })
    const visible = await readAcceptedCmsObject(observer, {
      scope,
      kind: 'record',
      collectionId: 'fleet',
      recordId: 'first'
    })
    expect([a.pins[0].sha256, b.pins[0].sha256]).toContain(visible.pin.sha256)
    await expect(
      readAcceptedCmsObject(observer, {
        scope,
        kind: 'record',
        collectionId: 'fleet',
        recordId: 'first',
        version: 2
      })
    ).rejects.toThrow()
  })
  it('rejects the entire multi-record plan when any accepted base is stale', async () => {
    const s = await seed(),
      first = await operation(s, 'one')
    await commit(first)
    const stale = await operation(s, 'two', [{ id: 'second' }, { id: 'first' }])
    await expect(commit(stale)).rejects.toThrow()
    expect(await metadataCounts()).toEqual({ objects: 1, receipts: 1, audits: 1 })
    await expect(
      readAcceptedCmsObject(observer, {
        scope,
        kind: 'record',
        collectionId: 'fleet',
        recordId: 'second'
      })
    ).rejects.toThrow()
  })
  it('replays the original immutable result after a later head without rewinding it', async () => {
    const s = await seed(),
      first = await operation(s, 'one')
    const original = await commit(first)
    const second = await operation(s, 'two', [{ id: 'first', base: first.pins[0] }])
    await commit(second)
    const replay = await commit(first)
    expect(replay.receipt).toEqual(original.receipt)
    expect(replay.current).toBe(false)
    expect(
      (
        await readAcceptedCmsObject(observer, {
          scope,
          kind: 'record',
          collectionId: 'fleet',
          recordId: 'first'
        })
      ).pin
    ).toEqual(second.pins[0])
    expect(
      (
        await listAcceptedCmsHistory(observer, {
          scope,
          kind: 'record',
          collectionId: 'fleet',
          recordId: 'first',
          limit: 10
        })
      ).items.map(x => x.pin.version)
    ).toEqual([1, 2])
  })
  it('continues accepted history pages with a strict identity-only cursor', async () => {
    const s = await seed(),
      first = await operation(s, 'one')
    await commit(first)
    await commit(await operation(s, 'two', [{ id: 'first', base: first.pins[0] }]))
    const read = { scope, kind: 'record', collectionId: 'fleet', recordId: 'first', limit: 1 }
    const page = await listAcceptedCmsHistory(observer, read)
    const next = await listAcceptedCmsHistory(observer, { ...read, cursor: page.nextCursor })
    expect([...page.items, ...next.items].map(item => item.pin.version)).toEqual([1, 2])
    expect(next.nextCursor).toBeNull()
  })
  it('rejects altered proof and changed exact replay without partial state', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    const corrupt = structuredClone(op)
    corrupt.proof.request.items[0].body.values.name = 'tampered'
    await expect(commit(corrupt)).rejects.toThrow()
    expect(await metadataCounts()).toEqual({ objects: 0, receipts: 0, audits: 0 })
    await commit(op)
    const changed = await operation(s, 'one', [{ id: 'different' }])
    await expect(commit(changed)).rejects.toThrow()
    expect(await metadataCounts()).toEqual({ objects: 1, receipts: 1, audits: 1 })
  })
  it('rechecks revoked authority on exact replay and never calls D1 while locked', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    await commit(op)
    await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    await expect(commit(op)).rejects.toThrow()
    expect(await metadataCounts()).toEqual({ objects: 1, receipts: 1, audits: 1 })
  })
  it('denies inactive generations and foreign scopes and preserves record heads across page restore', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    await commit(op)
    await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
    expect(
      (
        await readAcceptedCmsObject(observer, {
          scope,
          kind: 'record',
          collectionId: 'fleet',
          recordId: 'first'
        })
      ).pin
    ).toEqual(op.pins[0])
    await expect(commit(await operation(s, 'two', [{ id: 'second' }]))).rejects.toThrow()
    await expect(
      readAcceptedCmsObject(observer, {
        scope: { ...scope, environment: 'preview' },
        kind: 'record',
        collectionId: 'fleet',
        recordId: 'first'
      })
    ).rejects.toThrow()
    await observer.query('UPDATE page_studio_cms_scopes SET state=\'blocked\'')
    await expect(
      readAcceptedCmsObject(observer, {
        scope,
        kind: 'record',
        collectionId: 'fleet',
        recordId: 'first'
      })
    ).rejects.toThrow()
  })
  it('lists only accepted heads using bounded scope-bound keyset cursors', async () => {
    const s = await seed(),
      privateOnly = await operation(s, 'private', [{ id: 'private_record' }])
    expect(privateOnly.proof.receipt.state).toBe('prepared')
    expect(
      (await listAcceptedCmsRecords(observer, { scope, collectionId: 'fleet' })).items
    ).toEqual([])
    await commit(await operation(s, 'one', [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }]))
    const first = await listAcceptedCmsRecords(observer, { scope, collectionId: 'fleet', limit: 2 })
    expect(first.items.map(item => item.pin.recordId)).toEqual(['alpha', 'beta'])
    const next = await listAcceptedCmsRecords(observer, {
      scope,
      collectionId: 'fleet',
      limit: 2,
      cursor: first.nextCursor
    })
    expect(next.items.map(item => item.pin.recordId)).toEqual(['gamma'])
    expect(next.nextCursor).toBeNull()
    await expect(
      listAcceptedCmsRecords(observer, { scope, collectionId: 'other', cursor: first.nextCursor })
    ).rejects.toThrow()
    await expect(
      listAcceptedCmsRecords(observer, {
        scope,
        collectionId: 'fleet',
        cursor: { ...first.nextCursor, generation: randomUUID() }
      })
    ).rejects.toThrow()
  })
  it('rolls back metadata and pointers if final audit persistence fails', async () => {
    const s = await seed(),
      op = await operation(s, 'one', [{ id: 'first' }, { id: 'second' }])
    await observer.query(`CREATE FUNCTION fail_cms_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='cms.commit' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_cms_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION fail_cms_audit();`)
    await expect(commit(op)).rejects.toThrow('audit unavailable')
    expect(await metadataCounts()).toEqual({ objects: 0, receipts: 0, audits: 0 })
    expect(
      (await listAcceptedCmsRecords(observer, { scope, collectionId: 'fleet' })).items
    ).toEqual([])
  })
  it('denies changed generation, expired login and changed schema expectations', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    await expect(
      commit({ ...op, input: { ...op.input, generation: randomUUID() } })
    ).rejects.toThrow()
    await expect(
      commit({
        ...op,
        input: { ...op.input, expectedSchemas: [{ ...s.pin, sha256: '0'.repeat(64) }] }
      })
    ).rejects.toThrow()
    await observer.query(
      'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-INTERVAL \'1second\''
    )
    await expect(commit(op)).rejects.toThrow()
    expect(await metadataCounts()).toEqual({ objects: 0, receipts: 0, audits: 0 })
  })
  it('keeps accepted history and application selections immutable at SQL boundaries', async () => {
    const s = await seed()
    await commit(await operation(s, 'one'))
    for (const table of [
      'page_studio_cms_objects',
      'page_studio_application_versions',
      'page_studio_cms_application_schemas',
      'page_studio_cms_commits'
    ]) {
      await expect(observer.query(`DELETE FROM ${table}`)).rejects.toThrow('immutable')
    }
    await expect(
      observer.query(`UPDATE page_studio_cms_objects SET logical_version=9`)
    ).rejects.toThrow('immutable')
    expect(await metadataCounts()).toEqual({ objects: 1, receipts: 1, audits: 1 })
  })
  it('enforces scope/generation/schema-kind foreign keys and canonical scope identity', async () => {
    const s = await seed()
    const op = await operation(s, 'one')
    await commit(op)
    await expect(
      observer.query(
        `INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,'fleet','bad',$3)`,
        [key(), randomUUID(), s.schemaId]
      )
    ).rejects.toThrow()
    await expect(
      observer.query(`UPDATE page_studio_cms_scopes SET scope_key='forged'`)
    ).rejects.toThrow()
    await expect(
      observer.query(`UPDATE page_studio_cms_scopes SET current_content_id=$1`, [s.schemaId])
    ).rejects.toThrow()
  })
  it('rejects inactive action pins and standalone schema effects even with valid prepared bytes', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    const action = await rebind(op, {
      ...op.proof.request,
      action: { kind: 'action', id: 'submit_action', version: 1, sha256: 'f'.repeat(64) }
    })
    await expect(commit(action)).rejects.toThrow()
    const schema = await rebind(op, {
      ...op.proof.request,
      items: [
        {
          kind: 'schema',
          version: 1,
          expectedBase: null,
          body: { ...s.definition, id: 'private_schema' }
        }
      ]
    })
    await expect(commit(schema)).rejects.toThrow('verified application acceptance')
    expect(await metadataCounts()).toEqual({ objects: 0, receipts: 0, audits: 0 })
  })
  it('commits business content and record pointers together without replacing the application', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    const mixed = await rebind(op, {
      ...op.proof.request,
      items: [
        ...op.proof.request.items,
        {
          kind: 'content',
          version: 1,
          expectedBase: null,
          body: { schemaVersion: 1, scope, collections: [] }
        }
      ]
    })
    const result = await commit(mixed)
    expect(result.receipt.objects).toHaveLength(2)
    const content = await readAcceptedCmsObject(observer, { scope, kind: 'content' })
    expect(content.pin).toEqual(mixed.pins[1])
    expect(content.application.id).toBe(s.applicationId)
    const stale = await operation(s, 'two', [{ id: 'second' }])
    await expect(commit(stale)).rejects.toThrow()
    expect(
      (await listAcceptedCmsRecords(observer, { scope, collectionId: 'fleet' })).items.map(
        item => item.pin.recordId
      )
    ).toEqual(['first'])
    const row = (await observer.query('SELECT request FROM page_studio_cms_commits')).rows[0]
    expect(JSON.stringify(row.request)).not.toContain('collections')
    expect(JSON.stringify(row.request)).not.toContain('values')
  })
  it('freezes verified proofs against modification before transaction-only insertion', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    const verified = await verifyCmsPreparation(
      CmsNativeCommitSchema.parse(op.input),
      async () => op.proof
    )
    expect(Object.isFrozen(verified.request.items[0].body)).toBe(true)
    expect(() => Object.assign(verified.receipt.items[0], { sha256: '0'.repeat(64) })).toThrow()
  })
  it('does not retry an ambiguous COMMIT and recovers only through exact authorized replay', async () => {
    const s = await seed(),
      op = await operation(s, 'one')
    let attempts = 0
    const transaction = transactionFor(await connect())
    await expect(
      commit(op, {
        runTransaction: async (work: (db: PageStudioControlQueryClient) => Promise<unknown>) => {
          attempts += 1
          await transaction(work)
          throw new Error('lost commit acknowledgement')
        }
      })
    ).rejects.toThrow('lost commit acknowledgement')
    expect(attempts).toBe(1)
    expect(await metadataCounts()).toEqual({ objects: 1, receipts: 1, audits: 1 })
    expect((await commit(op)).replayed).toBe(true)
    expect(await metadataCounts()).toEqual({ objects: 1, receipts: 1, audits: 1 })
  })
  it('fails closed when retained native freeze identity no longer matches accepted pins', async () => {
    const s = await seed()
    await commit(await operation(s, 'one'))
    await observer.query('UPDATE page_studio_cms_scopes SET freeze_digest=$1', ['0'.repeat(64)])
    await expect(
      readAcceptedCmsObject(observer, {
        scope,
        kind: 'record',
        collectionId: 'fleet',
        recordId: 'first'
      })
    ).rejects.toThrow()
    await expect(
      listAcceptedCmsRecords(observer, { scope, collectionId: 'fleet' })
    ).rejects.toThrow()
  })
})
