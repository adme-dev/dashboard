import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updatePageStudioAiUsage } from '~~/server/utils/pageStudio/aiUsage'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import type { PageStudioSessionClaims } from '~~/server/utils/pageStudio/sessions'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => { throw new Error('Use the disposable transaction') },
  queryOneFresh: () => { throw new Error('Use the transaction authority') }
}))
const databaseUrl = process.env.PAGE_STUDIO_AI_USAGE_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || !/^\/studio_ai_usage_[a-z0-9_]+$/.test(url.pathname) || url.search) {
    throw new Error('AI usage tests require an owned disposable localhost studio_ai_usage database')
  }
}
const request = { action: 'reserve' as const, operationId: 'candidate:model:1', fingerprint: 'a'.repeat(64), kind: 'model' as const }
const denied = { code: 'SESSION_AUTHORITY_DENIED', statusCode: 403 }

describe.runIf(Boolean(databaseUrl))('native AI monthly usage on disposable PostgreSQL', () => {
  let observer: pg.Client
  let connections: pg.Client[]
  let schema: string
  let claims: PageStudioSessionClaims
  let other: PageStudioSessionClaims
  async function connect() {
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    connections.push(db)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('SET statement_timeout TO \'6s\'')
    return db
  }
  function transactionFor(db: pg.Client) {
    return async <T>(work: (client: PageStudioControlQueryClient) => Promise<T>) => {
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
  async function run(body: unknown = request, session = claims, environment = 'staging') {
    return updatePageStudioAiUsage(body, session, environment, { runTransaction: transactionFor(await connect()) })
  }
  async function rows() {
    return (await observer.query('SELECT * FROM page_studio_ai_usage')).rows
  }
  beforeEach(async () => {
    connections = []
    schema = `usage_${randomUUID().replaceAll('-', '')}`
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
    for (const file of ['402_page_studio_control_plane.sql', '404_page_studio_documents.sql', '420_page_studio_login_sessions.sql', '421_page_studio_ai_usage.sql', '421_page_studio_ai_usage.sql', '423_page_studio_action_execution_usage.sql', '423_page_studio_action_execution_usage.sql']) {
      await observer.query(readFileSync(new URL(`../../../server/database/migrations/${file}`, import.meta.url), 'utf8'))
    }
    const clientId = randomUUID(), userId = randomUUID(), roleId = randomUUID()
    await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await observer.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    await observer.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\')', [roleId])
    const entitlementId = (await observer.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,monthly_ai_operation_limit)
      VALUES('usage-tenant',$1,2) RETURNING id`, [clientId])).rows[0].id
    async function session(route: string) {
      const siteId = (await observer.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
        VALUES('usage-tenant',$1,$2,'Usage test',$3,'fixture') RETURNING id`, [clientId, entitlementId, route])).rows[0].id
      const now = Math.floor(Date.now() / 1000), hash = randomUUID().replaceAll('-', '').repeat(2)
      const value: PageStudioSessionClaims = { tenantId: 'usage-tenant', clientId, siteId, userId, role: 'agency', nonce: randomUUID(),
        issuedAt: now - 10, expiresAt: now + 600, capabilities: ['model:invoke', 'workspace:checkpoint'] }
      await observer.query(`INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
        VALUES('agency',$1,$2,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 day')`, [hash, userId])
      await observer.query(`INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)`,
      [value.nonce, value.tenantId, clientId, siteId, userId, value.role, JSON.stringify(value.capabilities), value.issuedAt, value.expiresAt, hash])
      return value
    }
    claims = await session('first')
    other = await session('second')
  })
  afterEach(async () => {
    await Promise.all(connections.filter(db => db !== observer).map(db => db.end()))
    if (!observer) return
    try {
      await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await observer.end() }
  })
  it('admits once and returns only a charged replay thereafter', async () => {
    expect(await run()).toEqual({ operationId: request.operationId, fingerprint: request.fingerprint, kind: request.kind,
      scope: { tenantId: claims.tenantId, clientId: claims.clientId, businessId: claims.clientId, siteId: claims.siteId, environment: 'staging' },
      state: 'reserved', charged: true, admitted: true })
    expect(await run()).toMatchObject({ admitted: false, state: 'reserved', charged: true })
    expect(await rows()).toHaveLength(1)
  })
  it('serializes the shared monthly allowance across sites, sessions and environments', async () => {
    await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=1')
    const results = await Promise.allSettled([run(), run({ ...request, operationId: 'another:1' }, other, 'production')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 429, code: 'AI_USAGE_EXHAUSTED' } })
    expect(await rows()).toHaveLength(1)
  })
  it('admits only one caller during a concurrent replay', async () => {
    const results = await Promise.all([run(), run()])
    expect(results.filter(result => result.admitted)).toHaveLength(1)
    expect(await rows()).toHaveLength(1)
  })
  it.each(['succeeded', 'failed'] as const)('settles %s without refund and never readmits it', async (outcome) => {
    await run()
    const settlement = { ...request, action: 'settle', outcome }
    expect(await run(settlement)).toMatchObject({ admitted: false, state: outcome, charged: true })
    expect(await run(settlement)).toMatchObject({ admitted: false, state: outcome })
    expect(await run()).toMatchObject({ admitted: false, state: outcome })
    await run({ ...request, operationId: 'action:1', kind: 'action-test' })
    await expect(run({ ...request, operationId: 'third:1' })).rejects.toMatchObject({ statusCode: 429 })
    await expect(run({ ...settlement, outcome: outcome === 'failed' ? 'succeeded' : 'failed' })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('widens the historical kind constraint without changing retained reservations', async () => {
    await observer.query('ALTER TABLE page_studio_ai_usage DROP CONSTRAINT page_studio_ai_usage_kind_check; ALTER TABLE page_studio_ai_usage ADD CONSTRAINT page_studio_ai_usage_kind_check CHECK(kind IN (\'model\',\'action-test\'))')
    await run()
    const before = await rows()
    const migration = readFileSync(new URL('../../../server/database/migrations/423_page_studio_action_execution_usage.sql', import.meta.url), 'utf8')
    await observer.query(migration)
    expect(await rows()).toEqual(before)
    expect(await run({ ...request, operationId: 'run:new', kind: 'action-execution' })).toMatchObject({ admitted: true })
  })
  it('charges accepted action execution once, shares the monthly allowance, and retains failed charges', async () => {
    const execution = { ...request, operationId: 'accepted:run:1', kind: 'action-execution' }
    expect(await run(execution)).toMatchObject({ admitted: true, charged: true, kind: 'action-execution' })
    expect(await run({ ...execution, action: 'settle', outcome: 'failed' })).toMatchObject({ admitted: false, state: 'failed' })
    expect(await run(execution)).toMatchObject({ admitted: false, state: 'failed' })
    await run()
    await expect(run({ ...execution, operationId: 'accepted:run:2' }, other, 'production')).rejects.toMatchObject({ statusCode: 429 })
    expect(await rows()).toHaveLength(2)
  })
  it('serializes action execution reservations and rejects changed kinds or fingerprints', async () => {
    const execution = { ...request, kind: 'action-execution' }
    const receipts = await Promise.all([run(execution), run(execution)])
    expect(receipts.filter(receipt => receipt.admitted)).toHaveLength(1)
    await expect(run(request)).rejects.toMatchObject({ code: 'AI_USAGE_CONFLICT' })
    await expect(run({ ...execution, fingerprint: 'c'.repeat(64) })).rejects.toMatchObject({ code: 'AI_USAGE_CONFLICT' })
    expect(await run({ ...execution, action: 'settle', outcome: 'succeeded' })).toMatchObject({ state: 'succeeded', admitted: false })
    await expect(run({ ...execution, action: 'settle', outcome: 'failed' })).rejects.toMatchObject({ code: 'AI_USAGE_CONFLICT' })
    expect(await rows()).toHaveLength(1)
  })
  it('keeps uncertain accepted runs reserved when authority is revoked before settlement', async () => {
    const execution = { ...request, kind: 'action-execution' }
    await run(execution)
    await observer.query('UPDATE page_studio_sessions SET revoked_at=NOW() WHERE nonce=$1', [claims.nonce])
    await expect(run(execution)).rejects.toMatchObject(denied)
    await expect(run({ ...execution, action: 'settle', outcome: 'failed' })).rejects.toMatchObject(denied)
    expect(await rows()).toMatchObject([{ state: 'reserved', kind: 'action-execution' }])
  })
  it('retains identity across UTC month rollover and charges new work in the new month', async () => {
    await run()
    await observer.query('UPDATE page_studio_ai_usage SET period_start = (date_trunc(\'month\', clock_timestamp() AT TIME ZONE \'UTC\') - INTERVAL \'1 month\')::date')
    expect(await run()).toMatchObject({ admitted: false })
    await observer.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=1')
    expect(await run({ ...request, operationId: 'new-month:1' })).toMatchObject({ admitted: true })
    await expect(run({ ...request, operationId: 'new-month:2' })).rejects.toMatchObject({ statusCode: 429 })
  })
  it('rejects conflicting fingerprints, kinds and sites without charging', async () => {
    await run()
    for (const body of [{ ...request, fingerprint: 'b'.repeat(64) }, { ...request, kind: 'action-test' }]) {
      await expect(run(body)).rejects.toMatchObject({ code: 'AI_USAGE_CONFLICT', statusCode: 409 })
    }
    await expect(run(request, other)).rejects.toMatchObject({ code: 'AI_USAGE_CONFLICT', statusCode: 409 })
    expect(await rows()).toHaveLength(1)
  })
  it('rechecks revocation before replay and settlement and keeps unknown outcomes charged', async () => {
    await run()
    await observer.query('UPDATE page_studio_sessions SET revoked_at=NOW() WHERE nonce=$1', [claims.nonce])
    await expect(run()).rejects.toMatchObject(denied)
    await expect(run({ ...request, action: 'settle', outcome: 'failed' })).rejects.toMatchObject(denied)
    expect(await rows()).toMatchObject([{ state: 'reserved' }])
  })
  it('rejects a new operation after revocation commits while it waits for budget admission', async () => {
    const blocker = await connect(), writer = await connect()
    await blocker.query('BEGIN')
    await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['page-studio-ai-usage', claims.tenantId, claims.clientId])])
    const pending = updatePageStudioAiUsage(request, claims, 'staging', { runTransaction: transactionFor(writer) })
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
  it('binds replay to the original native actor and role', async () => {
    await run()
    const newUser = randomUUID()
    await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [newUser])
    await observer.query('UPDATE page_studio_login_sessions SET user_id=$1 WHERE token_hash=(SELECT login_session_hash FROM page_studio_sessions WHERE nonce=$2)', [newUser, claims.nonce])
    await observer.query('UPDATE page_studio_sessions SET user_id=$1 WHERE nonce=$2', [newUser, claims.nonce])
    await expect(run(request, { ...claims, userId: newUser })).rejects.toMatchObject({ code: 'AI_USAGE_CONFLICT', statusCode: 409 })
    await observer.query('UPDATE page_studio_ai_usage SET actor_id=$1,actor_role=\'client\'', [newUser])
    await expect(run(request, { ...claims, userId: newUser })).rejects.toMatchObject({ code: 'AI_USAGE_CONFLICT', statusCode: 409 })
    expect(await rows()).toHaveLength(1)
  })
  it('rejects malformed contracts and missing settlement without creating usage', async () => {
    for (const body of [{ ...request, amount: 0 }, { ...request, limit: 999 }, { ...request, scope: {} }, { ...request, operationId: '../x' }, { ...request, fingerprint: 'no' }]) {
      await expect(run(body)).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(run({ ...request, action: 'settle', outcome: 'failed' })).rejects.toMatchObject({ statusCode: 409 })
    expect(await rows()).toHaveLength(0)
  })
  it('fails closed before SQL when the native environment is not configured for usage', async () => {
    await expect(run(request, claims, 'preview')).rejects.toMatchObject({ code: 'AI_USAGE_UNAVAILABLE', statusCode: 503 })
    expect(await rows()).toHaveLength(0)
  })
})
