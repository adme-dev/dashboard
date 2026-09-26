import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (url) {
  const target = new URL(url)
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(target.pathname) || target.search) throw new Error('Disposable localhost studio_cms database required')
}
const migrations = ['402_page_studio_control_plane', '413_page_studio_release_metadata', '414_page_studio_atomic_release_metadata', '428_page_studio_client_staging', '429_page_studio_checkpoint_staging_outbox', '433_page_studio_runtime_delivery']
const directory = new URL('../../../server/database/migrations/', import.meta.url)
const migration = (name: string) => readFileSync(new URL(`${name}.sql`, directory), 'utf8')

describe.runIf(Boolean(url))('runtime delivery migration on PostgreSQL', () => {
  let db: pg.Client, schema: string, clientId: string, siteId: string, checkpoint: string, versionId: string
  const tenant = 'runtime-test'
  const actor = '30000000-0000-4000-8000-000000000901'
  const digest = 'c'.repeat(64)
  const metadata = { defaultLocale: 'en-AU', footer: {}, integrations: {}, navigation: { items: [] }, seoDefaults: {}, theme: { tokens: {} } }

  beforeEach(async () => {
    db = new pg.Client({ connectionString: url })
    await db.connect()
    schema = `runtime_delivery_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog`)
    await db.query('CREATE TABLE team_members(id UUID PRIMARY KEY); CREATE TABLE agency_clients(id UUID PRIMARY KEY); CREATE TABLE client_users(id UUID PRIMARY KEY); CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT); CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group))')
    for (const name of migrations) await db.query(migration(name))
    clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1)', [clientId])
    const entitlement = (await db.query('INSERT INTO page_studio_entitlements(tenant_id,client_id) VALUES($1,$2) RETURNING id', [tenant, clientId])).rows[0]
    siteId = (await db.query('INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version) VALUES($1,$2,$3,\'Runtime\',\'runtime\',\'limousine-v1\') RETURNING id', [tenant, clientId, entitlement.id])).rows[0].id
    checkpoint = `checkpoint_${randomUUID().replaceAll('-', '')}`
    await db.query('INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,author_id,created_at) VALUES($1,$2,$3,$4,$5,$1,\'etag\',$6,NOW())', [checkpoint, tenant, clientId, siteId, digest, actor])
    versionId = (await db.query('INSERT INTO page_studio_versions(tenant_id,client_id,site_id,checkpoint_id,digest,author_id,author_role,summary,status,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,\'agency\',\'Runtime\',\'approved\',\'v1\') RETURNING id', [tenant, clientId, siteId, checkpoint, digest, actor])).rows[0].id
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })

  function reference(overrides: Record<string, unknown> = {}) {
    return { delivery: 'runtime', environment: 'production', scope: { clientId, siteId, tenantId: tenant }, versionDigest: digest, versionId, ...overrides }
  }
  async function insertRuntime(overrides: { environment?: string, release?: unknown, versionDigest?: string } = {}) {
    const environment = overrides.environment ?? 'production'
    return (await db.query(
      'INSERT INTO page_studio_releases(tenant_id,client_id,site_id,environment,normalized_hostname,idempotency_key,runtime_release,runtime_release_digest,runtime_version_id,runtime_version_digest,release_metadata) VALUES($1,$2,$3,$4,\'www.runtime.example\',$5,$6,$7,$8,$9,$10) RETURNING id',
      [tenant, clientId, siteId, environment, randomUUID(), overrides.release ?? reference({ environment }), 'd'.repeat(64), versionId, overrides.versionDigest ?? digest, metadata]
    )).rows[0].id as string
  }
  async function insertStaticBuild() {
    await db.query('INSERT INTO page_studio_builds(id,tenant_id,client_id,site_id,version_id,version_digest,artifact_prefix,release_manifest_key,release_manifest_digest,validation_report_key,state,idempotency_key) VALUES(\'build_a\',$1,$2,$3,$4,$5,\'p\',\'m\',$5,\'v\',\'succeeded\',\'b1\')', [tenant, clientId, siteId, versionId, digest])
  }

  it('keeps existing sites static and existing build releases valid', async () => {
    expect((await db.query('SELECT delivery_mode FROM page_studio_sites')).rows).toEqual([{ delivery_mode: 'static' }])
    await insertStaticBuild()
    await db.query('INSERT INTO page_studio_releases(tenant_id,client_id,site_id,build_id,environment,normalized_hostname,idempotency_key) VALUES($1,$2,$3,\'build_a\',\'production\',\'www.runtime.example\',\'r1\')', [tenant, clientId, siteId])
    await expect(db.query('UPDATE page_studio_sites SET delivery_mode=\'hybrid\'')).rejects.toThrow()
  })

  it('accepts a runtime release bound to its own scope, environment and version', async () => {
    const id = await insertRuntime()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects ambiguous, foreign or inconsistent runtime releases', async () => {
    await insertStaticBuild()
    await expect(db.query('INSERT INTO page_studio_releases(tenant_id,client_id,site_id,build_id,environment,normalized_hostname,idempotency_key,runtime_release,runtime_release_digest,runtime_version_id,runtime_version_digest) VALUES($1,$2,$3,\'build_a\',\'production\',\'h\',\'x\',$4,$5,$6,$7)', [tenant, clientId, siteId, reference(), 'd'.repeat(64), versionId, digest])).rejects.toThrow()
    await expect(insertRuntime({ release: reference({ scope: { clientId, siteId: randomUUID(), tenantId: tenant } }) })).rejects.toThrow()
    await expect(insertRuntime({ release: reference({ environment: 'staging' }) })).rejects.toThrow()
    await expect(insertRuntime({ environment: 'preview' })).rejects.toThrow()
    await expect(insertRuntime({ versionDigest: 'e'.repeat(64), release: reference({ versionDigest: 'e'.repeat(64) }) })).rejects.toThrow()
    await expect(db.query('INSERT INTO page_studio_releases(tenant_id,client_id,site_id,environment,normalized_hostname,idempotency_key) VALUES($1,$2,$3,\'production\',\'h\',\'y\')', [tenant, clientId, siteId])).rejects.toThrow()
  })

  it('keeps runtime releases immutable for rollback', async () => {
    const id = await insertRuntime()
    await expect(db.query('UPDATE page_studio_releases SET runtime_release=$1 WHERE id=$2', [reference({ versionId: randomUUID() }), id])).rejects.toThrow('RUNTIME_RELEASE_IMMUTABLE')
    await expect(db.query('DELETE FROM page_studio_releases WHERE id=$1', [id])).rejects.toThrow('RUNTIME_RELEASE_IMMUTABLE')
  })

  it('restores site metadata and version when a runtime release becomes current', async () => {
    const id = await insertRuntime()
    await db.query('UPDATE page_studio_sites SET current_release_id=$1', [id])
    const site = (await db.query('SELECT current_version_id, current_checkpoint_id, default_locale, navigation FROM page_studio_sites')).rows[0]
    expect(site).toEqual({ current_version_id: versionId, current_checkpoint_id: checkpoint, default_locale: 'en-AU', navigation: { items: [] } })
  })

  it('does not queue static staging builds for runtime sites', async () => {
    const origin = { formatVersion: 1, environment: 'staging', source: 'native-login', userId: actor, role: 'agency', loginSessionHash: 'a'.repeat(64) }
    const save = () => db.query('INSERT INTO page_studio_audit_events(id,tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,idempotency_key,metadata) VALUES($1::uuid,$2,$3,$4,$5,\'agency\',\'workspace.checkpointed\',\'checkpoint\',$6,$1::text,$7)', [randomUUID(), tenant, clientId, siteId, actor, checkpoint, { digest, commitProtocol: 'cas-v1', stagingOrigin: origin }])
    const queued = async () => (await db.query('SELECT count(*)::int AS n FROM page_studio_checkpoint_staging_outbox')).rows[0].n
    await save()
    expect(await queued()).toBe(1)
    await db.query('UPDATE page_studio_sites SET delivery_mode=\'runtime\'')
    await save()
    expect(await queued()).toBe(1)
  })

  it('refuses to activate a static staging snapshot once the site is runtime', async () => {
    await db.query('INSERT INTO page_studio_staging_sites(tenant_id,client_id,site_id,hostname,host_state,provider_domain_id,provider_verified_at) VALUES($1,$2,$3,$4,\'ready\',\'d\',NOW())', [tenant, clientId, siteId, `preview-${siteId.replaceAll('-', '')}.xeroflow.io`])
    const deployment = (await db.query('INSERT INTO page_studio_staging_deployments(tenant_id,client_id,site_id,actor_id,actor_role,idempotency_key,checkpoint_id,checkpoint_digest,state,artifact_prefix,artifact_manifest_digest,deployed_at) VALUES($1,$2,$3,$4,\'agency\',\'s1\',$5,$6,\'succeeded\',\'p\',$6,NOW()) RETURNING id', [tenant, clientId, siteId, actor, checkpoint, digest])).rows[0].id
    await db.query('UPDATE page_studio_sites SET delivery_mode=\'runtime\'')
    await expect(db.query('UPDATE page_studio_staging_sites SET active_deployment_id=$1', [deployment])).rejects.toThrow('STAGING_RUNTIME_DELIVERY')
    await db.query('UPDATE page_studio_sites SET delivery_mode=\'static\'')
    await db.query('UPDATE page_studio_staging_sites SET active_deployment_id=$1', [deployment])
  })
})
