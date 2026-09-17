import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { createJwt } from '~~/server/utils/auth'
import { writeFileSync } from 'node:fs'
import fixture from '../../fixtures/pageStudio/history-manifest.json'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readPageStudioHistory, mutatePageStudioHistory } from '~~/server/utils/pageStudio/draftHistory'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'

const url = process.env.PAGE_STUDIO_GRANT_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/(studio_history_authority|studio_builder_rnd)(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) {
    throw new Error('Draft history tests require an explicitly disposable localhost history or builder database')
  }
}
const scope = { tenantId: 'history_test', clientId: randomUUID(), siteId: randomUUID() }
const actor = { role: 'agency' as const, actorId: randomUUID(), tenantId: scope.tenantId, canEdit: true }
const portal = { role: 'client' as const, actorId: randomUUID(), clientId: scope.clientId }
const schema = `history_${randomUUID().replaceAll('-', '')}`
const manifest = { ...fixture, id: scope.siteId }
const canonical = (v: unknown): string => v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)
const digest = createHash('sha256').update(canonical(manifest)).digest('hex')
const key = (id: string) => `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${id}.json`
describe.runIf(Boolean(url))('draft history on disposable PostgreSQL', () => {
  let db: pg.Client, concurrent: pg.Client
  let agencyToken: string, portalToken: string
  const staffRoleId = randomUUID()
  const blobs = new Map<string, string>()
  let failWrite = false
  let beforeWrite: (() => Promise<void>) | undefined
  const bucket = {
    get: async (k: string) => blobs.has(k) ? { body: new Response(blobs.get(k)).body! } : null,
    put: async (k: string, body: string) => {
      await beforeWrite?.()
      if (failWrite)
        throw new Error('storage unavailable')
      expect(blobs.has(k)).toBe(false)
      blobs.set(k, body)
      return { etag: createHash('sha256').update(body).digest('hex') }
    }
  }
  const runTransaction = async <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => {
    await db.query('BEGIN')
    try {
      const value = await work(db)
      await db.query('COMMIT')
      return value
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  }
  const request = (nativeActor = actor as typeof actor | typeof portal) => {
    const req = new IncomingMessage(new Socket())
    req.method = 'POST'
    req.url = '/test/history'
    req.headers = { authorization: `Bearer ${nativeActor.role === 'agency' ? agencyToken : portalToken}` }
    return { actor: nativeActor, event: createEvent(req, new ServerResponse(req)), siteId: scope.siteId, bucket }
  }
  const restore = () => ({ action: 'restore' as const, checkpointId: 'old', expectedCheckpointId: 'current', requestId: randomUUID() })
  beforeAll(async () => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(url!).hostname)
    db = new pg.Client({ connectionString: url })
    concurrent = new pg.Client({ connectionString: url })
    await db.connect()
    await concurrent.connect()
    await db.query(`CREATE SCHEMA ${schema}`)
    await db.query(`SET search_path TO ${schema}`)
    await concurrent.query(`SET search_path TO ${schema}`)
    await db.query(`
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT);
      CREATE TABLE page_studio_login_sessions(role TEXT,token_hash TEXT,user_id TEXT,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ,PRIMARY KEY(role,token_hash));
      CREATE TABLE agency_clients (id uuid PRIMARY KEY, is_active boolean);
      CREATE TABLE page_studio_entitlements (id uuid PRIMARY KEY, tenant_id text, client_id uuid, status text, effective_from timestamptz, effective_until timestamptz, pages_per_site_limit int);
      CREATE TABLE page_studio_sites (id uuid PRIMARY KEY, tenant_id text, client_id uuid, entitlement_id uuid, name text, status text, current_checkpoint_id text, current_version_id uuid, updated_at timestamptz);
      CREATE TABLE page_studio_site_memberships (tenant_id text, client_id uuid, site_id uuid, user_id uuid, role text);
      CREATE TABLE page_studio_checkpoints (id text PRIMARY KEY, tenant_id text, client_id uuid, site_id uuid, digest text, object_key text UNIQUE, etag text, author_id text, created_at timestamptz);
      CREATE TABLE page_studio_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text, client_id uuid, site_id uuid, checkpoint_id text, digest text, author_id text, author_role text, summary text, status text DEFAULT 'draft', idempotency_key text, created_at timestamptz DEFAULT now(), UNIQUE(tenant_id, client_id, site_id, idempotency_key));
      CREATE TABLE page_studio_audit_events (id uuid DEFAULT gen_random_uuid(), tenant_id text, client_id uuid, site_id uuid, actor_id text, actor_role text, action text, resource_type text, resource_id text, idempotency_key text, metadata jsonb, UNIQUE(tenant_id, client_id, site_id, idempotency_key));
      CREATE TABLE page_studio_release_pointers (active_release_id text);
    `)
  })
  beforeEach(async () => {
    agencyToken = await createJwt({ userId: actor.actorId, role: 'owner' })
    portalToken = randomUUID()
    failWrite = false
    beforeWrite = undefined
    blobs.clear()
    await db.query('TRUNCATE team_members, client_users, client_sessions, custom_roles, role_permission_groups, page_studio_login_sessions, agency_clients, page_studio_entitlements, page_studio_sites, page_studio_site_memberships, page_studio_checkpoints, page_studio_versions, page_studio_audit_events, page_studio_release_pointers')
    await db.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [actor.actorId])
    await db.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'manager\')', [portal.actorId, scope.clientId])
    await db.query('INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL \'1 day\')', [createHash('sha256').update(portalToken).digest('hex'), portal.actorId])
    await db.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [staffRoleId])
    await db.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\')', [staffRoleId])
    await db.query('INSERT INTO agency_clients VALUES ($1,true)', [scope.clientId])
    await db.query('INSERT INTO page_studio_entitlements VALUES ($1,$2,$3,\'active\',now()-interval \'1 day\',null,75)', [scope.siteId, scope.tenantId, scope.clientId])
    await db.query('INSERT INTO page_studio_sites VALUES ($1,$2,$3,$1,\'Test website\',\'draft\',\'current\',$4,now())', [scope.siteId, scope.tenantId, scope.clientId, randomUUID()])
    await db.query('INSERT INTO page_studio_site_memberships VALUES ($1,$2,$3,$4,\'editor\')', [...Object.values(scope), portal.actorId])
    await db.query('INSERT INTO page_studio_release_pointers VALUES (\'live-release\')')
    for (const [id, time] of [['old', '2026-09-01T00:00:00.000Z'], ['current', '2026-09-02T00:00:00.000Z']]) {
      blobs.set(key(id), JSON.stringify({ schemaVersion: 1, checkpointId: id, createdAt: time, userId: actor.actorId, scope, manifest, digest }))
      await db.query('INSERT INTO page_studio_checkpoints VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, ...Object.values(scope), digest, key(id), 'etag', actor.actorId, time])
    }
  })
  afterAll(async () => {
    await concurrent?.end()
    if (db) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`)
      await db.end()
    }
  })
  it('lists bounded metadata with a stable cursor and no private object locations', async () => {
    const first = await readPageStudioHistory({ ...request(), query: { kind: 'drafts', limit: 1 } }, { runTransaction })
    expect(first.items.map(x => x.id)).toEqual(['current'])
    expect(first.currentCheckpointId).toBe('current')
    expect(JSON.stringify(first)).not.toContain('tenants/')
    const next = await readPageStudioHistory({ ...request(), query: { kind: 'drafts', limit: 1, cursor: first.nextCursor } }, { runTransaction })
    expect(next.items.map(x => x.id)).toEqual(['old'])
    expect(next.nextCursor).toBeNull()
  })
  it('restores a new draft and retains both original checkpoints and the live release', async () => {
    const result = await mutatePageStudioHistory({ ...request(), body: restore() }, { runTransaction })
    expect(result.checkpointId).not.toBe('old')
    const head = (await db.query('SELECT current_checkpoint_id, current_version_id FROM page_studio_sites')).rows[0]
    expect(head).toEqual({ current_checkpoint_id: result.checkpointId, current_version_id: null })
    expect((await db.query('SELECT id FROM page_studio_checkpoints')).rowCount).toBe(3)
    expect((await db.query('SELECT * FROM page_studio_release_pointers')).rows).toEqual([{ active_release_id: 'live-release' }])
    expect(JSON.parse(blobs.get(key(result.checkpointId))!).manifest).toEqual(manifest)
    if (process.env.PAGE_STUDIO_HISTORY_PROOF_PATH) writeFileSync(process.env.PAGE_STUDIO_HISTORY_PROOF_PATH, blobs.get(key(result.checkpointId))!)
    expect((await db.query('SELECT metadata FROM page_studio_audit_events WHERE action=\'workspace.checkpointed\'')).rows[0].metadata.commitProtocol).toBe('cas-v1')
  })
  it('replays a lost restore acknowledgement without rewinding a newer draft', async () => {
    const body = restore()
    const first = await mutatePageStudioHistory({ ...request(), body }, { runTransaction })
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=\'newer\'')
    const retry = await mutatePageStudioHistory({ ...request(), body }, { runTransaction })
    expect(retry.checkpointId).toBe(first.checkpointId)
    expect(retry.isCurrent).toBe(false)
    expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe('newer')
    expect(blobs.size).toBe(3)
    await expect(mutatePageStudioHistory({ ...request(), body: { ...body, checkpointId: 'current' } }, { runTransaction })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('saves a named version from the expected draft and retries after another edit', async () => {
    const body = { action: 'name', name: 'Before hero changes', expectedCheckpointId: 'current', requestId: randomUUID() }
    const result = await mutatePageStudioHistory({ ...request(portal), actor: portal, body }, { runTransaction })
    expect((await db.query('SELECT summary, status FROM page_studio_versions')).rows).toEqual([{ summary: body.name, status: 'draft' }])
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=\'newer\'')
    expect(await mutatePageStudioHistory({ ...request(portal), actor: portal, body }, { runTransaction })).toMatchObject({ versionId: result.versionId, isCurrent: false })
    expect((await db.query('SELECT * FROM page_studio_versions')).rowCount).toBe(1)
  })
  it.each(['restore', 'name'])('rejects a stale %s before writing', async (action) => {
    const body = action === 'restore' ? restore() : { action, name: 'Snapshot', expectedCheckpointId: 'current', requestId: randomUUID() }
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=\'newer\'')
    await expect(mutatePageStudioHistory({ ...request(), body }, { runTransaction })).rejects.toMatchObject({ statusCode: 409 })
    expect(blobs.size).toBe(2)
    expect((await db.query('SELECT * FROM page_studio_audit_events')).rowCount).toBe(0)
  })
  it('allows viewers to read but prevents writes and cross-client reads', async () => {
    await db.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')
    expect(await readPageStudioHistory({ ...request(portal), actor: portal, query: {} }, { runTransaction })).toMatchObject({ canEdit: false })
    await expect(mutatePageStudioHistory({ ...request(portal), actor: portal, body: restore() }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    await expect(readPageStudioHistory({ ...request(), actor: { ...portal, clientId: randomUUID() }, query: {} }, { runTransaction })).rejects.toMatchObject({ statusCode: 404 })
  })
  it('rejects corrupt historical bytes and storage failure without changing the head', async () => {
    blobs.set(key('old'), blobs.get(key('old'))!.replace('Northline Atlas X campaign', 'Tampered'))
    await expect(mutatePageStudioHistory({ ...request(), body: restore() }, { runTransaction })).rejects.toMatchObject({ statusCode: 422 })
    blobs.set(key('old'), blobs.get(key('old'))!.replace('Tampered', 'Northline Atlas X campaign'))
    failWrite = true
    await expect(mutatePageStudioHistory({ ...request(), body: restore() }, { runTransaction })).rejects.toMatchObject({ statusCode: 503 })
    expect((await db.query('SELECT current_checkpoint_id FROM page_studio_sites')).rows[0].current_checkpoint_id).toBe('current')
  })
  it('paginates named versions and rejects an invalid UUID cursor', async () => {
    for (const name of ['First', 'Second']) {
      await mutatePageStudioHistory({ ...request(), body: { action: 'name', name, expectedCheckpointId: 'current', requestId: randomUUID() } }, { runTransaction })
    }
    const first = await readPageStudioHistory({ ...request(), query: { kind: 'versions', limit: 1 } }, { runTransaction })
    const next = await readPageStudioHistory({ ...request(), query: { kind: 'versions', limit: 1, cursor: first.nextCursor } }, { runTransaction })
    expect(first.items[0]?.name).toBe('Second')
    expect(next.items[0]?.name).toBe('First')
    const cursor = Buffer.from(JSON.stringify({ kind: 'versions', id: 'invalid', createdAt: '2026-09-01T00:00:00Z' })).toString('base64url')
    await expect(readPageStudioHistory({ ...request(), query: { kind: 'versions', cursor } }, { runTransaction })).rejects.toMatchObject({ statusCode: 400 })
  })
  it('reports a superseded named version accurately even without a new checkpoint', async () => {
    const body = { action: 'name', name: 'First', expectedCheckpointId: 'current', requestId: randomUUID() }
    await mutatePageStudioHistory({ ...request(), body }, { runTransaction })
    await mutatePageStudioHistory({ ...request(), body: { ...body, name: 'Second', requestId: randomUUID() } }, { runTransaction })
    expect(await mutatePageStudioHistory({ ...request(), body }, { runTransaction })).toMatchObject({ isCurrent: false })
  })
  it.each(['suspended', 'expired', 'archived', 'inactive', 'revoked'])('blocks mutations after %s access changes', async (reason) => {
    if (reason === 'suspended') await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
    if (reason === 'expired') await db.query('UPDATE page_studio_entitlements SET effective_until=now()-interval \'1 hour\'')
    if (reason === 'archived') await db.query('UPDATE page_studio_sites SET status=\'archived\'')
    if (reason === 'inactive') await db.query('UPDATE agency_clients SET is_active=false')
    if (reason === 'revoked') await db.query('DELETE FROM page_studio_site_memberships')
    await expect(mutatePageStudioHistory({ ...request(portal), actor: portal, body: restore() }, { runTransaction })).rejects.toMatchObject({ statusCode: reason === 'inactive' ? 404 : 403 })
    expect(blobs.size).toBe(2)
  })
  it('rejects checkpoint metadata from another site before reading its bytes', async () => {
    await db.query('UPDATE page_studio_checkpoints SET site_id=$1 WHERE id=$2', [randomUUID(), 'old'])
    await expect(mutatePageStudioHistory({ ...request(), body: restore() }, { runTransaction })).rejects.toMatchObject({ statusCode: 404 })
    expect(blobs.size).toBe(2)
  })
  it('holds the site and membership locks through the restored checkpoint commit', async () => {
    beforeWrite = async () => {
      await concurrent.query('SET lock_timeout=\'100ms\'')
      await expect(concurrent.query('UPDATE page_studio_sites SET current_checkpoint_id=\'racing\'')).rejects.toMatchObject({ code: '55P03' })
      await expect(concurrent.query('UPDATE page_studio_site_memberships SET role=\'viewer\'')).rejects.toMatchObject({ code: '55P03' })
    }
    await mutatePageStudioHistory({ ...request(portal), actor: portal, body: restore() }, { runTransaction })
  })
})
