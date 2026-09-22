import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { admitActionInvocation, acknowledgeActionResult, readActionInvocation, commitActionInvocation, pinActionEffects } from '~~/server/utils/pageStudio/actionInvocations'
import type { PageStudioSessionClaims } from '~~/server/utils/pageStudio/sessions'
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
describe.runIf(Boolean(databaseUrl))('durable action invocations on disposable PostgreSQL', () => {
  let observer: pg.Client,
    connections: pg.Client[],
    schema: string,
    scope: PageStudioContentScope,
    request: ContentAuthorityRequest,
    claims: PageStudioSessionClaims
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
      '422_page_studio_cms_visibility.sql',
      '421_page_studio_ai_usage.sql', '423_page_studio_action_execution_usage.sql',
      '424_page_studio_action_invocations.sql', '424_page_studio_action_invocations.sql'
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
    claims = { tenantId: scope.tenantId, clientId, siteId, userId, role: 'agency', nonce: randomUUID(), issuedAt: now - 10, expiresAt: now + 600, capabilities: ['model:invoke', 'workspace:checkpoint'] }
    await observer.query(`INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)`, [claims.nonce, claims.tenantId, clientId, siteId, userId, claims.role, JSON.stringify(claims.capabilities), claims.issuedAt, claims.expiresAt, hash])
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
      fields: [{ id: 'name', label: 'Name', type: 'text', required: true, visibility: 'public' }, { id: 'secret', label: 'Secret', type: 'text', required: false, visibility: 'private' }]
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
    const collectionPin = { id: 'fleet', kind: 'collection', version: 1, sha256: await collectionDigest({ kind: 'collection', definition }) }
    const artifact = { collections: reads ? [{ id: 'fleet_rows', collection: collectionPin, fields: ['name'], limit: 10 }] : [], formatVersion: effects ? 2 : 1, id: 'example_action', kind: 'action', label: 'Example', scope, source: 'function(input, data) { return input; }', tests: [{ data: null, input: {}, expected: effects ? { version: 1, commands: [], result: {} } : {} }], version: 1, ...(effects ? { effects: { version: 1, maxCommands: 2, permissions: [{ collection: collectionPin, fields: ['name'], operations: ['create', 'update', 'archive'] }] } } : {}) }
    const action = { id: artifact.id, kind: 'action', version: 1, sha256: await collectionDigest(artifact) }
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
      [checkpoint.id, scope.tenantId, scope.clientId, scope.siteId, checkpoint.digest]
    )
    await observer.query(`UPDATE page_studio_sites SET current_checkpoint_id=$2 WHERE id=$1`, [
      scope.siteId,
      checkpoint.id
    ])
    const record = { scope, collectionId: 'fleet', id: 'original', revision: 1, schemaVersion: 1, archived: false, values: { name: 'Public', secret: 'hidden' } }
    const recordPin = { ...pin, kind: 'record', recordId: 'original', sha256: await collectionDigest(record), bytes: new TextEncoder().encode(collectionCanonical(record)).byteLength }
    if (reads) {
      const recordObjectId = randomUUID()
      await observer.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id) VALUES($1,$2,$3,'record','fleet','original',1,$4,$5,FALSE,$6,clock_timestamp(),'adoption_a')`, [key(), generation, recordObjectId, recordPin, schemaId, actor.userId])
      await observer.query(`INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,'fleet','original',$3)`, [key(), generation, recordObjectId])
    }
    await observer.query('COMMIT')
    return {
      record, recordPin,
      artifact, action,
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

  async function setup(effects = false, reads = false) {
    const s = await seed(effects, reads)
    const context = { formatVersion: 1, scope, generation: s.generation, target, freezeDigest: s.freeze.digest, expectedApplication: { id: s.applicationId, digest: s.digest }, expectedCheckpoint: s.checkpoint, expectedContent: null, expectedSchemas: (effects || reads) ? [s.pin] : [], expectedRecords: reads ? [{ collectionId: 'fleet', recordId: 'original', base: s.recordPin }] : [], action: s.action, runtimeDigest: 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e', inputDigest: await collectionDigest({}), dataDigest: await collectionDigest(reads ? { fleet_rows: [{ id: 'original', values: { name: 'Public' } }] } : {}) }
    return { s, body: { intentId: randomUUID(), context } }
  }
  async function dependencies(s: Awaited<ReturnType<typeof seed>>) {
    return { brokerId: 'sandbox.action-v1', readArtifact: async () => collectionCanonical(s.artifact), readObject: async (pin: { kind: string }) => pin.kind === 'record' ? s.record : s.definition, input: {}, runTransaction: transactionFor(await connect()) }
  }
  const principal = () => ({ source: 'studio-session' as const, claims, env: request.env, capability: 'model:invoke' as const })
  it('claims one dispatch and one unit across simultaneous admission and restart', async () => {
    const { s, body } = await setup()
    const results = await Promise.all([admitActionInvocation(body, principal(), await dependencies(s)), admitActionInvocation(body, principal(), await dependencies(s))])
    expect(results.filter(x => x.dispatchGranted)).toHaveLength(1)
    expect((await observer.query('SELECT * FROM page_studio_ai_usage')).rows).toHaveLength(1)
    expect(await admitActionInvocation(body, principal(), await dependencies(s))).toMatchObject({ dispatchGranted: false, state: 'dispatch_claimed' })
  })
  it('does not reserve usage for an unaccepted action or disabled execution policy', async () => {
    const { s, body } = await setup()
    body.context.action.sha256 = 'f'.repeat(64)
    await expect(admitActionInvocation(body, principal(), await dependencies(s))).rejects.toThrow()
    body.context.action = s.action
    await observer.query(`UPDATE page_studio_entitlements SET plan_metadata='{}'`)
    await expect(admitActionInvocation(body, principal(), await dependencies(s))).rejects.toThrow()
    expect((await observer.query('SELECT * FROM page_studio_ai_usage')).rows).toHaveLength(0)
  })
  it('quota failure rolls back both durable rows', async () => {
    const { s, body } = await setup()
    await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=0')
    await expect(admitActionInvocation(body, principal(), await dependencies(s))).rejects.toThrow()
    expect((await observer.query('SELECT * FROM page_studio_action_invocations')).rows).toHaveLength(0)
  })
  async function completedFixture() {
    const { s, body } = await setup()
    const admitted = await admitActionInvocation(body, principal(), await dependencies(s))
    const envelope = { formatVersion: 1, execution: admitted.execution, result: { status: 'ok', json: '{"answer":42}', fuelUsed: 5 } }
    const deps = { ...await dependencies(s), readResult: async () => collectionCanonical(envelope) }
    return { s, body, admitted, envelope, deps }
  }
  it('recovers persisted result after lost acknowledgement without a new dispatch', async () => {
    const { body, deps } = await completedFixture()
    expect(await acknowledgeActionResult(body, principal(), deps)).toMatchObject({ state: 'result_ready' })
    expect(await acknowledgeActionResult(body, principal(), deps)).toMatchObject({ state: 'result_ready' })
    expect(await readActionInvocation(body, principal(), deps)).toMatchObject({ dispatchGranted: false, state: 'result_ready' })
    expect((await observer.query('SELECT state FROM page_studio_ai_usage')).rows).toEqual([{ state: 'succeeded' }])
  })
  it('leaves missing private result unresolved and never releases the claim', async () => {
    const { body, deps } = await completedFixture()
    await expect(acknowledgeActionResult(body, principal(), { ...deps, readResult: async () => {
      throw new Error('missing')
    } })).rejects.toThrow('missing')
    expect(await readActionInvocation(body, principal(), deps)).toMatchObject({ state: 'dispatch_claimed', dispatchGranted: false })
    expect((await observer.query('SELECT state FROM page_studio_ai_usage')).rows).toEqual([{ state: 'reserved' }])
  })
  it.each(['identity', 'runtime', 'noncanonical', 'oversized', 'malformed'])('rejects %s private result without settling', async (kind) => {
    const { body, envelope, deps } = await completedFixture()
    if (kind === 'identity') envelope.execution.claimId = randomUUID()
    if (kind === 'runtime') envelope.execution.runtimeDigest = 'f'.repeat(64)
    if (kind === 'oversized') envelope.result.json = JSON.stringify('x'.repeat(66000))
    if (kind === 'malformed') envelope.result.json = 'not json'
    await expect(acknowledgeActionResult(body, principal(), { ...deps, readResult: async () => kind === 'noncanonical' ? JSON.stringify(envelope, null, 2) : collectionCanonical(envelope) })).rejects.toThrow()
    expect((await observer.query('SELECT state FROM page_studio_ai_usage')).rows).toEqual([{ state: 'reserved' }])
  })
  it('commits pure output with no D1 preparation and replays the exact final receipt', async () => {
    const { body, deps } = await completedFixture()
    await acknowledgeActionResult(body, principal(), deps)
    await pinActionEffects(body, body.context, principal(), deps)
    const result = await commitActionInvocation(body, principal(), deps)
    expect(result).toMatchObject({ replayed: false, receipt: { cms: null } })
    expect(await commitActionInvocation(body, principal(), deps)).toMatchObject({ replayed: true, receipt: (result as { receipt: unknown }).receipt })
    expect((await observer.query('SELECT * FROM page_studio_cms_commits')).rows).toHaveLength(0)
    expect((await observer.query('SELECT * FROM page_studio_audit_events WHERE action=\'action.commit\'')).rows).toHaveLength(1)
  })
  it('rolls back pure final receipt when audit insertion fails', async () => {
    const { body, deps } = await completedFixture()
    await acknowledgeActionResult(body, principal(), deps)
    await pinActionEffects(body, body.context, principal(), deps)
    await observer.query(`CREATE FUNCTION reject_action_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='action.commit' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_action_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION reject_action_audit()`)
    await expect(commitActionInvocation(body, principal(), deps)).rejects.toThrow('injected')
    expect((await observer.query('SELECT state,final_receipt FROM page_studio_action_invocations')).rows).toEqual([{ state: 'result_ready', final_receipt: null }])
  })
  it('rejects revoked original authority after private result read', async () => {
    const { body, deps } = await completedFixture()
    await expect(acknowledgeActionResult(body, principal(), { ...deps, readResult: async () => {
      const bytes = await deps.readResult()
      await observer.query('UPDATE page_studio_sessions SET revoked_at=clock_timestamp()')
      return bytes
    } })).rejects.toThrow()
    expect((await observer.query('SELECT state FROM page_studio_ai_usage')).rows).toEqual([{ state: 'reserved' }])
  })
  it('rejects input, actor child, and broker replacement on the same intent', async () => {
    const { body, deps } = await completedFixture()
    await expect(readActionInvocation(body, principal(), { ...deps, brokerId: 'other' })).rejects.toThrow()
    const changed = structuredClone(body)
    changed.context.inputDigest = 'b'.repeat(64)
    await expect(readActionInvocation(changed, principal(), deps)).rejects.toThrow()
    await expect(readActionInvocation(body, { ...principal(), claims: { ...claims, nonce: randomUUID() } }, deps)).rejects.toThrow()
  })
  it('database triggers preserve identity, monotonic state, result and final receipt', async () => {
    const { body, deps } = await completedFixture()
    await expect(observer.query('UPDATE page_studio_action_invocations SET claim_id=gen_random_uuid()')).rejects.toThrow('ACTION_INVOCATION_IMMUTABLE')
    await expect(observer.query('DELETE FROM page_studio_action_invocations')).rejects.toThrow('ACTION_INVOCATION_IMMUTABLE')
    await acknowledgeActionResult(body, principal(), deps)
    await expect(observer.query('UPDATE page_studio_action_invocations SET state=\'dispatch_claimed\',result_pin=NULL,result_digest=NULL')).rejects.toThrow('ACTION_INVOCATION_IMMUTABLE')
    await expect(observer.query('UPDATE page_studio_action_invocations SET result_pin=\'{}\'')).rejects.toThrow('ACTION_INVOCATION_IMMUTABLE')
  })
  async function effectFixture(commands: unknown[] = [{ type: 'create', collectionId: 'fleet', recordId: 'new_record', expectedRevision: 0, values: { name: 'New' } }]) {
    const { s, body } = await setup(true)
    const admitted = await admitActionInvocation(body, principal(), await dependencies(s))
    const envelope = { formatVersion: 1, execution: admitted.execution, result: { status: 'ok', json: collectionCanonical({ version: 1, commands, result: { saved: true } }), fuelUsed: 5 } }
    const deps = { ...await dependencies(s), readResult: async () => collectionCanonical(envelope) }
    await acknowledgeActionResult(body, principal(), deps)
    const effects = { ...body.context, expectedRecords: commands.map(command => ({ collectionId: 'fleet', recordId: (command as { recordId: string }).recordId, base: null })) }
    const pinned = await pinActionEffects(body, effects, principal(), deps)
    if (!commands.length) return { s, body, deps, commit: undefined, pinned, effects }
    const prepared = { formatVersion: 1, scope, operationId: `action_${body.intentId}`, actor: s.actor, freezeDigest: s.freeze.digest, candidateDigest: null, action: s.action, items: pinned.items }
    const pins = await Promise.all(pinned.items.map(async item => ({ kind: item.kind, collectionId: item.body.collectionId, recordId: item.body.id, version: item.version, origin: 'prepared', operationId: prepared.operationId, freezeDigest: s.freeze.digest, sha256: await collectionDigest(item.body), bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength })))
    const receiptBody = { state: 'prepared', scope, operationId: prepared.operationId, freezeDigest: s.freeze.digest, requestDigest: await collectionDigest(prepared), items: pins, createdAt: new Date().toISOString() }
    const receipt = { ...receiptBody, digest: await collectionDigest(receiptBody) }
    const { action: _action, runtimeDigest: _runtime, inputDigest: _input, dataDigest: _data, ...base } = effects
    const commit = { ...base, operationId: prepared.operationId, preparedDigest: receipt.digest, preparedRequestDigest: receipt.requestDigest }
    return { s, body, effects, pinned, commit, deps: { ...deps, commit, readPreparation: async () => ({ freeze: s.freeze, request: prepared, receipt, schemas: [{ pin: s.pin, definition: s.definition }] }) } }
  }
  it('commits v2 record heads and invocation receipt atomically and replays without duplicate writes', async () => {
    const { body, deps } = await effectFixture()
    expect(await commitActionInvocation(body, principal(), deps)).toMatchObject({ replayed: false })
    expect(await commitActionInvocation(body, principal(), deps)).toMatchObject({ replayed: true })
    expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
    expect((await observer.query('SELECT * FROM page_studio_cms_commits')).rows).toHaveLength(1)
  })
  it('v2 empty effect plan needs no D1 preparation', async () => {
    const { body, deps } = await effectFixture([])
    expect(await commitActionInvocation(body, principal(), deps)).toMatchObject({ replayed: false, receipt: { cms: null } })
    expect((await observer.query('SELECT * FROM page_studio_cms_commits')).rows).toHaveLength(0)
  })
  it('rolls back all record heads and CMS receipt when invocation audit fails', async () => {
    const { body, deps } = await effectFixture()
    await observer.query(`CREATE FUNCTION reject_final_action() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='action.commit' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_final_action BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION reject_final_action()`)
    await expect(commitActionInvocation(body, principal(), deps)).rejects.toThrow('injected')
    expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
    expect((await observer.query('SELECT * FROM page_studio_cms_commits')).rows).toHaveLength(0)
    expect((await observer.query('SELECT state FROM page_studio_action_invocations')).rows).toEqual([{ state: 'result_ready' }])
  })
  it('rejects replacement effect bases after normalization and direct trigger tampering', async () => {
    const { body, deps, effects } = await effectFixture()
    const changed = { ...effects, expectedRecords: [{ collectionId: 'fleet', recordId: 'other', base: null }] }
    await expect(pinActionEffects(body, changed, principal(), deps)).rejects.toThrow()
    await expect(observer.query('UPDATE page_studio_action_invocations SET effect_identity=\'{}\'')).rejects.toThrow('ACTION_INVOCATION_IMMUTABLE')
  })
  it('denies collection policy revoked after prepared bytes return', async () => {
    const { body, deps } = await effectFixture()
    if (!('readPreparation' in deps)) throw new Error('fixture')
    await expect(commitActionInvocation(body, principal(), { ...deps, readPreparation: async () => {
      const value = await deps.readPreparation()
      await observer.query(`UPDATE page_studio_entitlements SET plan_metadata='{"builder":{"actionExecution":true}}'`)
      return value
    } })).rejects.toThrow()
    expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
  })

  it('projects only declared public fields from accepted native record selections', async () => {
    const { s, body } = await setup(false, true)
    const result = await admitActionInvocation(body, principal(), await dependencies(s))
    expect(result).toMatchObject({ dispatchGranted: true, data: { fleet_rows: [{ id: 'original', values: { name: 'Public' } }] } })
    expect(JSON.stringify(result)).not.toContain('hidden')
  })
  it('denies head changes during private record reads without charging usage', async () => {
    const { s, body } = await setup(false, true)
    const deps = await dependencies(s)
    await expect(admitActionInvocation(body, principal(), { ...deps, readObject: async (pin) => {
      const result = await deps.readObject(pin)
      if (pin.kind === 'record') await observer.query('DELETE FROM page_studio_cms_record_heads')
      return result
    } })).rejects.toThrow()
    expect((await observer.query('SELECT * FROM page_studio_ai_usage')).rows).toHaveLength(0)
  })
  it.each(['result_ready', 'committed'])('replays %s without private reads after accepted heads advance', async (state) => {
    const { body, deps } = await completedFixture()
    await acknowledgeActionResult(body, principal(), deps)
    if (state === 'committed') {
      await pinActionEffects(body, body.context, principal(), deps)
      await commitActionInvocation(body, principal(), deps)
    }
    await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
    const read = vi.fn(async () => {
      throw new Error('must not read')
    })
    expect(await admitActionInvocation(body, principal(), { ...deps, readArtifact: read, readObject: read })).toMatchObject({ dispatchGranted: false, state })
    expect(read).not.toHaveBeenCalled()
    await observer.query(`UPDATE page_studio_entitlements SET plan_metadata='{}'`)
    await expect(admitActionInvocation(body, principal(), { ...deps, readArtifact: read })).rejects.toThrow()
  })
  async function repack(prepared: Record<string, unknown>, proof: Record<string, unknown>) {
    const request = prepared as { scope: unknown, operationId: string, freezeDigest: string, items: Array<{ kind: string, body: { collectionId: string, id: string }, version: number }> }
    const pins = await Promise.all(request.items.map(async item => ({ kind: item.kind, collectionId: item.body.collectionId, recordId: item.body.id, version: item.version, origin: 'prepared', operationId: request.operationId, freezeDigest: request.freezeDigest, sha256: await collectionDigest(item.body), bytes: new TextEncoder().encode(collectionCanonical(item.body)).byteLength })))
    const receiptBody = { state: 'prepared', scope: request.scope, operationId: request.operationId, freezeDigest: request.freezeDigest, requestDigest: await collectionDigest(request), items: pins, createdAt: new Date().toISOString() }
    return { ...proof, request, receipt: { ...receiptBody, digest: await collectionDigest(receiptBody) } }
  }
  it('rejects a correctly hashed D1 preparation that differs from normalized engine effects', async () => {
    const { body, deps } = await effectFixture()
    if (!('readPreparation' in deps)) throw new Error('fixture')
    const proof = await deps.readPreparation()
    proof.request.items[0]!.body.values.name = 'Altered'
    const changed = await repack(proof.request, proof)
    const commit = { ...deps.commit, preparedDigest: changed.receipt.digest, preparedRequestDigest: changed.receipt.requestDigest }
    await expect(commitActionInvocation(body, principal(), { ...deps, commit, readPreparation: async () => changed })).rejects.toThrow()
    expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(0)
  })
  it('two prepared invocations racing the same absent record commit only one visible write', async () => {
    const first = await effectFixture()
    if (!('readPreparation' in first.deps)) throw new Error('fixture')
    const body = { ...first.body, intentId: randomUUID() }
    const deps = await dependencies(first.s)
    const admitted = await admitActionInvocation(body, principal(), deps)
    const envelope = JSON.parse(await first.deps.readResult())
    envelope.execution = admitted.execution
    const second = { ...deps, readResult: async () => collectionCanonical(envelope) }
    await acknowledgeActionResult(body, principal(), second)
    await pinActionEffects(body, first.effects, principal(), second)
    const proof = await first.deps.readPreparation()
    const changed = await repack({ ...proof.request, operationId: `action_${body.intentId}` }, proof)
    const commit = { ...first.deps.commit, operationId: `action_${body.intentId}`, preparedDigest: changed.receipt.digest, preparedRequestDigest: changed.receipt.requestDigest }
    const outcomes = await Promise.allSettled([commitActionInvocation(first.body, principal(), first.deps), commitActionInvocation(body, principal(), { ...second, commit, readPreparation: async () => changed })])
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
    expect((await observer.query('SELECT * FROM page_studio_cms_commits')).rows).toHaveLength(1)
    expect((await observer.query('SELECT * FROM page_studio_action_invocations WHERE state=\'committed\'')).rows).toHaveLength(1)
  })

  it('commits a pure action with accepted read context without inventing effect targets', async () => {
    const { s, body } = await setup(false, true)
    const deps = await dependencies(s)
    const admitted = await admitActionInvocation(body, principal(), deps)
    const envelope = { formatVersion: 1, execution: admitted.execution, result: { status: 'ok', json: '{"total":1}' } }
    const completed = { ...deps, readResult: async () => collectionCanonical(envelope) }
    await acknowledgeActionResult(body, principal(), completed)
    await pinActionEffects(body, body.context, principal(), completed)
    expect(await commitActionInvocation(body, principal(), completed)).toMatchObject({ current: true, receipt: { cms: null } })
    expect((await observer.query('SELECT * FROM page_studio_cms_record_heads')).rows).toHaveLength(1)
  })
})
