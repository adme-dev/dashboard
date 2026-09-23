import { readAcceptedComponentCmsData } from '~~/server/utils/pageStudio/componentCmsData'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coordinateCmsGraphTransition, coordinateCmsGraphCheckpoint, coordinateCmsGraphRestore, lookupCmsGraphOperation } from '~~/server/utils/pageStudio/cmsGraphCoordinator'
import { readAcceptedFormActions } from '~~/server/utils/pageStudio/formActionDiscovery'
import { commitPageStudioCheckpoint, commitPageStudioEditorCheckpoint, acceptPageStudioAiProposal } from '~~/server/utils/pageStudio/controlStore'
import { beginCmsAdoption } from '~~/server/utils/pageStudio/cmsAdoption'
import { acceptManagedFeatureCandidate } from '~~/server/utils/pageStudio/featureCandidateApplication'
import { CmsPreparationSchema } from '~~/shared/pageStudio/cmsManaged'
import fixtureJson from '../../fixtures/pageStudioCmsGraph.json'
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
describe.runIf(Boolean(databaseUrl))('native coherent graph acceptance on disposable PostgreSQL', () => {
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
      '422_page_studio_cms_visibility.sql',
      '425_page_studio_cms_authoring_scope.sql'
    ]) {
      await observer.query(
        readFileSync(
          new URL(`../../../server/database/migrations/${file}`, import.meta.url),
          'utf8'
        )
      )
    }
    const clientId = '10000000-0000-4000-8000-000000000001',
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
      VALUES('tenant',$1,0,2,TRUE,'{"builder":{"collectionSchemas":true}}') RETURNING id`,
        [clientId]
      )
    ).rows[0].id
    const siteId = (
      await observer.query(
        `INSERT INTO page_studio_sites(id,tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('20000000-0000-4000-8000-000000000001','tenant',$1,$2,'CMS test','cms-test','fixture') RETURNING id`,
        [clientId, entitlementId]
      )
    ).rows[0].id
    scope = {
      tenantId: 'tenant',
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
        PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging',
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
  async function fixture() {
    const f = structuredClone(fixtureJson)
    const actor = { kind: 'agency-user', userId: request.actor.actorId, loginSessionHash: request.login.tokenHash }
    const freezeBody = { createdAt: '2026-09-22T00:00:00.000Z', request: { formatVersion: 1, scope, actor, target: f.base.target, adoptionId: 'adoption_a' }, state: 'frozen' }
    const freeze = { ...freezeBody, digest: await collectionDigest(freezeBody) }
    const prep = JSON.parse(f.preparations[0]!.requestBytes)
    prep.actor = actor
    prep.freezeDigest = freeze.digest
    const receipt = JSON.parse(f.preparations[0]!.receiptBytes)
    receipt.freezeDigest = freeze.digest
    for (const pin of receipt.items) pin.freezeDigest = freeze.digest
    receipt.requestDigest = await collectionDigest(prep)
    delete receipt.digest
    receipt.digest = await collectionDigest(receipt)
    const key = JSON.stringify([scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment])
    const cpKey = (id: string) => `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${id}.json`
    await observer.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at) VALUES($1,$2,$3,$4,$5,$6,'base',clock_timestamp())`, [f.base.checkpoint.id, scope.tenantId, scope.clientId, scope.siteId, f.base.checkpoint.digest, cpKey(f.base.checkpoint.id)])
    await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=$1 WHERE id=$2', [f.base.checkpoint.id, scope.siteId])
    await observer.query(`INSERT INTO page_studio_cms_scopes(scope_key,tenant_id,client_id,business_id,site_id,environment,state,adoption_id,active_generation,target,freeze_digest) VALUES($1,$2,$3,$4,$5,$6,'legacy','adoption_a',$7,$8,$9)`, [key, scope.tenantId, scope.clientId, scope.businessId, scope.siteId, scope.environment, f.base.generation, f.base.target, freeze.digest])
    await observer.query(`INSERT INTO page_studio_application_versions(scope_key,generation,id,digest,manifest,adoption_id) VALUES($1,$2,$3,$4,$5,'adoption_a')`, [key, f.base.generation, f.base.application.manifest.applicationId, f.base.application.digest, f.base.application.manifest])
    await observer.query(`UPDATE page_studio_cms_scopes SET state='managed',current_application_id=$2 WHERE scope_key=$1`, [key, f.base.application.manifest.applicationId])
    const texts = new Map<string, string>()
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('')
    for (const raw of f.artifactBytes) {
      const artifact = JSON.parse(raw), identity = artifact.kind === 'collection' ? artifact.definition : artifact
      texts.set(`builder-artifacts/v1/${await hash(key)}/${artifact.kind}/${identity.id}/${identity.version}/${await hash(raw)}.json`, raw)
    }
    texts.set(`builder-candidates/v1/${await hash(key)}/${f.request.candidateId}.json`, f.candidateBytes)
    for (const cp of [f.base.checkpoint, f.nextCheckpoint]) texts.set(cpKey(cp.id), JSON.stringify({ schemaVersion: 1, checkpointId: cp.id, digest: cp.digest, scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId }, manifest: cp.manifest }))
    let inTransaction = false
    const get = vi.fn(async (objectKey: string) => {
      expect(inTransaction, 'R2 reads must be outside native transactions').toBe(false)
      const raw = texts.get(objectKey)
      if (!raw) return null
      const bytes = new TextEncoder().encode(raw)
      return { size: bytes.length, etag: 'fixture', body: new ReadableStream({ start(controller) {
        controller.enqueue(bytes)
        controller.close()
      } }) }
    })
    request.env.PAGE_STUDIO_CHECKPOINTS = { get, put: async (key: string, raw: string) => {
      if (texts.has(key)) return null
      texts.set(key, raw)
      return { etag: 'fixture' }
    } }
    request.env.PAGE_STUDIO_ACTION_RUNTIME_DIGEST = f.expectedRuntimeDigest
    request.env.PAGE_STUDIO_CONTENT_ROUTER = {
      readManagedCmsTarget: async () => {
        expect(inTransaction, 'D1 reads must be outside native transactions').toBe(false)
        return f.base.target
      },
      prepareManagedCmsOperation: async (raw: unknown) => {
        expect(inTransaction, 'D1 preparation must be outside native transactions').toBe(false)
        const next = CmsPreparationSchema.parse(raw)
        Object.assign(prep, next)
        receipt.operationId = next.operationId
        receipt.requestDigest = await collectionDigest(next)
        for (const pin of receipt.items) pin.operationId = next.operationId
        delete receipt.digest
        receipt.digest = await collectionDigest(receipt)
        return structuredClone(receipt)
      },
      readManagedCmsOperation: async () => ({ request: prep, receipt }),
      readManagedCmsFreeze: async () => freeze,
      readManagedCmsObjects: async ({ pins }: { pins: unknown[] }) => pins.map(pin => ({ pin, body: prep.items[0].body, schema: null, head: false, actorId: actor.userId, createdAt: receipt.createdAt }))
    }
    const input = { operationId: 'accept_feature_a', candidateId: f.request.candidateId, candidateDigest: f.request.candidateDigest,
      expectedApplication: f.request.expectedApplication, expectedCheckpoint: f.request.expectedCheckpoint, expectedContent: null, contentRevision: 0,
      nextCheckpoint: { checkpointId: f.nextCheckpoint.id, digest: f.nextCheckpoint.digest, objectKey: cpKey(f.nextCheckpoint.id), createdAt: receipt.createdAt, etag: 'next', userId: actor.userId, scope: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId } },
      preparations: [{ operationId: prep.operationId, requestDigest: receipt.requestDigest, receiptDigest: receipt.digest }], summary: 'Add fleet' }
    const transaction = transactionFor(await connect())
    const runTransaction = async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => {
      inTransaction = true
      try {
        return await transaction(work)
      } finally { inTransaction = false }
    }
    return { input, principal: { source: 'native-login' as const, request }, deps: { runTransaction }, get, texts, key }
  }
  it('commits the verified checkpoint, version, schema, full graph and receipt together', async () => {
    const f = await fixture()
    const result = await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    expect(result.acknowledged).toBe(true)
    expect(result.versionId).toBeTruthy()
    const app = (await observer.query('SELECT manifest FROM page_studio_application_versions WHERE id=$1', [result.application.id])).rows[0].manifest
    expect(app.components.map((pin: { id: string }) => pin.id).sort()).toEqual(['fleet_view', 'retained'])
    expect(app.actions.map((pin: { id: string }) => pin.id)).toEqual(['submit'])
    expect(app.schemas.map((pin: { collectionId: string }) => pin.collectionId)).toEqual(['fleet'])
    expect((await observer.query('SELECT current_checkpoint_id,current_version_id FROM page_studio_sites WHERE id=$1', [scope.siteId])).rows[0]).toEqual({ current_checkpoint_id: result.checkpointId, current_version_id: result.versionId })
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_commits')).rows[0].count).toBe(1)
  })
  it('replays under fresh authority without loading remote storage', async () => {
    const f = await fixture()
    const first = await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    f.get.mockRejectedValue(new Error('storage unavailable'))
    expect(await lookupCmsGraphOperation(f.input.operationId, f.principal, { id: f.input.candidateId, digest: f.input.candidateDigest }, f.deps)).toEqual(first)
    await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    await expect(lookupCmsGraphOperation(f.input.operationId, f.principal, { id: f.input.candidateId, digest: f.input.candidateDigest }, f.deps)).rejects.toThrow()
  })
  it('advances an ordinary page save and application together while preserving graph selections', async () => {
    const f = await fixture()
    const accepted = await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    const schemaObject = (await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'schema\'')).rows[0]
    const recordId = randomUUID()
    const recordBody = { scope, collectionId: 'fleet', id: 'record_a', revision: 1, schemaVersion: 1, archived: false, values: { title: 'Keep current record' } }
    const recordPin = { ...schemaObject.storage_pin, kind: 'record', recordId: 'record_a', operationId: 'record_operation', sha256: await collectionDigest(recordBody), bytes: new TextEncoder().encode(JSON.stringify(recordBody)).length }
    await observer.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id) VALUES($1,$2,$3,'record','fleet','record_a',1,$4,$5,FALSE,$6,clock_timestamp(),'adoption_a')`, [schemaObject.scope_key, schemaObject.generation, recordId, recordPin, schemaObject.id, request.actor.actorId])
    await observer.query(`INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,'fleet','record_a',$3)`, [schemaObject.scope_key, schemaObject.generation, recordId])
    const recordBefore = (await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'record\'')).rows
    const prior = JSON.parse(f.texts.get(f.input.nextCheckpoint.objectKey)!)
    prior.checkpointId = 'ordinary_save'
    prior.manifest.pages[0].title = 'Updated title'
    prior.digest = await collectionDigest(prior.manifest)
    const cp = { ...f.input.nextCheckpoint, checkpointId: prior.checkpointId, digest: prior.digest, objectKey: f.input.nextCheckpoint.objectKey.replace('next_checkpoint', 'ordinary_save') }
    cp.objectKey = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${cp.checkpointId}.json`
    f.texts.set(cp.objectKey, JSON.stringify(prior))
    const saved = await coordinateCmsGraphCheckpoint({ checkpoint: cp, expectedCheckpointId: accepted.checkpointId }, f.principal, f.deps)
    expect(saved.checkpointId).toBe('ordinary_save')
    const audit = (await observer.query('SELECT metadata FROM page_studio_audit_events WHERE action=\'workspace.checkpointed\' AND resource_id=$1', [saved.checkpointId])).rows[0]
    expect(audit.metadata.stagingOrigin).toEqual({ formatVersion: 1, environment: 'staging', source: 'native-login',
      userId: request.actor.actorId, role: 'agency', loginSessionHash: request.login.tokenHash })
    expect(saved.versionId).toBeNull()
    expect((await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'record\'')).rows).toEqual(recordBefore)
    expect((await observer.query('SELECT object_id FROM page_studio_cms_record_heads')).rows).toEqual([{ object_id: recordId }])
    const app = (await observer.query('SELECT manifest FROM page_studio_application_versions WHERE id=$1', [saved.application.id])).rows[0].manifest
    expect(app.actions.map((pin: { id: string }) => pin.id)).toEqual(['submit'])
    expect(app.schemas).toHaveLength(1)
    expect((await observer.query('SELECT current_version_id FROM page_studio_sites WHERE id=$1', [scope.siteId])).rows[0].current_version_id).toBe(accepted.versionId)
  })
  it('rejects a changed exact replay intent and rolls back late SQL failures', async () => {
    const f = await fixture()
    const failing = { runTransaction: async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => f.deps.runTransaction(db => work({ query: async (sql, params) => {
      if (sql.startsWith('INSERT INTO page_studio_cms_commits')) throw new Error('injected final SQL failure')
      return db.query(sql, params)
    } })) }
    await expect(coordinateCmsGraphTransition(f.input, f.principal, failing)).rejects.toThrow('injected final SQL failure')
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_versions')).rows[0].count).toBe(0)
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_application_versions')).rows[0].count).toBe(1)
    await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    await expect(coordinateCmsGraphTransition({ ...f.input, summary: 'Different intent' }, f.principal, f.deps)).rejects.toThrow('another request')
  })

  it('restores old authored pages under the current graph and replays without storage', async () => {
    const f = await fixture()
    const accepted = await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    const body = { action: 'restore', checkpointId: f.input.expectedCheckpoint.id, expectedCheckpointId: accepted.checkpointId, requestId: randomUUID() }
    const restored = await coordinateCmsGraphRestore(body, f.principal, f.deps)
    const app = (await observer.query('SELECT manifest FROM page_studio_application_versions a JOIN page_studio_cms_scopes s ON s.current_application_id=a.id')).rows[0].manifest
    expect(app.actions.map((pin: { id: string }) => pin.id)).toEqual(['submit'])
    expect(app.checkpoint.id).toBe(restored.checkpointId)
    expect((await observer.query('SELECT current_version_id FROM page_studio_sites')).rows[0].current_version_id).toBeNull()
    f.get.mockRejectedValue(new Error('storage unavailable'))
    expect(await coordinateCmsGraphRestore(body, f.principal, f.deps)).toEqual(restored)
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_audit_events WHERE action=\'draft.history.saved\'')).rows[0].count).toBe(1)
  })
  it('rejects the generic checkpoint bypass after management', async () => {
    const f = await fixture()
    await expect(commitPageStudioCheckpoint({ checkpoint: f.input.nextCheckpoint, expectedCheckpointId: f.input.expectedCheckpoint.id }, f.deps)).rejects.toMatchObject({ code: 'CMS_MANAGED_CHECKPOINT_REQUIRED' })
    expect((await observer.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe(f.input.expectedCheckpoint.id)
  })
  it('discovers accepted action descriptors with real native authority and denies revoked reads', async () => {
    const f = await fixture()
    const accepted = await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    const descriptors = await readAcceptedFormActions(f.principal, f.deps)
    expect(descriptors.application).toEqual(accepted.application)
    expect(descriptors.checkpoint.id).toBe(accepted.checkpointId)
    expect(descriptors.actions).toHaveLength(1)
    expect(descriptors.actions[0]).toMatchObject({ pin: { kind: 'action', id: 'submit' }, inputContract: { version: 1 } })
    expect(JSON.stringify(descriptors)).not.toContain('source')
    f.get.mockClear()
    await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
    await expect(readAcceptedFormActions(f.principal, f.deps)).rejects.toThrow()
    expect(f.get).not.toHaveBeenCalled()
  })
  it('admits only one competing graph transition from the same base', async () => {
    const f = await fixture()
    const otherDeps = { runTransaction: transactionFor(await connect()) }
    const outcomes = await Promise.allSettled([
      coordinateCmsGraphTransition(f.input, f.principal, f.deps),
      coordinateCmsGraphTransition({ ...f.input, operationId: 'accept_feature_b' }, f.principal, otherDeps)
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_commits')).rows[0].count).toBe(1)
  })
  it('denies revocation during private byte loading without publishing any metadata', async () => {
    const f = await fixture()
    const original = f.get.getMockImplementation()!
    let revoked = false
    f.get.mockImplementation(async (key) => {
      if (!revoked) {
        revoked = true
        await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      }
      return await original(key)
    })
    await expect(coordinateCmsGraphTransition(f.input, f.principal, f.deps)).rejects.toThrow()
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_versions')).rows[0].count).toBe(0)
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_commits')).rows[0].count).toBe(0)
  })

  it.each(['editor', 'ai'] as const)('connects the existing %s checkpoint writer to the managed application transaction', async (mode) => {
    const f = await fixture()
    const accepted = await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    const now = Math.floor(Date.now() / 1000)
    const claims = { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId, userId: request.actor.actorId, role: 'agency' as const,
      nonce: randomUUID(), issuedAt: now - 10, expiresAt: now + 600, capabilities: ['workspace:checkpoint' as const, 'model:invoke' as const] }
    await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=10')
    await observer.query(`INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)`,
      [claims.nonce, claims.tenantId, claims.clientId, claims.siteId, claims.userId, claims.role, JSON.stringify(claims.capabilities), claims.issuedAt, claims.expiresAt, request.login.tokenHash])
    const envelope = JSON.parse(f.texts.get(f.input.nextCheckpoint.objectKey)!)
    envelope.checkpointId = `saved_${mode}`
    envelope.manifest.pages[0].title = `Saved ${mode}`
    envelope.digest = await collectionDigest(envelope.manifest)
    const cp = { ...f.input.nextCheckpoint, checkpointId: envelope.checkpointId, digest: envelope.digest,
      objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${envelope.checkpointId}.json` }
    f.texts.set(cp.objectKey, JSON.stringify(envelope))
    const result = mode === 'editor'
      ? await commitPageStudioEditorCheckpoint({ checkpoint: cp, expectedCheckpointId: accepted.checkpointId }, claims, { ...f.deps, env: request.env })
      : await acceptPageStudioAiProposal({ checkpoint: cp, expectedCheckpointId: accepted.checkpointId, baseDigest: f.input.nextCheckpoint.digest,
          authorRole: 'agency', idempotencyKey: 'managed_ai_page', summary: 'Saved AI page' }, { ...f.deps, session: claims, env: request.env })
    expect(result.isCurrent).toBe(true)
    const audit = (await observer.query('SELECT metadata FROM page_studio_audit_events WHERE action=\'workspace.checkpointed\' AND resource_id=$1', [cp.checkpointId])).rows[0]
    expect(audit.metadata.stagingOrigin).toEqual({ formatVersion: 1, environment: 'staging', source: 'studio-session',
      userId: claims.userId, role: claims.role, nonce: claims.nonce, loginSessionHash: request.login.tokenHash })
    const app = (await observer.query('SELECT manifest FROM page_studio_application_versions a JOIN page_studio_cms_scopes s ON s.current_application_id=a.id')).rows[0].manifest
    expect(app.checkpoint).toEqual({ id: cp.checkpointId, digest: cp.digest })
    expect(app.actions.map((pin: { id: string }) => pin.id)).toEqual(['submit'])
  })

  it('maps a second environment adoption to the actionable site reservation conflict', async () => {
    const f = await fixture()
    const otherScope = { ...scope, environment: 'production' as const }
    const intent = { formatVersion: 1, scope: otherScope, actor: { kind: 'agency-user', userId: request.actor.actorId, loginSessionHash: request.login.tokenHash }, adoptionId: 'second_environment', generation: randomUUID(), target: fixtureJson.base.target, expectedCheckpoint: f.input.expectedCheckpoint }
    const principal = { source: 'native-login' as const, request: { ...request, env: { ...request.env, PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production' } } }
    await expect(beginCmsAdoption(intent, principal, f.deps)).rejects.toMatchObject({ code: 'CMS_AUTHORING_SCOPE_CONFLICT', statusCode: 409 })
    expect((await observer.query('SELECT environment FROM page_studio_cms_scopes')).rows).toEqual([{ environment: 'staging' }])
  })
  it.each(['actor', 'createdAt', 'schema', 'head'] as const)('rejects corrupt prepared schema %s metadata before visibility', async (field) => {
    const f = await fixture()
    const router = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsObjects: (input: unknown) => Promise<Array<Record<string, unknown>>> }
    const original = router.readManagedCmsObjects
    router.readManagedCmsObjects = async input => (await original(input)).map(object => ({ ...object,
      ...(field === 'actor' ? { actorId: 'different_actor' } : field === 'createdAt' ? { createdAt: '2026-09-21T00:00:00.000Z' } : field === 'schema' ? { schema: object.pin } : { head: true }) }))
    await expect(coordinateCmsGraphTransition(f.input, f.principal, f.deps)).rejects.toThrow('Managed graph storage bytes unavailable or inconsistent')
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_commits')).rows[0].count).toBe(0)
    expect((await observer.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe(f.input.expectedCheckpoint.id)
  })

  it('requires both Studio checkpoint and model capabilities before reading private bytes', async () => {
    const f = await fixture()
    const now = Math.floor(Date.now() / 1000)
    const principal = { source: 'studio-session' as const, capability: 'model:invoke' as const, env: request.env,
      claims: { tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId, userId: request.actor.actorId, role: 'agency' as const,
        nonce: randomUUID(), issuedAt: now - 10, expiresAt: now + 600, capabilities: ['model:invoke' as const] } }
    await expect(coordinateCmsGraphTransition(f.input, principal, f.deps)).rejects.toMatchObject({ code: 'CMS_GRAPH_AUTHORITY_DENIED', statusCode: 403 })
    expect(f.get).not.toHaveBeenCalled()
    expect((await observer.query('SELECT count(*)::int AS count FROM page_studio_cms_commits')).rows[0].count).toBe(0)
  })

  it('connects candidate-only acceptance through private preparation and checkpoint storage to PostgreSQL', async () => {
    const f = await fixture()
    const candidate = { id: f.input.candidateId, digest: f.input.candidateDigest }
    const accepted = await acceptManagedFeatureCandidate(candidate, f.principal, f.deps)
    expect(accepted.acknowledged).toBe(true)
    const app = (await observer.query('SELECT manifest FROM page_studio_application_versions WHERE id=$1', [accepted.application.id])).rows[0].manifest
    expect(app.actions.map((pin: { id: string }) => pin.id)).toEqual(['submit'])
    expect(app.schemas.map((pin: { collectionId: string }) => pin.collectionId)).toEqual(['fleet'])
    expect(app.checkpoint.id).toBe(accepted.checkpointId)
    f.get.mockRejectedValue(new Error('R2 unavailable'))
    expect(await acceptManagedFeatureCandidate(candidate, f.principal, f.deps)).toEqual(accepted)
  })
  it.each(['current', 'revoked'] as const)('projects actual accepted component records under %s PostgreSQL authority', async (mode) => {
    const f = await fixture()
    const accepted = await coordinateCmsGraphTransition(f.input, f.principal, f.deps)
    const schemaObject = (await observer.query('SELECT * FROM page_studio_cms_objects WHERE kind=\'schema\'')).rows[0]
    const recordBody = { scope, collectionId: 'fleet', id: 'record_a', revision: 1, schemaVersion: 1, archived: false, values: { title: 'Accepted public value' } }
    const recordPin = { ...schemaObject.storage_pin, kind: 'record', recordId: 'record_a', operationId: 'record_projection', sha256: await collectionDigest(recordBody), bytes: new TextEncoder().encode(JSON.stringify(recordBody)).length }
    const recordId = randomUUID()
    const inserted = (await observer.query(`INSERT INTO page_studio_cms_objects(scope_key,generation,id,kind,collection_id,record_id,logical_version,storage_pin,schema_object_id,archived,actor_id,created_at,adoption_id) VALUES($1,$2,$3,'record','fleet','record_a',1,$4,$5,FALSE,$6,clock_timestamp(),'adoption_a') RETURNING created_at`, [schemaObject.scope_key, schemaObject.generation, recordId, recordPin, schemaObject.id, request.actor.actorId])).rows[0]
    await observer.query(`INSERT INTO page_studio_cms_record_heads(scope_key,generation,collection_id,record_id,object_id) VALUES($1,$2,'fleet','record_a',$3)`, [schemaObject.scope_key, schemaObject.generation, recordId])
    const router = request.env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsObjects: (input: { pins: Array<{ kind: string }> }) => Promise<unknown[]> }
    const original = router.readManagedCmsObjects
    router.readManagedCmsObjects = async (input) => {
      if (input.pins[0]?.kind !== 'record') return await original(input)
      if (mode === 'revoked') await observer.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      return [{ pin: recordPin, body: recordBody, actorId: request.actor.actorId, createdAt: new Date(inserted.created_at).toISOString(), schema: schemaObject.storage_pin, head: false }]
    }
    const pin = (await observer.query('SELECT manifest FROM page_studio_application_versions WHERE id=$1', [accepted.application.id])).rows[0].manifest.components.find((pin: { id: string }) => pin.id === 'fleet_view')
    const result = readAcceptedComponentCmsData({ pin }, f.principal, f.deps)
    if (mode === 'revoked') await expect(result).rejects.toThrow()
    else {
      const data = await result
      expect(Object.values(data.data)).toEqual([[{ id: 'record_a', values: { title: 'Accepted public value' } }]])
      expect(data.application).toEqual(accepted.application)
      expect(data.definitions.map(definition => definition.id)).toEqual(['fleet'])
    }
  })
})
