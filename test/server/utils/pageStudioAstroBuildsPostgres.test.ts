import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reserveAstroReleaseBuild } from '~~/server/utils/pageStudio/astroBuilds'
import { buildApprovedPageStudioVersion, readApprovedBuildAuthority, persistSuccessfulBuild, type PageStudioBuildQueryClient } from '~~/server/utils/pageStudio/builds'
import { activatePageStudioRelease, rollbackPageStudioRelease } from '~~/server/utils/pageStudio/publishing'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/studio_cms(?:_[a-z0-9_]+)?$/.test(target.pathname) || target.search) throw new Error('Disposable localhost studio_cms database required')
}
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const toolchain = { formatVersion: 1, kind: 'astro-compiler-toolchain', image: `registry.cloudflare.com/test-account/astro-compiler@sha256:${'a'.repeat(64)}`, hostPolicyDigest: 'b'.repeat(64) }

describe.runIf(Boolean(databaseUrl))('Astro release identity migration and admission on PostgreSQL', () => {
  let db: pg.Client
  let schema: string
  let scope: { tenantId: string, clientId: string, siteId: string }
  let versionId: string
  let legacyReleaseId: string
  let legacyResult: { success: true, buildId: string, versionDigest: string, artifactPrefix: string, manifestKey: string, manifestDigest: string, validationKey: string }
  const actorId = '30000000-0000-4000-8000-000000000701'
  const digest = 'c'.repeat(64)
  const checkpointId = 'checkpoint_astro'
  async function transact<T>(client: pg.Client, work: (client: PageStudioBuildQueryClient) => Promise<T>) {
    await client.query('BEGIN')
    try {
      const value = await work(client)
      await client.query('COMMIT')
      return value
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
  const runTransaction = <T>(work: (client: PageStudioBuildQueryClient) => Promise<T>) => transact(db, work)
  const input = () => ({ scope, versionId, environment: 'production' as const, renderInputDigest: digest, featureRecoveryDigest: null, idempotencyKey: 'astro-request' })
  const reserve = (change = {}, select = () => toolchain) => runTransaction(client => reserveAstroReleaseBuild(client, { ...input(), ...change }, select))
  const activateInput = () => ({ scope, actorId, buildId: legacyResult.buildId, environment: 'production' as const, hostname: 'astro-test.example.invalid', expectedActiveReleaseId: null, idempotencyKey: 'legacy-release' })
  beforeEach(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    schema = `astro_build_test_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE team_members(id UUID PRIMARY KEY); CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY); CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));`)
    for (const name of ['402_page_studio_control_plane.sql', '413_page_studio_release_metadata.sql', '414_page_studio_atomic_release_metadata.sql', '428_page_studio_client_staging.sql']) await db.query(migration(name))
    await db.query('INSERT INTO team_members VALUES($1)', [actorId])
    const clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    const entitlement = (await db.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id) VALUES('astro-test',$1) RETURNING id`, [clientId])).rows[0]
    const site = (await db.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('astro-test',$1,$2,'Astro fixture','astro-fixture','test-v1') RETURNING id`, [clientId, entitlement.id])).rows[0]
    scope = { tenantId: 'astro-test', clientId, siteId: site.id }
    await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
      VALUES($1,$2,$3,$4,$5,'checkpoints/current','etag',NOW())`, [checkpointId, scope.tenantId, clientId, site.id, digest])
    versionId = (await db.query(`INSERT INTO page_studio_versions(tenant_id,client_id,site_id,checkpoint_id,digest,author_id,author_role,summary,status,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,'agency','Fixture','approved','version') RETURNING id`, [scope.tenantId, clientId, site.id, checkpointId, digest, actorId])).rows[0].id
    await db.query(`INSERT INTO page_studio_reviews(tenant_id,client_id,site_id,version_id,version_digest,decision,reviewer_id)
      VALUES($1,$2,$3,$4,$5,'approved',$6)`, [scope.tenantId, clientId, site.id, versionId, digest, actorId])
    const prefix = `tenants/${scope.tenantId}/clients/${clientId}/sites/${site.id}/builds/${digest}`
    legacyResult = { success: true, buildId: `build_${digest.slice(0, 32)}`, versionDigest: digest, artifactPrefix: prefix, manifestKey: `${prefix}/release-manifest.json`, manifestDigest: 'd'.repeat(64), validationKey: `${prefix}/validation-report.json` }
    await db.query(`INSERT INTO page_studio_builds(id,tenant_id,client_id,site_id,version_id,version_digest,artifact_prefix,release_manifest_key,release_manifest_digest,validation_report_key,state,idempotency_key,release_metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'succeeded','legacy-build',$11::jsonb)`, [legacyResult.buildId, ...Object.values(scope), versionId, digest, prefix, legacyResult.manifestKey, legacyResult.manifestDigest, legacyResult.validationKey,
      JSON.stringify({ theme: { label: 'historical' }, navigation: {}, footer: {}, seoDefaults: {}, integrations: {}, defaultLocale: 'en-AU' })])
    legacyReleaseId = (await activatePageStudioRelease(activateInput(), { runTransaction })).releaseId
    // Exercise migration against retained rows and live release foreign keys.
    await db.query(migration('430_page_studio_astro_build_identity.sql'))
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      if (schema) await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await db.end()
    }
  })

  it('retains a separate Astro build of the same approved version and charges one admission', async () => {
    const first = await reserve()
    expect(await reserve()).toEqual(first)
    const rows = (await db.query('SELECT id,renderer,state FROM page_studio_builds ORDER BY renderer')).rows
    expect(rows).toEqual([{ id: first.buildId, renderer: 'astro', state: 'pending' }, { id: legacyResult.buildId, renderer: 'legacy', state: 'succeeded' }])
    expect((await db.query('SELECT resource_id FROM page_studio_build_admissions')).rows).toEqual([{ resource_id: first.buildId }])
    expect((await db.query('SELECT current_release_id FROM page_studio_sites')).rows[0].current_release_id).toBe(legacyReleaseId)
    await db.query(migration('430_page_studio_astro_build_identity.sql'))
    expect(await reserve()).toEqual(first)
  })
  it('recovers the retained toolchain after a reconnect and rollout without invoking current selection', async () => {
    const first = await reserve()
    await db.end()
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    expect(await reserve({}, () => {
      throw new Error('Must not select a new toolchain on retry')
    })).toEqual(first)
  })
  it('conflicts before quota when an operation key changes its materialized input', async () => {
    await reserve()
    await expect(reserve({ renderInputDigest: 'e'.repeat(64), featureRecoveryDigest: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'BUILD_CONFLICT' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
    await expect(reserve({ idempotencyKey: 'legacy-build' })).rejects.toMatchObject({ code: 'BUILD_CONFLICT' })
  })
  it('rechecks revoked entitlement before returning the retained identity', async () => {
    await reserve()
    await db.query('UPDATE page_studio_entitlements SET status=\'suspended\'')
    await expect(reserve()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
  })
  it('rejects a checkpoint that no longer matches the approved version before admission', async () => {
    await db.query('UPDATE page_studio_checkpoints SET digest=$1 WHERE id=$2', ['e'.repeat(64), checkpointId])
    await expect(reserve()).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM page_studio_builds WHERE renderer=\'astro\'')).rows).toHaveLength(0)
  })
  it('retains the original identity and toolchain when deletion is attempted', async () => {
    const first = await reserve()
    await expect(db.query('DELETE FROM page_studio_builds WHERE id=$1', [first.buildId])).rejects.toThrow('ASTRO_BUILD_IDENTITY_IMMUTABLE')
    expect(await reserve({}, () => {
      throw new Error('Must retain the original toolchain')
    })).toEqual(first)
  })
  it('rejects changed input without a recovery pin and a second operation key for the same build', async () => {
    await expect(reserve({ renderInputDigest: 'e'.repeat(64) })).rejects.toMatchObject({ code: 'BUILD_NOT_APPROVED' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
    await reserve()
    await expect(reserve({ idempotencyKey: 'duplicate-operation' })).rejects.toMatchObject({ code: 'BUILD_CONFLICT' })
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
  })
  it('rolls back quota admission when persisting the reservation fails', async () => {
    await db.query(`CREATE FUNCTION reject_astro_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.renderer='astro' THEN RAISE EXCEPTION 'synthetic persistence failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_astro_insert BEFORE INSERT ON page_studio_builds FOR EACH ROW EXECUTE FUNCTION reject_astro_insert();`)
    await expect(reserve()).rejects.toThrow('synthetic persistence failure')
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM page_studio_builds WHERE renderer=\'astro\'')).rows).toHaveLength(0)
    await db.query('DROP TRIGGER reject_astro_insert ON page_studio_builds')
    expect((await reserve()).state).toBe('pending')
  })
  it('enforces source, scope and descriptor consistency on direct inserts', async () => {
    const retained = await reserve()
    const row = (await db.query('SELECT * FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0]
    for (const change of [
      { renderer: 'legacy' }, { build_identity: {} }, { compiler_toolchain: null },
      { build_identity: { ...row.build_identity, scope: { ...scope, clientId: randomUUID() } } },
      { build_identity: { ...row.build_identity, source: { ...row.build_identity.source, versionDigest: 'e'.repeat(64) } } },
      { build_identity: { ...row.build_identity, source: { kind: 'checkpoint', checkpointId, checkpointDigest: digest } } },
      { compiler_toolchain: { ...toolchain, image: 'registry.cloudflare.com/test-account/astro-compiler:latest' } }
    ]) {
      await expect(db.query('INSERT INTO page_studio_builds SELECT * FROM jsonb_populate_record(NULL::page_studio_builds,$1::jsonb)', [JSON.stringify({ ...row, ...change })])).rejects.toMatchObject({ code: '23514', constraint: 'page_studio_build_renderer_identity' })
    }
  })
  it.each(['tenantId', 'clientId', 'siteId'] as const)('denies foreign %s without admission', async (key) => {
    await expect(reserve({ scope: { ...scope, [key]: key === 'tenantId' ? 'foreign' : randomUUID() } })).rejects.toThrow()
    expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(0)
  })
  it('serializes simultaneous retries into one retained identity and admission', async () => {
    const other = new pg.Client({ connectionString: databaseUrl })
    await other.connect()
    await other.query(`SET search_path TO "${schema}", pg_catalog`)
    try {
      const [left, right] = await Promise.all([reserve(), transact(other, client => reserveAstroReleaseBuild(client, input(), () => toolchain))])
      expect(left).toEqual(right)
      expect((await db.query('SELECT * FROM page_studio_build_admissions')).rows).toHaveLength(1)
    } finally { await other.end() }
  })
  it('preserves the original accounting month and does not double-count the retained build', async () => {
    await db.query('UPDATE page_studio_entitlements SET monthly_build_limit=2')
    const first = await reserve()
    await db.query('UPDATE page_studio_build_admissions SET created_at=date_trunc(\'month\',NOW())-INTERVAL \'1 day\'')
    expect((await reserve()).buildId).toBe(first.buildId)
    await runTransaction(client => client.query('SELECT admit_page_studio_build($1,$2,$3,\'release\',\'build_second\')', Object.values(scope)))
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_build_admissions')).rows[0].count).toBe(2)
  })
  it('protects Astro source and toolchain columns while permitting operational updates', async () => {
    const retained = await reserve()
    for (const mutation of ['renderer=\'legacy\'', 'compiler_toolchain=\'{}\'::jsonb', 'build_identity_digest=repeat(\'9\',64)', 'version_digest=repeat(\'9\',64)', 'idempotency_key=\'changed\'', 'build_identity=\'{}\'::jsonb']) {
      await expect(db.query(`UPDATE page_studio_builds SET ${mutation} WHERE id=$1`, [retained.buildId])).rejects.toThrow('ASTRO_BUILD_IDENTITY_IMMUTABLE')
    }
    await db.query('UPDATE page_studio_builds SET state=\'failed\',failure_summary=\'synthetic\',release_metadata=\'{}\'::jsonb WHERE id=$1', [retained.buildId])
  })
  it('keeps legacy persistence and failure recovery separate from an Astro row', async () => {
    const retained = await reserve()
    await db.query('UPDATE page_studio_sites SET current_release_id=NULL')
    await db.query('DELETE FROM page_studio_release_pointers')
    await db.query('DELETE FROM page_studio_releases')
    await db.query('DELETE FROM page_studio_builds WHERE id=$1', [legacyResult.buildId])
    const authority = await runTransaction(client => readApprovedBuildAuthority(client, { tenantId: scope.tenantId, siteId: scope.siteId, versionId }))
    const legacyInput = { tenantId: scope.tenantId, siteId: scope.siteId, versionId, actorId, assets: [], manifest: {}, idempotencyKey: 'legacy-build' }
    expect((await persistSuccessfulBuild(legacyInput, authority, legacyResult, runTransaction)).buildId).toBe(legacyResult.buildId)
    await db.query('DELETE FROM page_studio_builds WHERE id=$1', [legacyResult.buildId])
    await expect(buildApprovedPageStudioVersion(legacyInput, { queryOne: async () => authority as never, runTransaction, worker: { build: async () => {
      throw new Error('synthetic worker failure')
    } } })).rejects.toMatchObject({ code: 'BUILD_WORKER_UNAVAILABLE' })
    expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [retained.buildId])).rows[0].state).toBe('pending')
    expect((await db.query('SELECT state FROM page_studio_builds WHERE id=$1', [legacyResult.buildId])).rows[0].state).toBe('failed')
  })
  it('denies Astro activation and preserves historical rollback with metadata restoration', async () => {
    const retained = await reserve()
    await db.query('UPDATE page_studio_builds SET state=\'succeeded\' WHERE id=$1', [retained.buildId])
    await expect(activatePageStudioRelease({ ...activateInput(), buildId: retained.buildId, expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'astro-activation' }, { runTransaction })).rejects.toMatchObject({ code: 'RELEASE_RECORD_INVALID' })
    expect((await db.query('SELECT COUNT(*)::int AS count FROM page_studio_releases')).rows[0].count).toBe(1)
    const second = await activatePageStudioRelease({ ...activateInput(), expectedActiveReleaseId: legacyReleaseId, idempotencyKey: 'second-release' }, { runTransaction })
    await db.query('UPDATE page_studio_sites SET theme=\'{}\'::jsonb')
    await rollbackPageStudioRelease({ ...activateInput(), expectedActiveReleaseId: second.releaseId, targetReleaseId: legacyReleaseId, idempotencyKey: 'rollback' }, { runTransaction })
    expect((await db.query('SELECT current_release_id,theme FROM page_studio_sites')).rows[0]).toEqual({ current_release_id: legacyReleaseId, theme: { label: 'historical' } })
  })
})
