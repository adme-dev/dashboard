import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updatePageStudioFeatureRequest } from '~~/server/utils/pageStudio/featureRequestRecovery'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import type { PageStudioSessionClaims } from '~~/server/utils/pageStudio/sessions'

// All production SQL and authority checks run unchanged against a disposable
// localhost database. No application .env, remote database, or provider is used.
vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => { throw new Error('Inject the disposable transaction') },
  queryOneFresh: () => { throw new Error('Use the transaction authority') }
}))
const databaseUrl = process.env.PAGE_STUDIO_RECOVERY_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55461'
    || url.pathname !== '/studio_cms_receipt' || url.search) {
    throw new Error('Recovery tests require the owned localhost:55461/studio_cms_receipt database')
  }
}
const receipt = { id: 'feature-request-first', checkpointId: 'checkpoint-first', digest: 'a'.repeat(64) }
const claim = { operation: 'claim', receipt }
const denied = { code: 'SESSION_AUTHORITY_DENIED', statusCode: 403 }
const conflict = { statusCode: 409 }

describe.runIf(Boolean(databaseUrl))('durable feature request recovery on disposable PostgreSQL', () => {
  let observer: pg.Client
  let connections: pg.Client[]
  let schema: string
  let claims: PageStudioSessionClaims

  async function connect() {
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connections.push(db)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('SET statement_timeout TO \'6s\'')
    return db
  }
  function transactionFor(db: pg.Client, revokeAfterMutation = false) {
    return async <T>(work: (client: PageStudioControlQueryClient) => Promise<T>) => {
      await db.query('BEGIN')
      let revoked = false
      const client = {
        async query(sql: string, params?: unknown[]) {
          const result = await db.query(sql, params)
          if (revokeAfterMutation && !revoked && /(?:INSERT\s+INTO|UPDATE)\s+page_studio_feature_requests/i.test(sql)) {
            revoked = true
            await db.query('UPDATE page_studio_sessions SET revoked_at=clock_timestamp() WHERE nonce=$1', [claims.nonce])
          }
          return result
        }
      } as PageStudioControlQueryClient
      try {
        const result = await work(client)
        await db.query('COMMIT')
        return result
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      }
    }
  }
  async function run(input: unknown = claim, session = claims, environment = 'staging') {
    return updatePageStudioFeatureRequest(input, session, environment, { runTransaction: transactionFor(await connect()) })
  }
  async function rows() {
    return (await observer.query('SELECT * FROM page_studio_feature_requests ORDER BY request_id')).rows
  }
  async function saveSession(value: PageStudioSessionClaims) {
    const hash = randomUUID().replaceAll('-', '').repeat(2)
    await observer.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES($1,$2,$3,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 day')`, [value.role, hash, value.userId])
    if (value.role === 'client') {
      await observer.query(`INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL '1 day')`, [hash, value.userId])
    }
    await observer.query(`INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)`,
    [value.nonce, value.tenantId, value.clientId, value.siteId, value.userId, value.role,
      JSON.stringify(value.capabilities), value.issuedAt, value.expiresAt, hash])
    return value
  }
  async function checkpoint(id: string, digest = 'b'.repeat(64), session = claims) {
    await observer.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
      VALUES($1,$2,$3,$4,$5,$1,'fixture-etag',NOW())`, [id, session.tenantId, session.clientId, session.siteId, digest])
    await observer.query('UPDATE page_studio_sites SET current_checkpoint_id=$1 WHERE id=$2', [id, session.siteId])
  }
  async function createSite(tenantId: string, clientId: string) {
    await observer.query('INSERT INTO agency_clients VALUES($1,TRUE) ON CONFLICT DO NOTHING', [clientId])
    const existing = await observer.query('SELECT id FROM page_studio_entitlements WHERE tenant_id=$1 AND client_id=$2', [tenantId, clientId])
    const entitlementId = existing.rows[0]?.id ?? (await observer.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id)
      VALUES($1,$2) RETURNING id`, [tenantId, clientId])).rows[0].id
    return (await observer.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES($1,$2,$3,'Recovery fixture',$4,'fixture') RETURNING id`, [tenantId, clientId, entitlementId, randomUUID()])).rows[0].id as string
  }

  beforeEach(async () => {
    connections = []
    schema = `feature_recovery_${randomUUID().replaceAll('-', '')}`
    observer = await connect()
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query(`
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,
        role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
    `)
    for (const file of ['402_page_studio_control_plane.sql', '420_page_studio_login_sessions.sql',
      '437_page_studio_feature_request_recovery.sql', '437_page_studio_feature_request_recovery.sql']) {
      await observer.query(readFileSync(new URL(`../../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
    }
    const clientId = randomUUID(), userId = randomUUID(), roleId = randomUUID()
    await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    await observer.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    await observer.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\')', [roleId])
    const siteId = await createSite('recovery-tenant', clientId)
    const now = Math.floor(Date.now() / 1000)
    claims = await saveSession({ tenantId: 'recovery-tenant', clientId, siteId, userId, role: 'agency',
      nonce: randomUUID(), issuedAt: now - 10, expiresAt: now + 600,
      capabilities: ['workspace:preview', 'workspace:checkpoint', 'model:invoke'] })
    await checkpoint(receipt.checkpointId, receipt.digest)
  })
  afterEach(async () => {
    await Promise.all(connections.filter(db => db !== observer).map(db => db.end()))
    if (!observer) return
    try {
      await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await observer.end()
    }
  })

  it('claims once and stores only scoped recovery metadata', async () => {
    expect(await run({ operation: 'read' })).toEqual({ pending: null, claimed: false })
    expect(await run()).toEqual({ pending: receipt, claimed: true })
    expect(await run()).toEqual({ pending: receipt, claimed: false })
    expect(await run({ operation: 'read' })).toEqual({ pending: receipt, claimed: false })
    const retained = await rows()
    expect(retained).toHaveLength(1)
    expect(retained[0]).toMatchObject({ tenant_id: claims.tenantId, client_id: claims.clientId, site_id: claims.siteId,
      environment: 'staging', actor_role: claims.role, actor_id: claims.userId,
      request_id: receipt.id, checkpoint_id: receipt.checkpointId, checkpoint_digest: receipt.digest, state: 'pending' })
    expect(Object.keys(retained[0]).sort()).toEqual(['tenant_id', 'client_id', 'site_id', 'environment', 'actor_role', 'actor_id',
      'request_id', 'checkpoint_id', 'checkpoint_digest', 'state', 'created_at', 'updated_at'].sort())
  })

  it('allows one dispatch claim across concurrent connections replaying the same request', async () => {
    const results = await Promise.all([run(), run()])
    expect(results.filter(result => result.claimed)).toHaveLength(1)
    expect(results.map(result => result.pending)).toEqual([receipt, receipt])
    expect(await rows()).toHaveLength(1)
  })

  it('allows only one pending request when concurrent callers choose different IDs', async () => {
    const results = await Promise.allSettled([run(), run({ operation: 'claim', receipt: { ...receipt, id: 'feature-request-second' } })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: conflict })
    expect(await rows()).toHaveLength(1)
  })

  it('recovers across new DB connections, refreshed editor sessions and a fresh native login', async () => {
    await run()
    await observer.query('UPDATE page_studio_sessions SET revoked_at=NOW() WHERE nonce=$1', [claims.nonce])
    await observer.query('UPDATE page_studio_login_sessions SET revoked_at=NOW()')
    const refreshed = await saveSession({ ...claims, nonce: randomUUID() })
    expect(await run({ operation: 'read' }, refreshed)).toEqual({ pending: receipt, claimed: false })
    expect(await run(claim, refreshed)).toEqual({ pending: receipt, claimed: false })
    expect(await rows()).toHaveLength(1)
  })

  it('preserves the original checkpoint after draft edits so recovery cannot silently become a new request', async () => {
    await run()
    await checkpoint('checkpoint-newer')
    expect(await run({ operation: 'read' })).toEqual({ pending: receipt, claimed: false })
    await expect(run({ operation: 'claim', receipt: { ...receipt, checkpointId: 'checkpoint-newer', digest: 'b'.repeat(64) } })).rejects.toMatchObject(conflict)
    expect((await rows())[0].checkpoint_id).toBe(receipt.checkpointId)
  })

  it.each([
    { ...receipt, checkpointId: 'unknown-checkpoint' },
    { ...receipt, digest: 'f'.repeat(64) }
  ])('rejects a checkpoint mismatch without retaining a request: %j', async (invalid) => {
    await expect(run({ operation: 'claim', receipt: invalid })).rejects.toMatchObject(conflict)
    expect(await rows()).toHaveLength(0)
  })

  it('rejects a valid but superseded saved checkpoint', async () => {
    await checkpoint('checkpoint-newer')
    await expect(run()).rejects.toMatchObject(conflict)
    expect(await rows()).toHaveLength(0)
  })

  it('dismisses exactly the current request and retains the tombstone against ID reuse', async () => {
    await run()
    expect(await run({ operation: 'dismiss', id: receipt.id })).toEqual({ pending: null, claimed: false })
    expect(await run({ operation: 'dismiss', id: receipt.id })).toEqual({ pending: null, claimed: false })
    await expect(run()).rejects.toMatchObject(conflict)
    expect((await rows())[0].state).toBe('dismissed')
  })

  it('clears an absent hint but an old completion cannot clear a newer pending request', async () => {
    expect(await run({ operation: 'dismiss', id: 'unknown-request' })).toEqual({ pending: null, claimed: false })
    await run()
    await run({ operation: 'dismiss', id: receipt.id })
    const newer = { ...receipt, id: 'feature-request-newer' }
    await run({ operation: 'claim', receipt: newer })
    await expect(run({ operation: 'dismiss', id: receipt.id })).rejects.toMatchObject(conflict)
    expect(await run({ operation: 'read' })).toEqual({ pending: newer, claimed: false })
  })

  it('serializes a dismiss replay racing a new claim without clearing the new request', async () => {
    await run()
    await run({ operation: 'dismiss', id: receipt.id })
    const newer = { ...receipt, id: 'feature-request-newer' }
    const results = await Promise.allSettled([run({ operation: 'dismiss', id: receipt.id }), run({ operation: 'claim', receipt: newer })])
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { pending: newer, claimed: true } })
    if (results[0].status === 'rejected') expect(results[0].reason).toMatchObject(conflict)
    expect(await run({ operation: 'read' })).toEqual({ pending: newer, claimed: false })
  })

  it.each(['actor', 'role', 'site', 'tenant', 'client', 'environment'] as const)('isolates recovery by %s', async (dimension) => {
    await run()
    let foreign = { ...claims, nonce: randomUUID() }
    let environment = 'staging'
    if (dimension === 'actor') {
      foreign.userId = randomUUID()
      await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [foreign.userId])
    } else if (dimension === 'role') {
      foreign.role = 'client'
      await observer.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'viewer\')', [foreign.userId, foreign.clientId])
      await observer.query(`INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role)
        VALUES($1,$2,$3,$4,'editor')`, [foreign.tenantId, foreign.clientId, foreign.siteId, foreign.userId])
    } else if (dimension === 'environment') environment = 'production'
    else {
      if (dimension === 'tenant') foreign.tenantId = 'foreign-tenant'
      if (dimension === 'client') foreign.clientId = randomUUID()
      foreign.siteId = await createSite(foreign.tenantId, foreign.clientId)
    }
    foreign = await saveSession(foreign)
    expect(await run({ operation: 'read' }, foreign, environment)).toEqual({ pending: null, claimed: false })
    expect(await run({ operation: 'dismiss', id: receipt.id }, foreign, environment)).toEqual({ pending: null, claimed: false })
    expect(await run({ operation: 'read' })).toEqual({ pending: receipt, claimed: false })
  })

  it.each([
    'UPDATE page_studio_sessions SET revoked_at=NOW()',
    'UPDATE page_studio_sessions SET expires_at=NOW()-INTERVAL \'1 second\'',
    'UPDATE page_studio_login_sessions SET revoked_at=NOW()',
    'UPDATE page_studio_login_sessions SET expires_at=NOW()-INTERVAL \'1 second\'',
    'UPDATE team_members SET is_active=FALSE',
    'DELETE FROM role_permission_groups',
    'UPDATE page_studio_entitlements SET status=\'suspended\'',
    'UPDATE page_studio_sites SET status=\'archived\''
  ])('denies read, claim and dismissal after current authority changes: %s', async (mutation) => {
    await run()
    const before = await rows()
    await observer.query(mutation)
    for (const input of [{ operation: 'read' }, claim, { operation: 'dismiss', id: receipt.id }]) {
      await expect(run(input)).rejects.toMatchObject(denied)
    }
    expect(await rows()).toEqual(before)
  })

  it.each(['model:invoke', 'workspace:checkpoint'])('requires %s capability for a new claim', async (missing) => {
    claims.capabilities = claims.capabilities.filter(capability => capability !== missing)
    claims.nonce = randomUUID()
    await saveSession(claims)
    await expect(run()).rejects.toMatchObject(denied)
    expect(await rows()).toHaveLength(0)
  })

  it('denies client recovery after native portal logout', async () => {
    await observer.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'viewer\')', [claims.userId, claims.clientId])
    await observer.query(`INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role)
      VALUES($1,$2,$3,$4,'editor')`, [claims.tenantId, claims.clientId, claims.siteId, claims.userId])
    claims = await saveSession({ ...claims, role: 'client', nonce: randomUUID() })
    await run()
    await observer.query('DELETE FROM client_sessions')
    for (const input of [{ operation: 'read' }, claim, { operation: 'dismiss', id: receipt.id }]) {
      await expect(run(input)).rejects.toMatchObject(denied)
    }
    expect((await rows())[0].state).toBe('pending')
  })

  it('rechecks authority after waiting for the site lock', async () => {
    const blocker = await connect(), writer = await connect()
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM page_studio_sites WHERE id=$1 FOR NO KEY UPDATE', [claims.siteId])
    const pending = updatePageStudioFeatureRequest(claim, claims, 'staging', { runTransaction: transactionFor(writer) })
      .then(value => ({ value }), error => ({ error }))
    try {
      const writerPid = (writer as unknown as { processID: number }).processID
      const blockerPid = (blocker as unknown as { processID: number }).processID
      await expect.poll(async () => (await observer.query('SELECT $2=ANY(pg_blocking_pids($1)) AS blocked', [writerPid, blockerPid])).rows[0].blocked).toBe(true)
      await observer.query('UPDATE page_studio_sessions SET revoked_at=NOW() WHERE nonce=$1', [claims.nonce])
      await blocker.query('COMMIT')
      expect(await pending).toMatchObject({ error: denied })
      expect(await rows()).toHaveLength(0)
    } finally {
      await blocker.query('ROLLBACK')
      await pending
    }
  })

  it.each(['claim', 'dismiss'] as const)('rolls back the entire %s if final authority is denied', async (operation) => {
    if (operation === 'dismiss') await run()
    const before = await rows()
    const body = operation === 'claim' ? claim : { operation, id: receipt.id }
    await expect(updatePageStudioFeatureRequest(body, claims, 'staging', {
      runTransaction: transactionFor(await connect(), true)
    })).rejects.toMatchObject(denied)
    expect(await rows()).toEqual(before)
    expect((await observer.query('SELECT revoked_at FROM page_studio_sessions WHERE nonce=$1', [claims.nonce])).rows[0].revoked_at).toBeNull()
  })

  it.each([
    { operation: 'read', prompt: 'must-not-persist' },
    { operation: 'claim', receipt: { ...receipt, token: 'must-not-persist' } },
    { operation: 'claim', receipt: { ...receipt, digest: 'invalid' } },
    { operation: 'claim', receipt: { ...receipt, id: '../escape' } },
    { operation: 'dismiss', id: receipt.id, scope: { tenantId: 'foreign' } }
  ])('rejects malformed or content-bearing inputs: %j', async (body) => {
    await expect(run(body)).rejects.toMatchObject({ statusCode: 400 })
    expect(await rows()).toHaveLength(0)
  })

  it('reapplies the migration without changing pending or dismissed recovery evidence', async () => {
    await run()
    await run({ operation: 'dismiss', id: receipt.id })
    await run({ operation: 'claim', receipt: { ...receipt, id: 'feature-request-newer' } })
    const before = await rows()
    await observer.query(readFileSync(new URL('../../../server/database/migrations/437_page_studio_feature_request_recovery.sql', import.meta.url), 'utf8'))
    expect(await rows()).toEqual(before)
  })
})
