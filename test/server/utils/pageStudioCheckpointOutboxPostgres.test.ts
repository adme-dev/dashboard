import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claimCheckpointStaging, settleCheckpointStaging } from '~~/server/utils/pageStudio/checkpointStagingOutbox'

const url = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(target.pathname) || target.search) throw new Error('Disposable localhost studio_cms database required')
}
const migration = new URL('../../../server/database/migrations/429_page_studio_checkpoint_staging_outbox.sql', import.meta.url)
describe.runIf(Boolean(url))('checkpoint staging outbox on PostgreSQL', () => {
  let db: pg.Client, schema: string, clientId: string, siteId: string, checkpoint: string
  const actor = '30000000-0000-4000-8000-000000000901'
  const origin = { formatVersion: 1, environment: 'staging', source: 'native-login', userId: actor, role: 'agency', loginSessionHash: 'a'.repeat(64) }
  beforeEach(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
    schema = `checkpoint_outbox_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog`)
    await db.query('CREATE TABLE team_members(id UUID PRIMARY KEY); CREATE TABLE agency_clients(id UUID PRIMARY KEY); CREATE TABLE client_users(id UUID PRIMARY KEY); CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT); CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group))')
    await db.query(readFileSync(new URL('../../../server/database/migrations/402_page_studio_control_plane.sql', import.meta.url), 'utf8'))
    if (existsSync(migration)) await db.query(readFileSync(migration, 'utf8'))
    clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1)', [clientId])
    const entitlement = (await db.query('INSERT INTO page_studio_entitlements(tenant_id,client_id) VALUES(\'outbox-test\',$1) RETURNING id', [clientId])).rows[0]
    siteId = (await db.query('INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version) VALUES(\'outbox-test\',$1,$2,\'Outbox\',\'outbox\',\'limousine-v1\') RETURNING id', [clientId, entitlement.id])).rows[0].id
    checkpoint = `checkpoint_${randomUUID().replaceAll('-', '')}`
    await db.query('INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,author_id,created_at) VALUES($1,\'outbox-test\',$2,$3,$4,$1,\'etag\',$5,NOW())', [checkpoint, clientId, siteId, 'c'.repeat(64), actor])
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })
  async function audit(metadata: unknown = { digest: 'c'.repeat(64), commitProtocol: 'cas-v1', stagingOrigin: origin }, action = 'workspace.checkpointed') {
    const id = randomUUID()
    await db.query('INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1::uuid,\'outbox-test\',$2,$3,$4,\'agency\',$5,\'checkpoint\',$6,$1::text,$7)', [id, clientId, siteId, actor, action, checkpoint, metadata])
    return id
  }
  const rows = async () => (await db.query('SELECT * FROM page_studio_checkpoint_staging_outbox')).rows
  it.each(['native-login', 'studio-session', 'provisioning'])('atomically retains %s identity without copying login credentials', async (source) => {
    const id = await audit({ digest: 'c'.repeat(64), commitProtocol: 'cas-v1', stagingOrigin: { ...origin, source } })
    expect(await rows()).toEqual([expect.objectContaining({ audit_id: id, tenant_id: 'outbox-test', client_id: clientId, site_id: siteId, checkpoint_id: checkpoint, checkpoint_digest: 'c'.repeat(64), environment: 'staging', state: 'pending', attempts: 0, claim_token: null, claim_until: null, finished_at: null })])
    expect(JSON.stringify(await rows())).not.toContain(origin.loginSessionHash)
  })
  it('retains production environment from a managed graph commit', async () => {
    await audit({ digest: 'c'.repeat(64), commitProtocol: 'cms-graph-v1', stagingOrigin: { ...origin, environment: 'production' } })
    expect(await rows()).toEqual([expect.objectContaining({ environment: 'production' })])
  })
  it('rolls back staging intent when the enclosing checkpoint transaction fails', async () => {
    await db.query('BEGIN')
    await audit()
    expect(await rows()).toHaveLength(1)
    await db.query('ROLLBACK')
    expect(await rows()).toHaveLength(0)
    expect((await db.query('SELECT * FROM page_studio_audit_events')).rows).toHaveLength(0)
  })
  it('does not expose intent to another process until commit', async () => {
    const observer = new pg.Client({ connectionString: url })
    await observer.connect()
    try {
      await observer.query(`SET search_path TO "${schema}", pg_catalog`)
      await db.query('BEGIN')
      await audit()
      expect((await observer.query('SELECT * FROM page_studio_checkpoint_staging_outbox')).rows).toHaveLength(0)
      await db.query('COMMIT')
      expect((await observer.query('SELECT * FROM page_studio_checkpoint_staging_outbox')).rows).toHaveLength(1)
    } finally { await observer.end() }
  })
  it.each([{}, { stagingOrigin: origin }, { digest: 'd'.repeat(64), commitProtocol: 'cas-v1', stagingOrigin: origin }, { digest: 'c'.repeat(64), commitProtocol: 'legacy', stagingOrigin: origin }, { digest: 'c'.repeat(64), commitProtocol: 'cas-v1', stagingOrigin: { ...origin, environment: 'foreign' } }])('preserves legacy/unsupported audits without staging authority', async (metadata) => {
    await audit(metadata)
    expect(await rows()).toHaveLength(0)
  })
  it('ignores unrelated audit events', async () => {
    await audit(undefined, 'version.registered')
    expect(await rows()).toHaveLength(0)
  })
  it('does not duplicate intent on idempotent audit insertion or migration rerun', async () => {
    const id = await audit()
    await db.query('INSERT INTO page_studio_audit_events SELECT * FROM page_studio_audit_events WHERE id=$1 ON CONFLICT DO NOTHING', [id])
    await db.query(readFileSync(migration, 'utf8'))
    expect(await rows()).toHaveLength(1)
  })
  it('does not backfill previously committed audits', async () => {
    await db.query('ALTER TABLE page_studio_audit_events DISABLE TRIGGER page_studio_checkpoint_staging_enqueue')
    await audit()
    await db.query(readFileSync(migration, 'utf8'))
    expect(await rows()).toHaveLength(0)
  })
  it.each(['checkpoint_digest=repeat(\'d\',64)', 'environment=\'production\'', 'checkpoint_id=\'other\'', 'audit_id=gen_random_uuid()', 'tenant_id=\'foreign\''])('protects immutable request identity: %s', async (change) => {
    await audit()
    await expect(db.query(`UPDATE page_studio_checkpoint_staging_outbox SET ${change}`)).rejects.toThrow('CHECKPOINT_STAGING_IDENTITY_IMMUTABLE')
  })
  it('keeps a completed tombstone immutable', async () => {
    await audit()
    await db.query('UPDATE page_studio_checkpoint_staging_outbox SET state=\'completed\',outcome=\'READY\',finished_at=clock_timestamp()')
    await expect(db.query('UPDATE page_studio_checkpoint_staging_outbox SET state=\'pending\',outcome=NULL,finished_at=NULL')).rejects.toThrow('CHECKPOINT_STAGING_IDENTITY_IMMUTABLE')
    await expect(db.query('DELETE FROM page_studio_checkpoint_staging_outbox')).rejects.toThrow('CHECKPOINT_STAGING_IDENTITY_IMMUTABLE')
  })
  describe('durable claims and acknowledgements', () => {
    async function transaction<T>(client: pg.Client, work: () => Promise<T>) {
      await client.query('BEGIN')
      try {
        const result = await work()
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
    const claim = () => transaction(db, () => claimCheckpointStaging(db, 'staging', 3))
    const settle = (work: Parameters<typeof settleCheckpointStaging>[1], outcome: Parameters<typeof settleCheckpointStaging>[2]) => transaction(db, () => settleCheckpointStaging(db, work, outcome))
    const expire = () => db.query('UPDATE page_studio_checkpoint_staging_outbox SET claim_until=clock_timestamp()-INTERVAL \'1 second\' WHERE state=\'leased\'')
    it('claims only due work in its exact environment with retained identity', async () => {
      const id = await audit()
      await audit({ digest: 'c'.repeat(64), commitProtocol: 'cas-v1', stagingOrigin: { ...origin, environment: 'production' } })
      const result = await claim()
      expect(result.exhausted).toBe(0)
      expect(result.claims).toEqual([{ request: { auditId: id, scope: { tenantId: 'outbox-test', clientId, siteId }, checkpointId: checkpoint, digest: 'c'.repeat(64), expectedEnvironment: 'staging' }, token: expect.any(String), attempt: 1 }])
      expect((await claim()).claims).toHaveLength(0)
      expect((await rows()).filter(row => row.environment === 'production')).toEqual([expect.objectContaining({ state: 'pending', attempts: 0 })])
    })
    it.each([0, 4, -1, 1.5, NaN])('rejects invalid batch size %s before claiming anything', async (limit) => {
      await audit()
      await expect(claimCheckpointStaging(db, 'staging', limit)).rejects.toThrow()
      expect((await rows())[0]).toMatchObject({ state: 'pending', attempts: 0 })
    })
    it('rejects an unconfigured environment before claiming anything', async () => {
      await audit()
      await expect(claimCheckpointStaging(db, 'foreign', 3)).rejects.toThrow()
      expect((await rows())[0]).toMatchObject({ state: 'pending', attempts: 0 })
    })
    it('limits claims and skips rows held by another transaction', async () => {
      for (let i = 0; i < 5; i++) await audit()
      const other = new pg.Client({ connectionString: url })
      await other.connect()
      try {
        await other.query(`SET search_path TO "${schema}", pg_catalog; SET statement_timeout='1s'`)
        await db.query('BEGIN')
        const first = await claimCheckpointStaging(db, 'staging', 3)
        const second = await transaction(other, () => claimCheckpointStaging(other, 'staging', 3))
        expect(first.claims).toHaveLength(3)
        expect(second.claims).toHaveLength(2)
        expect(new Set([...first.claims, ...second.claims].map(row => row.request.auditId)).size).toBe(5)
        await db.query('COMMIT')
      } finally { await other.end() }
    })
    it('recovers a crash before RPC without replacing checkpoint identity', async () => {
      await audit()
      const first = (await claim()).claims[0]!
      await expire()
      const recovered = (await claim()).claims[0]!
      expect(recovered.request).toEqual(first.request)
      expect(recovered.token).not.toBe(first.token)
      expect(recovered.attempt).toBe(2)
      expect(await settle(first, 'READY')).toBe(false)
      expect(await settle(recovered, 'READY')).toBe(true)
      expect((await rows())[0]).toMatchObject({ state: 'completed', outcome: 'READY', attempts: 2, claim_token: null })
    })
    it('rejects an expired acknowledgement even before another owner claims', async () => {
      await audit()
      const first = (await claim()).claims[0]!
      await expire()
      expect(await settle(first, 'READY')).toBe(false)
      expect((await rows())[0].state).toBe('leased')
    })
    it('rejects settlement when the unchanged claim expires during a row-lock wait', async () => {
      await audit()
      const work = (await claim()).claims[0]!
      const blocker = new pg.Client({ connectionString: url })
      await blocker.connect()
      let pending: Promise<boolean> | undefined
      try {
        await blocker.query(`SET search_path TO "${schema}", pg_catalog`)
        const writerPid = (await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
        await db.query('UPDATE page_studio_checkpoint_staging_outbox SET claim_until=clock_timestamp()+INTERVAL \'500 milliseconds\'')
        await blocker.query('BEGIN')
        await blocker.query('SELECT audit_id FROM page_studio_checkpoint_staging_outbox FOR UPDATE')
        pending = settle(work, 'READY')
        await expect.poll(async () => (await blocker.query('SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) AS blocked', [writerPid])).rows[0].blocked, { timeout: 2000 }).toBe(true)
        await expect.poll(async () => (await blocker.query('SELECT claim_until<clock_timestamp() AS expired FROM page_studio_checkpoint_staging_outbox')).rows[0].expired, { timeout: 2000 }).toBe(true)
        await blocker.query('COMMIT')
        expect(await pending).toBe(false)
        expect((await rows())[0].state).toBe('leased')
      } finally {
        await blocker.query('ROLLBACK')
        await pending
        await blocker.end()
      }
    })
    it.each(['token', 'auditId', 'siteId', 'digest', 'environment', 'attempt'])('rejects an acknowledgement with changed %s', async (key) => {
      await audit()
      const first = (await claim()).claims[0]!
      const other = structuredClone(first)
      if (key === 'token') other.token = randomUUID()
      if (key === 'auditId') other.request.auditId = randomUUID()
      if (key === 'siteId') other.request.scope.siteId = randomUUID()
      if (key === 'digest') other.request.digest = 'd'.repeat(64)
      if (key === 'environment') other.request.expectedEnvironment = 'production'
      if (key === 'attempt') other.attempt++
      expect(await settle(other, 'READY')).toBe(false)
      expect((await rows())[0].state).toBe('leased')
    })
    it.each(['PENDING', 'STAGING_BUSY', 'STAGING_SERVICE_UNAVAILABLE'] as const)('reschedules %s with bounded delay and retained identity', async (outcome) => {
      await audit()
      const first = (await claim()).claims[0]!
      expect(await settle(first, outcome)).toBe(true)
      expect((await rows())[0]).toMatchObject({ state: 'pending', outcome, attempts: 1, claim_token: null })
      expect((await claim()).claims).toHaveLength(0)
      await db.query('UPDATE page_studio_checkpoint_staging_outbox SET available_at=clock_timestamp()-INTERVAL \'1 second\'')
      expect((await claim()).claims[0]!.request).toEqual(first.request)
    })
    it.each(['FAILED', 'SUSPENDED', 'STAGING_INVALID', 'STAGING_ACCESS_DENIED', 'STAGING_CHANGED', 'STAGING_BUILD_LIMIT'] as const)('stops terminal outcome %s without automatic new work', async (outcome) => {
      await audit()
      const first = (await claim()).claims[0]!
      expect(await settle(first, outcome)).toBe(true)
      expect((await rows())[0]).toMatchObject({ state: 'stopped', outcome, attempts: 1 })
      expect((await claim()).claims).toHaveLength(0)
      expect(await settle(first, 'READY')).toBe(false)
    })
    it.each(['acknowledged transient', 'crashed owner'])('stops after eight attempts: %s', async (scenario) => {
      await audit()
      for (let attempt = 1; attempt <= 8; attempt++) {
        const work = (await claim()).claims[0]!
        expect(work.attempt).toBe(attempt)
        if (scenario === 'crashed owner') await expire()
        else {
          await settle(work, 'STAGING_SERVICE_UNAVAILABLE')
          if (attempt < 8) await db.query('UPDATE page_studio_checkpoint_staging_outbox SET available_at=clock_timestamp()-INTERVAL \'1 second\'')
        }
      }
      const next = await claim()
      expect(next.claims).toHaveLength(0)
      expect(next.exhausted).toBe(scenario === 'crashed owner' ? 1 : 0)
      expect((await rows())[0]).toMatchObject({ state: 'stopped', outcome: 'EXHAUSTED', attempts: 8 })
    })
    it('rolls back a claim if the process fails before committing it', async () => {
      await audit()
      await db.query('BEGIN')
      await claimCheckpointStaging(db, 'staging', 3)
      await db.query('ROLLBACK')
      expect((await claim()).claims[0]!.attempt).toBe(1)
    })
  })
})
