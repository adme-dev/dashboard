import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reserveStagingAddress, beginStagingSnapshot, finishStagingSnapshot, failStagingSnapshot, stagingArtifactPrefix } from '../../../workers/page-studio-management/src/stagingStore'
import { resolveStagingHost, readStagingState } from '../../../workers/page-studio-management/src/stagingRead'
import { requireStagingAuthority } from '../../../workers/page-studio-management/src/stagingAuthority'
import { coordinateStaging, type StagingCoordinatorDependencies } from '../../../workers/page-studio-management/src/stagingCoordinator'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/studio_cms(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) throw new Error('Disposable localhost studio_cms database required')
}
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')

describe.runIf(Boolean(databaseUrl))('client staging reservation on PostgreSQL', () => {
  let db: pg.Client
  let schema: string
  let scope: { tenantId: string, clientId: string, siteId: string }
  const actorId = '30000000-0000-4000-8000-000000000701'
  const checkpointId = 'checkpoint_staging_current'
  const digest = 'a'.repeat(64)
  async function transaction<T>(work: () => Promise<T>) {
    await db.query('BEGIN')
    try {
      const result = await work()
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  function request(key = 'test-staging-request') {
    return { scope, actorId, actorRole: 'agency' as const, checkpointId, digest, expectedActiveId: null, idempotencyKey: key }
  }
  beforeEach(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    schema = `staging_test_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE team_members(id UUID PRIMARY KEY); CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY); CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));`)
    await db.query(migration('402_page_studio_control_plane.sql'))
    await db.query(migration('428_page_studio_client_staging.sql'))
    await db.query('INSERT INTO team_members VALUES($1)', [actorId])
    const clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    const entitlement = (await db.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,custom_domain_limit) VALUES('staging-test',$1,0) RETURNING id`, [clientId])).rows[0]
    const site = (await db.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('staging-test',$1,$2,'Preview client','preview-client','limousine-v1') RETURNING id`, [clientId, entitlement.id])).rows[0]
    scope = { tenantId: 'staging-test', clientId, siteId: site.id }
    await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
      VALUES($1,$2,$3,$4,$5,'checkpoints/current','etag',NOW())`, [checkpointId, scope.tenantId, scope.clientId, scope.siteId, digest])
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=$1 WHERE id=$2', [checkpointId, scope.siteId])
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      if (schema) await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })
  it('automatically reserves a stable URL even with zero customer-domain allowance', async () => {
    const first = await transaction(() => reserveStagingAddress(db, scope))
    const second = await transaction(() => reserveStagingAddress(db, scope))
    expect(first.hostname).toBe(second.hostname)
    expect(first.hostname).toContain(scope.siteId.replaceAll('-', ''))
    expect((await db.query('SELECT * FROM page_studio_staging_sites')).rows).toHaveLength(1)
    expect((await db.query('SELECT * FROM page_studio_domains')).rows).toHaveLength(0)
  })
  it('shares monthly build admission with production and does not charge a retry twice', async () => {
    await db.query('UPDATE page_studio_entitlements SET monthly_build_limit=1')
    await transaction(() => db.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_existing\')', [scope.tenantId, scope.clientId, scope.siteId]))
    await transaction(() => db.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_existing\')', [scope.tenantId, scope.clientId, scope.siteId]))
    await expect(transaction(() => beginStagingSnapshot(db, request()))).rejects.toMatchObject({ code: 'STAGING_BUILD_LIMIT' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
    expect((await db.query('SELECT * FROM page_studio_staging_deployments')).rows).toHaveLength(0)
  })
  it('counts a staging snapshot once and denies new builds when its plan allowance is exhausted', async () => {
    await db.query('UPDATE page_studio_entitlements SET monthly_build_limit=1')
    const first = await transaction(() => beginStagingSnapshot(db, request()))
    expect(await transaction(() => beginStagingSnapshot(db, request()))).toEqual(first)
    await transaction(() => failStagingSnapshot(db, { scope, id: first.id, failure: 'BUILD_FAILED' }))
    await expect(transaction(() => beginStagingSnapshot(db, request('second')))).rejects.toMatchObject({ code: 'STAGING_BUILD_LIMIT' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
  })
  it('admits only one of concurrent staging and release requests for the last build slot', async () => {
    await db.query('UPDATE page_studio_entitlements SET monthly_build_limit=1')
    const other = new pg.Client({ connectionString: databaseUrl })
    await other.connect()
    try {
      await other.query(`SET search_path TO "${schema}", pg_catalog`)
      const results = await Promise.allSettled([
        db.query('SELECT admit_page_studio_build($1,$2,$3,\'staging\',\'snapshot_race\')', [scope.tenantId, scope.clientId, scope.siteId]),
        other.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_race\')', [scope.tenantId, scope.clientId, scope.siteId])
      ])
      expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1)
      const failure = results.find(item => item.status === 'rejected') as PromiseRejectedResult
      expect(failure.reason.message).toBe('STUDIO_BUILD_LIMIT')
      expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
    } finally { await other.end() }
  })
  it('rolls back allowance with a rejected transaction and denies retries after entitlement suspension', async () => {
    await expect(transaction(async () => {
      await db.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_transaction\')', [scope.tenantId, scope.clientId, scope.siteId])
      throw new Error('injected failure')
    })).rejects.toThrow('injected failure')
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
    await db.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_transaction\')', [scope.tenantId, scope.clientId, scope.siteId])
    await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
    await expect(db.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_transaction\')', [scope.tenantId, scope.clientId, scope.siteId])).rejects.toThrow('STUDIO_BUILD_ACCESS')
  })
  async function portal(role = 'admin', member = 'editor') {
    await db.query('ALTER TABLE client_users ADD COLUMN client_id UUID,ADD COLUMN status TEXT,ADD COLUMN role TEXT')
    await db.query('INSERT INTO client_users(id,client_id,status,role) VALUES($1,$2,\'active\',$3)', [actorId, scope.clientId, role])
    await db.query('INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role) VALUES($1,$2,$3,$4,$5)', [scope.tenantId, scope.clientId, scope.siteId, actorId, member])
    return { kind: 'portal' as const, actorId, clientId: scope.clientId }
  }
  it('allows the client editor to manage staging without custom-domain allowance', async () => {
    const actor = await portal()
    expect(await transaction(() => requireStagingAuthority(db, actor, scope.siteId, true))).toEqual({ scope, canManage: true })
  })
  it.each([['viewer', 'viewer'], ['admin', 'viewer'], ['viewer', 'editor']])('allows %s/%s to read but never deploy', async (role, member) => {
    const actor = await portal(role, member)
    expect((await transaction(() => requireStagingAuthority(db, actor, scope.siteId, false))).canManage).toBe(false)
    await expect(transaction(() => requireStagingAuthority(db, actor, scope.siteId, true))).rejects.toMatchObject({ code: 'STAGING_ACCESS_DENIED' })
  })
  it('rejects stale portal access and another selected client', async () => {
    const actor = await portal()
    await expect(transaction(() => requireStagingAuthority(db, { ...actor, clientId: randomUUID() }, scope.siteId, false))).rejects.toMatchObject({ code: 'STAGING_ACCESS_DENIED' })
    await db.query('UPDATE client_users SET status=\'inactive\'')
    await expect(transaction(() => requireStagingAuthority(db, actor, scope.siteId, true))).rejects.toMatchObject({ code: 'STAGING_ACCESS_DENIED' })
  })
  async function coordinator() {
    const actor = await portal()
    const input = { actor, siteId: scope.siteId, expectedEnvironment: 'production', operation: 'update', body: { digest, expectedActiveId: null as string | null, idempotencyKey: randomUUID() } }
    const dependencies: StagingCoordinatorDependencies = {
      transaction: work => transaction(() => work(db)),
      attach: async () => ({ hostname: `preview-${scope.siteId.replaceAll('-', '')}.xeroflow.io`, domainId: 'd'.repeat(32), certificateId: randomUUID() }),
      probe: async () => true,
      build: async (identity) => {
        const prefix = stagingArtifactPrefix(identity.scope, identity.snapshotId)
        return { snapshotId: identity.snapshotId, digest: identity.digest, artifactPrefix: prefix, manifestKey: `${prefix}/staging-manifest.json`, manifestDigest: 'c'.repeat(64) }
      },
      verify: async () => ({ verified: true, manifestDigest: 'c'.repeat(64) })
    }
    return { input, dependencies }
  }
  it('coordinates hostname read-back, build, verification and activation with an idempotent receipt', async () => {
    const { input, dependencies } = await coordinator()
    const first = await coordinateStaging(input, dependencies)
    expect(first).toMatchObject({ status: 'ready', active: { digest } })
    dependencies.attach = async () => {
      throw new Error('Completed retry must not contact the provider')
    }
    expect(await coordinateStaging(input, dependencies)).toEqual(first)
    expect((await db.query('SELECT * FROM page_studio_audit_events WHERE action=\'staging.activated\'')).rows).toHaveLength(1)
  })
  it('never builds or activates before HTTPS hostname read-back succeeds', async () => {
    const { input, dependencies } = await coordinator()
    dependencies.probe = async () => false
    let builds = 0
    dependencies.build = async () => {
      builds++
    }
    expect(await coordinateStaging(input, dependencies)).toMatchObject({ status: 'failed', active: null, failure: 'HOST_UNAVAILABLE' })
    expect(builds).toBe(0)
  })
  it('makes an expired crashed request retryable without falsely claiming an active deployment', async () => {
    const { input, dependencies } = await coordinator()
    const snapshot = await transaction(() => beginStagingSnapshot(db, { ...request(input.body.idempotencyKey), actorRole: 'client' }))
    await db.query('UPDATE page_studio_staging_deployments SET state=\'building\',claim_token=$1,claim_until=clock_timestamp()-INTERVAL \'1 second\'', [randomUUID()])
    expect(await readStagingState(db, scope, true)).toMatchObject({ status: 'failed', failure: 'BUILD_FAILED', active: null })
    expect(await coordinateStaging(input, dependencies)).toMatchObject({ status: 'ready', active: { id: snapshot.id } })
  })
  it('retains a working snapshot when a later build fails', async () => {
    const { input, dependencies } = await coordinator()
    const first = await coordinateStaging(input, dependencies)
    dependencies.build = async () => {
      throw new Error('Provider diagnostic must not escape')
    }
    const replacement = { ...input, body: { ...input.body, expectedActiveId: first.active!.id, idempotencyKey: randomUUID() } }
    expect(await coordinateStaging(replacement, dependencies)).toMatchObject({ status: 'update_failed', active: first.active, failure: 'BUILD_FAILED' })
  })
  it('requires exact verified artifact evidence before activation', async () => {
    const { input, dependencies } = await coordinator()
    dependencies.verify = async () => ({ verified: true, manifestDigest: 'b'.repeat(64) })
    expect(await coordinateStaging(input, dependencies)).toMatchObject({ status: 'failed', active: null, failure: 'BUILD_FAILED' })
  })
  it('rechecks current saved content after building', async () => {
    const { input, dependencies } = await coordinator()
    const build = dependencies.build
    dependencies.build = async (identity) => {
      await db.query('UPDATE page_studio_checkpoints SET digest=$1', ['b'.repeat(64)])
      return build(identity)
    }
    expect(await coordinateStaging(input, dependencies)).toMatchObject({ status: 'failed', active: null, failure: 'SNAPSHOT_CHANGED' })
  })
  it('does not activate after the initiating client loses access', async () => {
    const { input, dependencies } = await coordinator()
    const build = dependencies.build
    dependencies.build = async (identity) => {
      await db.query('DELETE FROM page_studio_site_memberships')
      return build(identity)
    }
    await expect(coordinateStaging(input, dependencies)).rejects.toMatchObject({ code: 'STAGING_ACCESS_DENIED' })
    expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBeNull()
    expect((await db.query('SELECT failure_code FROM page_studio_staging_deployments')).rows[0].failure_code).toBe('ACCESS_INACTIVE')
  })
  it('shows an allocated address without claiming an undeployed site is ready', async () => {
    const value = await transaction(() => readStagingState(db, scope, true))
    expect(value).toMatchObject({ siteId: scope.siteId, status: 'not_published', active: null, currentDigest: digest, canManage: true })
    expect(await resolveStagingHost(db, value.hostname)).toBeNull()
  })
  it('resolves only an active same-scope snapshot and immediately honours revocation', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await finish(snapshot)
    const state = await readStagingState(db, scope, false)
    expect(state).toMatchObject({ status: 'ready', canManage: false, active: { id: snapshot.id, digest } })
    expect(await resolveStagingHost(db, state.hostname)).toMatchObject({ scope, id: snapshot.id, digest, artifactPrefix: stagingArtifactPrefix(scope, snapshot.id) })
    await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
    expect(await resolveStagingHost(db, state.hostname)).toBeNull()
  })
  it('rejects foreign hostnames and does not expose an inactive deployment', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    const state = await readStagingState(db, scope, true)
    expect(state.status).toBe('provisioning')
    expect(await resolveStagingHost(db, state.hostname)).toBeNull()
    expect(await resolveStagingHost(db, 'app.xeroflow.io')).toBeNull()
    expect(await resolveStagingHost(db, `${state.hostname}.attacker.test`)).toBeNull()
    await readyHost()
    await finish(snapshot)
    await db.query('UPDATE page_studio_staging_sites SET host_state=\'suspended\'')
    expect((await readStagingState(db, scope, true)).status).toBe('suspended')
    expect(await resolveStagingHost(db, state.hostname)).toBeNull()
  })
  it('shows a failed update alongside its still-working previous snapshot', async () => {
    const first = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await finish(first)
    const second = await transaction(() => beginStagingSnapshot(db, { ...request('replacement'), expectedActiveId: first.id }))
    await transaction(() => failStagingSnapshot(db, { scope, id: second.id, failure: 'BUILD_FAILED' }))
    expect(await readStagingState(db, scope, true)).toMatchObject({ status: 'update_failed', active: { id: first.id }, failure: 'BUILD_FAILED' })
  })
  it.each(['tenantId', 'clientId', 'siteId'] as const)('rejects another %s before reservation', async (key) => {
    const wrong = { ...scope, [key]: key === 'tenantId' ? 'other-tenant' : randomUUID() }
    await expect(transaction(() => reserveStagingAddress(db, wrong))).rejects.toMatchObject({ code: 'STAGING_ACCESS_DENIED' })
    expect((await db.query('SELECT * FROM page_studio_staging_sites')).rows).toHaveLength(0)
  })
  it('enforces the generated hostname in PostgreSQL', async () => {
    await transaction(() => reserveStagingAddress(db, scope))
    await expect(db.query('UPDATE page_studio_staging_sites SET hostname=\'app.xeroflow.io\'')).rejects.toMatchObject({ code: '23514' })
  })
  it('pins the exact saved checkpoint with an audit and idempotent retry', async () => {
    const first = await transaction(() => beginStagingSnapshot(db, request()))
    const second = await transaction(() => beginStagingSnapshot(db, request()))
    expect(first).toEqual(second)
    expect(first).toMatchObject({ checkpointId, digest, state: 'queued' })
    expect((await db.query('SELECT * FROM page_studio_staging_deployments')).rows).toHaveLength(1)
    expect((await db.query('SELECT * FROM page_studio_audit_events WHERE action=\'staging.requested\'')).rows).toHaveLength(1)
  })
  it('rejects stale drafts and idempotency keys with different payloads', async () => {
    await expect(transaction(() => beginStagingSnapshot(db, { ...request(), digest: 'b'.repeat(64) }))).rejects.toMatchObject({ code: 'STAGING_CHANGED' })
    await transaction(() => beginStagingSnapshot(db, request()))
    await expect(transaction(() => beginStagingSnapshot(db, { ...request(), actorId: randomUUID() }))).rejects.toMatchObject({ code: 'STAGING_CHANGED' })
    expect((await db.query('SELECT * FROM page_studio_staging_deployments')).rows).toHaveLength(1)
  })
  it('does not replace an in-flight request or mutate the production release', async () => {
    await transaction(() => beginStagingSnapshot(db, request()))
    await expect(transaction(() => beginStagingSnapshot(db, request('other-request')))).rejects.toMatchObject({ code: 'STAGING_BUSY' })
    expect((await db.query('SELECT current_release_id,status FROM page_studio_sites')).rows[0]).toMatchObject({ current_release_id: null, status: 'draft' })
    expect((await db.query('SELECT * FROM page_studio_releases')).rows).toHaveLength(0)
  })
  it('rolls back both reservation and request if its audit cannot commit', async () => {
    await db.query(`CREATE FUNCTION fail_staging_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$;
      CREATE TRIGGER fail_staging_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION fail_staging_audit();`)
    await expect(transaction(() => beginStagingSnapshot(db, request()))).rejects.toThrow('test audit failure')
    expect((await db.query('SELECT * FROM page_studio_staging_sites')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM page_studio_staging_deployments')).rows).toHaveLength(0)
  })
  async function readyHost() {
    await db.query('UPDATE page_studio_staging_sites SET host_state=\'ready\',provider_domain_id=\'provider-test\',provider_verified_at=NOW()')
  }
  async function finish(snapshot: { id: string }) {
    return transaction(() => finishStagingSnapshot(db, { scope, id: snapshot.id, artifactPrefix: stagingArtifactPrefix(scope, snapshot.id), manifestDigest: 'b'.repeat(64) }))
  }
  it('activates exactly one verified snapshot and recovers completion without another audit', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await finish(snapshot)
    await finish(snapshot)
    expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBe(snapshot.id)
    expect((await db.query('SELECT * FROM page_studio_audit_events WHERE action=\'staging.activated\'')).rows).toHaveLength(1)
    expect((await db.query('SELECT status,current_release_id FROM page_studio_sites')).rows[0]).toMatchObject({ status: 'draft', current_release_id: null })
  })
  it('keeps a previous working snapshot when the replacement fails', async () => {
    const original = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await finish(original)
    const replacement = await transaction(() => beginStagingSnapshot(db, { ...request('replacement'), expectedActiveId: original.id }))
    await transaction(() => failStagingSnapshot(db, { scope, id: replacement.id, failure: 'BUILD_FAILED' }))
    expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBe(original.id)
    expect((await db.query('SELECT state,failure_code FROM page_studio_staging_deployments WHERE id=$1', [replacement.id])).rows[0]).toMatchObject({ state: 'failed', failure_code: 'BUILD_FAILED' })
  })
  it('does not activate before provider verification or accept a foreign artifact prefix', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    await expect(finish(snapshot)).rejects.toMatchObject({ code: 'STAGING_CHANGED' })
    await readyHost()
    await expect(transaction(() => finishStagingSnapshot(db, { scope, id: snapshot.id, artifactPrefix: 'other-site/private', manifestDigest: 'b'.repeat(64) }))).rejects.toMatchObject({ code: 'STAGING_CHANGED' })
    expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBeNull()
  })
  it('rejects a changed saved checkpoint before activation', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=NULL')
    await expect(finish(snapshot)).rejects.toMatchObject({ code: 'STAGING_CHANGED' })
    expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBeNull()
  })
  it('rejects activation of a queued snapshot even through direct database mutation', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await expect(db.query('UPDATE page_studio_staging_sites SET active_deployment_id=$1', [snapshot.id])).rejects.toThrow('STAGING_SNAPSHOT_NOT_READY')
  })
  it('rolls back activation and its receipt when the audit fails', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await db.query(`CREATE FUNCTION fail_activation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test activation audit failure'; END $$;
      CREATE TRIGGER fail_activation_audit BEFORE INSERT ON page_studio_audit_events FOR EACH ROW EXECUTE FUNCTION fail_activation_audit();`)
    await expect(finish(snapshot)).rejects.toThrow('test activation audit failure')
    expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBeNull()
    expect((await db.query('SELECT state FROM page_studio_staging_deployments')).rows[0].state).toBe('queued')
  })
  it('serializes simultaneous retries to one snapshot', async () => {
    const other = new pg.Client({ connectionString: databaseUrl })
    await other.connect()
    await other.query(`SET search_path TO "${schema}", pg_catalog`)
    await other.query('BEGIN')
    try {
      const [first, second] = await Promise.all([
        transaction(() => beginStagingSnapshot(db, request())),
        beginStagingSnapshot(other, request()).then(async (result) => {
          await other.query('COMMIT')
          return result
        })
      ])
      expect(first.id).toBe(second.id)
      expect((await db.query('SELECT * FROM page_studio_staging_deployments')).rows).toHaveLength(1)
    } finally {
      await other.query('ROLLBACK')
      await other.end()
    }
  })
  it('recovers the retained request after reconnecting to the database', async () => {
    const saved = await transaction(() => beginStagingSnapshot(db, request()))
    await db.end()
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    expect(await transaction(() => beginStagingSnapshot(db, request()))).toEqual(saved)
  })
  it('keeps completed snapshot identity immutable', async () => {
    const snapshot = await transaction(() => beginStagingSnapshot(db, request()))
    await readyHost()
    await finish(snapshot)
    await expect(db.query('UPDATE page_studio_staging_deployments SET artifact_manifest_digest=$1 WHERE id=$2', ['c'.repeat(64), snapshot.id])).rejects.toThrow('STAGING_DEPLOYMENT_IMMUTABLE')
    await expect(db.query('UPDATE page_studio_staging_deployments SET idempotency_key=\'changed\' WHERE id=$1', [snapshot.id])).rejects.toThrow('STAGING_DEPLOYMENT_IMMUTABLE')
  })
  it.each(['suspended', 'cancelled'])('denies a %s entitlement including retries', async (status) => {
    await transaction(() => beginStagingSnapshot(db, request()))
    await db.query('UPDATE page_studio_entitlements SET status=$1', [status])
    await expect(transaction(() => beginStagingSnapshot(db, request()))).rejects.toMatchObject({ code: 'STAGING_ACCESS_DENIED' })
  })
})
