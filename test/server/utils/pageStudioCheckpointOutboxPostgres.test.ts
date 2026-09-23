import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
})
