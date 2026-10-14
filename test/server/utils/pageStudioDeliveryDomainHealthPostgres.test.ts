import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolvePageStudioReleaseHost, type PageStudioDeliveryQueryOne } from '~~/server/utils/pageStudio/delivery'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1'
    || !/^\/studio_cms_[a-z0-9_]+$/.test(target.pathname) || target.search) {
    throw new Error('Disposable localhost studio_cms database required')
  }
}

const migrationDirectory = new URL('../../../server/database/migrations/', import.meta.url)
const migrations = [
  '402_page_studio_control_plane', '413_page_studio_release_metadata',
  '430_page_studio_astro_build_identity', '431_page_studio_astro_release_receipt',
  '433_page_studio_runtime_delivery', '435_page_studio_runtime_features'
]

describe.runIf(Boolean(databaseUrl))('public release domain health on PostgreSQL', () => {
  let db: pg.Client
  let schema: string
  let clientId: string
  let siteId: string
  let entitlementId: string
  let releaseId: string
  const tenantId = 'domain-health-test'
  const hostname = 'www.customer.example'
  const stagingHostname = 'preview-customer.example'
  const digest = 'a'.repeat(64)
  const buildId = `build_${digest.slice(0, 32)}`
  const queryOne: PageStudioDeliveryQueryOne = async <T>(sql: string, params?: unknown[]) =>
    (await db.query(sql, params)).rows[0] as T ?? null

  beforeEach(async () => {
    db = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 })
    await db.connect()
    schema = `delivery_domain_${randomUUID().replaceAll('-', '')}`
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}", pg_catalog`)
    await db.query(`CREATE TABLE team_members(id UUID PRIMARY KEY);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY);
      CREATE TABLE client_users(id UUID PRIMARY KEY);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups(role_id UUID, permission_group TEXT, UNIQUE(role_id,permission_group))`)
    for (const migration of migrations) {
      await db.query(readFileSync(new URL(`${migration}.sql`, migrationDirectory), 'utf8'))
    }
    clientId = randomUUID()
    await db.query('INSERT INTO agency_clients VALUES($1)', [clientId])
    entitlementId = (await db.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,effective_from)
      VALUES($1,$2,NOW() - interval '1 day') RETURNING id`, [tenantId, clientId])).rows[0].id
    siteId = (await db.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,status)
      VALUES($1,$2,$3,'Customer','customer','test-v1','active') RETURNING id`, [tenantId, clientId, entitlementId])).rows[0].id
    await db.query(`INSERT INTO page_studio_checkpoints(id,tenant_id,client_id,site_id,digest,object_key,etag,created_at)
      VALUES('checkpoint_test',$1,$2,$3,$4,'test-checkpoint','test-etag',NOW())`, [tenantId, clientId, siteId, digest])
    const versionId = (await db.query(`INSERT INTO page_studio_versions(tenant_id,client_id,site_id,checkpoint_id,digest,author_id,author_role,summary,status,idempotency_key)
      VALUES($1,$2,$3,'checkpoint_test',$4,$5,'agency','Approved test version','approved','version') RETURNING id`,
    [tenantId, clientId, siteId, digest, randomUUID()])).rows[0].id
    const prefix = `tenants/${tenantId}/clients/${clientId}/sites/${siteId}/builds/${digest}`
    await db.query(`INSERT INTO page_studio_builds(id,tenant_id,client_id,site_id,version_id,version_digest,artifact_prefix,
      release_manifest_key,release_manifest_digest,validation_report_key,state,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$6,$9,'succeeded','build')`,
    [buildId, tenantId, clientId, siteId, versionId, digest, prefix, `${prefix}/release-manifest.json`, `${prefix}/validation.json`])
    releaseId = (await db.query(`INSERT INTO page_studio_releases(tenant_id,client_id,site_id,build_id,environment,normalized_hostname,idempotency_key)
      VALUES($1,$2,$3,$4,'production',$5,'release') RETURNING id`, [tenantId, clientId, siteId, buildId, hostname])).rows[0].id
    await db.query(`INSERT INTO page_studio_release_pointers(tenant_id,client_id,site_id,environment,normalized_hostname,active_release_id)
      VALUES($1,$2,$3,'production',$4,$5)`, [tenantId, clientId, siteId, hostname, releaseId])
    await db.query(`INSERT INTO page_studio_domains(tenant_id,client_id,site_id,normalized_hostname,cloudflare_hostname_id,
      hostname_status,tls_status,dns_status,lifecycle_state,verified_at)
      VALUES($1,$2,$3,$4,'cf-test','active','active','active','active',NOW())`, [tenantId, clientId, siteId, hostname])
  })

  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      if (schema) await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally { await db.end() }
  })

  it.each(['active', 'verified'])('resolves production with an exact scoped healthy %s domain', async (lifecycle) => {
    await db.query('UPDATE page_studio_domains SET lifecycle_state=$1', [lifecycle])
    await expect(resolvePageStudioReleaseHost(hostname, { queryOne })).resolves.toMatchObject({
      hostname, release: { releaseId, buildId, environment: 'production', scope: { tenantId, clientId, siteId } }
    })
  })

  it.each([
    ['failed lifecycle', "lifecycle_state='failed'"],
    ['detached lifecycle', "lifecycle_state='detached'"],
    ['pending lifecycle', "lifecycle_state='pending'"],
    ['unhealthy hostname', "hostname_status='pending'"],
    ['unhealthy TLS', "tls_status='pending'"],
    ['unhealthy DNS', "dns_status='pending'"],
    ['missing verification', 'verified_at=NULL']
  ])('stops serving an existing production release after %s', async (_label, update) => {
    await db.query(`UPDATE page_studio_domains SET ${update}`)
    await expect(resolvePageStudioReleaseHost(hostname, { queryOne })).resolves.toBeNull()
  })

  it('does not serve a production pointer after the domain record is removed', async () => {
    await db.query('DELETE FROM page_studio_domains')
    await expect(resolvePageStudioReleaseHost(hostname, { queryOne })).resolves.toBeNull()
  })

  it('does not borrow another hostname belonging to the same site', async () => {
    await db.query("UPDATE page_studio_domains SET normalized_hostname='other.customer.example'")
    await expect(resolvePageStudioReleaseHost(hostname, { queryOne })).resolves.toBeNull()
  })

  it('does not borrow a healthy hostname now attached to another site', async () => {
    const otherSite = (await db.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,status)
      VALUES($1,$2,$3,'Other customer site','other-customer','test-v1','active') RETURNING id`, [tenantId, clientId, entitlementId])).rows[0].id
    await db.query('UPDATE page_studio_domains SET site_id=$1', [otherSite])
    await expect(resolvePageStudioReleaseHost(hostname, { queryOne })).resolves.toBeNull()
  })

  it.each(['missing', 'failed'])('keeps staging available with a %s production domain', async (domainState) => {
    const stagingReleaseId = (await db.query(`INSERT INTO page_studio_releases(tenant_id,client_id,site_id,build_id,environment,normalized_hostname,idempotency_key)
      VALUES($1,$2,$3,$4,'staging',$5,'staging-release') RETURNING id`, [tenantId, clientId, siteId, buildId, stagingHostname])).rows[0].id
    await db.query(`INSERT INTO page_studio_release_pointers(tenant_id,client_id,site_id,environment,normalized_hostname,active_release_id)
      VALUES($1,$2,$3,'staging',$4,$5)`, [tenantId, clientId, siteId, stagingHostname, stagingReleaseId])
    if (domainState === 'missing') await db.query('DELETE FROM page_studio_domains')
    else await db.query("UPDATE page_studio_domains SET lifecycle_state='failed'")
    await expect(resolvePageStudioReleaseHost(stagingHostname, { queryOne })).resolves.toMatchObject({
      hostname: stagingHostname, release: { releaseId: stagingReleaseId, environment: 'staging' }
    })
  })
})
