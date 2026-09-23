import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageStudioStagingAddress } from '../../../shared/pageStudio/staging'
import { beginInitialStagingSnapshot, beginStagingSnapshot, stagingArtifactPrefix } from '../../../workers/page-studio-management/src/stagingStore'
import * as stagingCoordinator from '../../../workers/page-studio-management/src/stagingCoordinator'
import type { StagingCoordinatorDependencies } from '../../../workers/page-studio-management/src/stagingCoordinator'
import * as authority from '../../../workers/page-studio-management/src/stagingAuthority'

const url = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1'
    || !/^\/studio_cms_[a-z0-9_]+$/.test(target.pathname) || target.search) throw new Error('Disposable localhost studio_cms database required')
}
const requireOrigin = (db: pg.Client, input: unknown, environment = 'staging') => {
  const check = Reflect.get(authority, 'requireCheckpointStagingOrigin')
  expect(check, 'Private staging must revalidate retained checkpoint origins').toBeTypeOf('function')
  return check(db, input, environment)
}
const denied = { code: 'STAGING_ACCESS_DENIED', statusCode: 403 }

describe.runIf(Boolean(url))('retained checkpoint staging authority on PostgreSQL', () => {
  let db: pg.Client, schema: string
  let scope: { tenantId: string, clientId: string, siteId: string }
  let input: { scope: typeof scope, auditId: string, checkpointId: string, digest: string, expectedEnvironment: string }
  const userId = '30000000-0000-4000-8000-000000000901'
  const roleId = '60000000-0000-4000-8000-000000000901'
  const hash = 'a'.repeat(64), nonce = 'retained_editor_nonce'
  async function transaction<T>(work: () => Promise<T>) {
    await db.query('BEGIN')
    try {
      const value = await work()
      await db.query('COMMIT')
      return value
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  beforeEach(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
    schema = `staging_origin_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);`)
    for (const name of ['402_page_studio_control_plane.sql', '415_page_studio_setup_proposals.sql', '420_page_studio_login_sessions.sql', '428_page_studio_client_staging.sql'])
      await db.query(readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8'))
    await db.query('INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)', [roleId])
    await db.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_VIEW\'),($1,\'PAGE_STUDIO_EDIT\') ON CONFLICT DO NOTHING', [roleId])
    await db.query('INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)', [userId])
    const clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    await db.query('INSERT INTO client_users VALUES($1,$2,\'active\',\'manager\')', [userId, clientId])
    const entitlement = (await db.query('INSERT INTO page_studio_entitlements(tenant_id,client_id,custom_domain_limit) VALUES(\'origin-test\',$1,0) RETURNING id', [clientId])).rows[0]
    const site = (await db.query('INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version) VALUES(\'origin-test\',$1,$2,\'Origin\',\'origin\',\'limousine-v1\') RETURNING id', [clientId, entitlement.id])).rows[0]
    scope = { tenantId: 'origin-test', clientId, siteId: site.id }
    input = { scope, auditId: randomUUID(), checkpointId: `setup_${'b'.repeat(64)}`, digest: 'c'.repeat(64), expectedEnvironment: 'staging' }
    await db.query('INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role) VALUES($1,$2,$3,$4,\'editor\')', [scope.tenantId, clientId, site.id, userId])
    await db.query('INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,author_id,created_at) VALUES($1,$2,$3,$4,$5,\'checkpoints/saved\',\'etag\',$6,NOW())', [input.checkpointId, scope.tenantId, clientId, site.id, input.digest, userId])
    await db.query('UPDATE page_studio_sites SET current_checkpoint_id=$1 WHERE id=$2', [input.checkpointId, site.id])
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      if (schema) await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })
  async function seed(role: 'agency' | 'client', source: 'native-login' | 'studio-session' | 'provisioning', corrupt?: (metadata: Record<string, unknown>) => Record<string, unknown>) {
    await db.query('INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES($1,$2,$3,NOW()-INTERVAL \'1 hour\',NOW()+INTERVAL \'1 hour\')', [role, hash, userId])
    if (role === 'client') await db.query('INSERT INTO client_sessions VALUES($1,$2,NOW()+INTERVAL \'1 hour\')', [hash, userId])
    await db.query('INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash) VALUES($1,$2,$3,$4,$5,$6,\'["workspace:checkpoint"]\',NOW(),NOW()+INTERVAL \'1 hour\',$7)', [nonce, scope.tenantId, scope.clientId, scope.siteId, userId, role, hash])
    await db.query('INSERT INTO page_studio_setup_proposals(tenant_id,client_id,site_id,revision,status,source,plan,created_by) VALUES($1,$2,$3,1,\'accepted\',\'template\',\'{}\',$4)', [scope.tenantId, scope.clientId, scope.siteId, userId])
    const origin = { formatVersion: 1, environment: 'staging', role, source, userId, loginSessionHash: hash,
      ...(source === 'studio-session' ? { nonce } : {}), ...(source === 'provisioning' ? { requestKey: `page-studio-${scope.siteId}-1`, proposalRevision: 1 } : {}) }
    const metadata = { digest: input.digest, authorId: userId, commitProtocol: 'cas-v1', expectedCheckpointId: null, stagingOrigin: origin }
    await db.query('INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,\'workspace.checkpointed\',\'checkpoint\',$7,\'origin-fixture\',$8)',
      [input.auditId, scope.tenantId, scope.clientId, scope.siteId, source === 'provisioning' ? 'page-studio' : userId, source === 'provisioning' ? 'service' : role, input.checkpointId, corrupt ? corrupt(metadata) : metadata])
    return origin
  }
  function execution() {
    let inTransaction = false
    const dependencies: StagingCoordinatorDependencies = {
      transaction: async work => transaction(async () => {
        inTransaction = true
        try {
          return await work(db)
        } finally { inTransaction = false }
      }),
      attach: vi.fn(async () => {
        expect(inTransaction).toBe(false)
        return { domainId: 'f'.repeat(32), certificateId: randomUUID(), hostname: pageStudioStagingAddress(scope.siteId).hostname }
      }),
      probe: vi.fn(async () => {
        expect(inTransaction).toBe(false)
        return true
      }),
      build: vi.fn(async (identity) => {
        expect(inTransaction).toBe(false)
        const artifactPrefix = stagingArtifactPrefix(identity.scope, identity.snapshotId)
        return { snapshotId: identity.snapshotId, digest: identity.digest, artifactPrefix, manifestKey: `${artifactPrefix}/staging-manifest.json`, manifestDigest: 'e'.repeat(64) }
      }),
      verify: vi.fn(async (value) => {
        expect(inTransaction).toBe(false)
        return { verified: true, manifestDigest: value.manifestDigest }
      })
    }
    const run = () => {
      const coordinate = Reflect.get(stagingCoordinator, 'coordinateCheckpointStaging')
      expect(coordinate, 'Checkpoint staging must retain and recheck its original authority').toBeTypeOf('function')
      return coordinate(input, 'staging', dependencies)
    }
    return { dependencies, run }
  }
  describe('checkpoint snapshot execution', () => {
    it('builds once from the retained identity and preserves its audit reference', async () => {
      await seed('client', 'studio-session')
      const { run, dependencies } = execution()
      const first = await run()
      expect(first).toMatchObject({ status: 'ready', active: { digest: input.digest } })
      expect(await run()).toEqual(first)
      expect(dependencies.attach).toHaveBeenCalledTimes(1)
      expect((await db.query('SELECT metadata FROM page_studio_audit_events WHERE action=\'staging.requested\'')).rows[0].metadata.originAuditId).toBe(input.auditId)
      expect((await db.query('SELECT count(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
    })
    it.each(['attach', 'build', 'verify'] as const)('refuses activation after original login revocation during %s', async (stage) => {
      await seed('client', 'studio-session')
      const { run, dependencies } = execution()
      const original = dependencies[stage]
      dependencies[stage] = (async (...args: unknown[]) => {
        const value = await Reflect.apply(original, dependencies, args)
        await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
        return value
      }) as typeof original
      await expect(run()).rejects.toMatchObject(denied)
      expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBeNull()
      expect((await db.query('SELECT state,failure_code FROM page_studio_staging_deployments')).rows).toEqual([{ state: 'failed', failure_code: 'ACCESS_INACTIVE' }])
      if (stage === 'attach') expect(dependencies.build).not.toHaveBeenCalled()
    })
    it('recovers a queued original attempt without a second build admission', async () => {
      await seed('agency', 'native-login')
      const queued = await transaction(async () => {
        await requireOrigin(db, input)
        return beginInitialStagingSnapshot(db, { scope, actorId: userId, actorRole: 'agency', originAuditId: input.auditId } as Parameters<typeof beginInitialStagingSnapshot>[1])
      })
      const { run } = execution()
      expect(await run()).toMatchObject({ status: 'ready', active: { id: queued!.id } })
      expect((await db.query('SELECT count(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
    })
    it('recovers an expired claim with the original snapshot and a fresh token', async () => {
      await seed('agency', 'native-login')
      const queued = await transaction(async () => {
        await requireOrigin(db, input)
        return beginInitialStagingSnapshot(db, { scope, actorId: userId, actorRole: 'agency', originAuditId: input.auditId })
      })
      const oldToken = randomUUID()
      await db.query('UPDATE page_studio_staging_deployments SET state=\'building\',claim_token=$1,claim_until=clock_timestamp()-INTERVAL \'1 second\'', [oldToken])
      const { run } = execution()
      expect(await run()).toMatchObject({ status: 'ready', active: { id: queued!.id } })
      expect((await db.query('SELECT claim_token FROM page_studio_staging_deployments')).rows[0].claim_token).not.toBe(oldToken)
      expect((await db.query('SELECT count(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
    })
    it('ignores a late provider response after the original claim is replaced', async () => {
      await seed('agency', 'native-login')
      const { run, dependencies } = execution()
      let release!: () => void, entered!: () => void
      const blocked = new Promise<void>((resolve) => {
        release = resolve
      })
      const started = new Promise<void>((resolve) => {
        entered = resolve
      })
      const attach = dependencies.attach
      let attempts = 0
      dependencies.attach = async (siteId) => {
        const value = await attach(siteId)
        if (++attempts === 1) {
          entered()
          await blocked
        }
        return value
      }
      const first = run()
      try {
        await started
        await db.query('UPDATE page_studio_staging_deployments SET claim_until=clock_timestamp()-INTERVAL \'1 second\'')
        const replacement = await run()
        expect(replacement.status).toBe('ready')
        release()
        expect(await first).toEqual(replacement)
        expect(dependencies.build).toHaveBeenCalledTimes(1)
        expect((await db.query('SELECT state FROM page_studio_staging_deployments')).rows).toEqual([{ state: 'succeeded' }])
        expect((await db.query('SELECT id FROM page_studio_audit_events WHERE action=\'staging.activated\'')).rows).toHaveLength(1)
        expect((await db.query('SELECT id FROM page_studio_audit_events WHERE action=\'staging.failed\'')).rows).toHaveLength(0)
        expect((await db.query('SELECT count(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(1)
      } finally {
        release()
        await first
      }
    })
    it('rolls back activation if the original login expires during the final transaction', async () => {
      await seed('agency', 'native-login')
      const { run, dependencies } = execution()
      const verify = dependencies.verify
      dependencies.verify = async (value) => {
        await db.query('UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()+INTERVAL \'500 milliseconds\'')
        return verify(value)
      }
      const transact = dependencies.transaction
      dependencies.transaction = work => transact(db => work({ query: async (sql, params) => {
        const result = await db.query(sql, params)
        if (sql.includes('\'staging.activated\'')) await db.query('SELECT pg_sleep(0.6)')
        return result
      } }))
      await expect(run()).rejects.toMatchObject(denied)
      expect((await db.query('SELECT active_deployment_id FROM page_studio_staging_sites')).rows[0].active_deployment_id).toBeNull()
      expect((await db.query('SELECT id FROM page_studio_audit_events WHERE action=\'staging.activated\'')).rows).toHaveLength(0)
    })
    it('keeps a pending request identity separate from its mutable caller input', async () => {
      await seed('agency', 'native-login')
      const { run, dependencies } = execution()
      const attach = dependencies.attach
      dependencies.attach = async (siteId) => {
        const value = await attach(siteId)
        input.auditId = randomUUID()
        input.digest = 'd'.repeat(64)
        return value
      }
      expect(await run()).toMatchObject({ status: 'ready', active: { digest: 'c'.repeat(64) } })
    })
    it('cannot remove or replace the origin on an existing attempt', async () => {
      await seed('agency', 'native-login')
      await transaction(async () => {
        await requireOrigin(db, input)
        return beginInitialStagingSnapshot(db, { scope, actorId: userId, actorRole: 'agency', originAuditId: input.auditId } as Parameters<typeof beginInitialStagingSnapshot>[1])
      })
      const same = { scope, actorId: userId, actorRole: 'agency' as const, checkpointId: input.checkpointId,
        digest: input.digest, expectedActiveId: null, idempotencyKey: 'initial-staging-v1' }
      await expect(transaction(() => beginStagingSnapshot(db, same))).rejects.toMatchObject({ code: 'STAGING_CHANGED' })
      await expect(transaction(() => beginStagingSnapshot(db, { ...same, originAuditId: randomUUID() } as Parameters<typeof beginStagingSnapshot>[1]))).rejects.toMatchObject({ code: 'STAGING_CHANGED' })
    })
  })
  describe.each(['agency', 'client'] as const)('%s originating login', (role) => {
    it.each(['native-login', 'studio-session', 'provisioning'] as const)('resolves %s only from the exact checkpoint audit', async (source) => {
      const origin = await seed(role, source)
      const result = await transaction(() => requireOrigin(db, input))
      expect(result).toMatchObject({ scope, origin, auditId: input.auditId, checkpointId: input.checkpointId, digest: input.digest,
        actor: role === 'agency' ? { kind: 'agency', actorId: userId, tenantId: scope.tenantId } : { kind: 'portal', actorId: userId, clientId: scope.clientId } })
    })
    it.each([
      ['original login revoked', 'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'],
      ['original login expired', 'UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-INTERVAL \'1 second\''],
      ['child revoked', 'UPDATE page_studio_sessions SET revoked_at=clock_timestamp()'],
      ['child expired', 'UPDATE page_studio_sessions SET expires_at=clock_timestamp()-INTERVAL \'1 second\''],
      ['child capability removed', 'UPDATE page_studio_sessions SET capabilities=\'["workspace:status"]\''],
      ['package inactive', 'UPDATE page_studio_entitlements SET status=\'suspended\''],
      ['site archived', 'UPDATE page_studio_sites SET status=\'archived\'']
    ])('denies %s', async (_label, sql) => {
      await seed(role, 'studio-session')
      await db.query(sql)
      await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
    })
    it('does not substitute a new login for the revoked original', async () => {
      await seed(role, 'native-login')
      await db.query('UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()')
      await db.query('INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at) VALUES($1,$2,$3,NOW(),NOW()+INTERVAL \'1 hour\')', [role, 'd'.repeat(64), userId])
      await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
    })
    it('rejects superseded setup review even though the saved checkpoint remains current', async () => {
      await seed(role, 'provisioning')
      await db.query('INSERT INTO page_studio_setup_proposals(tenant_id,client_id,site_id,revision,status,source,plan,created_by) VALUES($1,$2,$3,2,\'accepted\',\'template\',\'{}\',$4)', [scope.tenantId, scope.clientId, scope.siteId, userId])
      await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
    })
    it.each(['tenant', 'client', 'site', 'checkpoint', 'digest', 'audit', 'environment', 'body-actor'])('rejects a substituted %s', async (field) => {
      await seed(role, 'native-login')
      const forged = structuredClone(input)
      if (field === 'tenant') forged.scope.tenantId = 'another-tenant'
      if (field === 'client') forged.scope.clientId = randomUUID()
      if (field === 'site') forged.scope.siteId = randomUUID()
      if (field === 'checkpoint') forged.checkpointId = 'other_checkpoint'
      if (field === 'digest') forged.digest = 'e'.repeat(64)
      if (field === 'audit') forged.auditId = randomUUID()
      if (field === 'environment') forged.expectedEnvironment = 'production'
      if (field === 'body-actor') Object.assign(forged, { actor: { actorId: userId } })
      await expect(transaction(() => requireOrigin(db, forged))).rejects.toBeDefined()
    })
  })
  it.each(['parent', 'child'] as const)('denies %s expiry while waiting for a child-session lock', async (which) => {
    await seed('agency', 'studio-session')
    const blocker = new pg.Client({ connectionString: url }), writer = new pg.Client({ connectionString: url })
    await blocker.connect()
    await writer.connect()
    let pending: Promise<unknown> | undefined
    try {
      for (const connection of [blocker, writer]) {
        await connection.query(`SET search_path TO "${schema}", pg_catalog`)
        await connection.query('SET statement_timeout=\'3s\'')
      }
      const table = which === 'parent' ? 'page_studio_login_sessions' : 'page_studio_sessions'
      const expiry = (await db.query(`UPDATE ${table} SET expires_at=clock_timestamp()+INTERVAL '500 milliseconds' RETURNING expires_at`)).rows[0].expires_at
      await blocker.query('BEGIN')
      await blocker.query('SELECT nonce FROM page_studio_sessions FOR UPDATE')
      await writer.query('BEGIN')
      pending = requireOrigin(writer, input).then((value: unknown) => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }))
      const waiterPid = (writer as unknown as { processID: number }).processID
      const blockerPid = (blocker as unknown as { processID: number }).processID
      await expect.poll(async () => (await db.query('SELECT $2=ANY(pg_blocking_pids($1)) AS waiting', [waiterPid, blockerPid])).rows[0].waiting,
        { interval: 10, timeout: 1000 }).toBe(true)
      await expect.poll(async () => (await db.query('SELECT clock_timestamp()>$1 AS expired', [expiry])).rows[0].expired,
        { interval: 10, timeout: 1000 }).toBe(true)
      await blocker.query('COMMIT')
      expect(await pending).toMatchObject({ ok: false, error: denied })
    } finally {
      await blocker.query('ROLLBACK')
      await pending
      await writer.query('ROLLBACK')
      await blocker.end()
      await writer.end()
    }
  })
  it.each(['absent origin', 'wrong environment', 'wrong author', 'wrong digest', 'unknown protocol'])('rejects %s retained audit metadata', async (change) => {
    await seed('agency', 'native-login', (metadata) => {
      const origin = metadata.stagingOrigin as Record<string, unknown>
      if (change === 'absent origin') Reflect.deleteProperty(metadata, 'stagingOrigin')
      if (change === 'wrong environment') origin.environment = 'production'
      if (change === 'wrong author') origin.userId = randomUUID()
      if (change === 'wrong digest') metadata.digest = 'wrong'
      if (change === 'unknown protocol') metadata.commitProtocol = 'legacy'
      return metadata
    })
    await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
  })
  it.each([
    ['missing staff edit permission', 'DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_EDIT\''],
    ['staff role read-only', 'UPDATE custom_roles SET is_read_only=TRUE'],
    ['staff deactivated', 'UPDATE team_members SET is_active=FALSE']
  ])('denies %s', async (_label, sql) => {
    await seed('agency', 'native-login')
    await db.query(sql)
    await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
  })
  it('denies portal membership removal', async () => {
    await seed('client', 'native-login')
    await db.query('DELETE FROM page_studio_site_memberships')
    await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
  })
  it('denies agency session invalidation even with active role permissions', async () => {
    await seed('agency', 'native-login')
    await db.query('UPDATE team_members SET sessions_invalidated_at=clock_timestamp()')
    await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
  })
  it('denies the portal native session after it expires', async () => {
    await seed('client', 'native-login')
    await db.query('UPDATE client_sessions SET expires_at=clock_timestamp()-INTERVAL \'1 second\'')
    await expect(transaction(() => requireOrigin(db, input))).rejects.toMatchObject(denied)
  })
})
