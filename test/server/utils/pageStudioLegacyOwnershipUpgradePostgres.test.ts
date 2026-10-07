import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL
const migration = (name: string) => readFileSync(new URL(`../../../server/database/migrations/${name}`, import.meta.url), 'utf8')
const ownershipMigration = '444_page_studio_customer_site_ownership.sql'
const preservedTables = [
  'agency_clients', 'client_users', 'page_studio_entitlements', 'page_studio_sites',
  'page_studio_site_memberships', 'page_studio_checkpoints', 'page_studio_versions',
  'page_studio_reviews', 'page_studio_builds', 'page_studio_releases',
  'page_studio_release_pointers', 'page_studio_audit_events', 'page_studio_domains',
  'page_studio_assets', 'page_studio_customer_identities', 'page_studio_customer_workspaces',
  'page_studio_workspace_memberships', 'page_studio_workspace_client_bindings'
] as const

describe.runIf(Boolean(databaseUrl))('populated legacy ownership upgrade on disposable PostgreSQL', () => {
  let db: pg.Client | undefined
  let schema: string
  let sites: Awaited<ReturnType<typeof seedSite>>[]
  const seedSite = async (status: 'active' | 'archived') => {
    const client = randomUUID(), user = randomUUID(), staff = randomUUID()
    const entitlement = randomUUID(), site = randomUUID(), version = randomUUID(), release = randomUUID()
    const checkpoint = `checkpoint-${site}`, build = `build-${site}`, digest = 'a'.repeat(64)
    const tenant = `tenant-${status}`, hostname = `${status}.example.test`
    await db!.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [client])
    await db!.query('INSERT INTO client_users VALUES ($1, $2)', [user, client])
    await db!.query('INSERT INTO team_members VALUES ($1)', [staff])
    await db!.query(`INSERT INTO page_studio_entitlements (id, tenant_id, client_id, plan_metadata)
      VALUES ($1, $2, $3, '{"legacy":"preserve"}')`, [entitlement, tenant, client])
    await db!.query(`INSERT INTO page_studio_sites
      (id, tenant_id, client_id, entitlement_id, name, route, starter_version, status, theme, navigation)
      VALUES ($1, $2, $3, $4, 'Existing website', $5, 'legacy-v1', $5, '{"brand":"legacy"}', '[{"label":"Contact"}]')`,
    [site, tenant, client, entitlement, status])
    const scope = [tenant, client, site]
    await db!.query(`INSERT INTO page_studio_site_memberships (tenant_id, client_id, site_id, user_id, role)
      VALUES ($1, $2, $3, $4, 'editor')`, [...scope, user])
    await db!.query(`INSERT INTO page_studio_checkpoints (tenant_id, client_id, site_id, id, digest, object_key, etag, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'retained-etag', NOW())`, [...scope, checkpoint, digest, `${site}/checkpoint.json`])
    await db!.query(`INSERT INTO page_studio_versions
      (tenant_id, client_id, site_id, id, checkpoint_id, digest, author_id, author_role, summary, status, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'agency', 'Retained version', 'published', 'version-key')`,
    [...scope, version, checkpoint, digest, staff])
    await db!.query(`INSERT INTO page_studio_reviews (tenant_id, client_id, site_id, version_id, version_digest, reviewer_id, decision)
      VALUES ($1, $2, $3, $4, $5, $6, 'approved')`, [...scope, version, digest, staff])
    await db!.query(`INSERT INTO page_studio_builds
      (tenant_id, client_id, site_id, id, version_id, version_digest, artifact_prefix, release_manifest_key,
       release_manifest_digest, validation_report_key, state, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'manifest.json', $6, 'validation.json', 'succeeded', 'build-key')`,
    [...scope, build, version, digest, `${site}/artifacts/`])
    await db!.query(`INSERT INTO page_studio_releases
      (tenant_id, client_id, site_id, id, build_id, environment, normalized_hostname, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, 'production', $6, 'release-key')`, [...scope, release, build, hostname])
    await db!.query(`INSERT INTO page_studio_release_pointers
      (tenant_id, client_id, site_id, environment, normalized_hostname, active_release_id, pointer_version)
      VALUES ($1, $2, $3, 'production', $4, $5, 7)`, [...scope, hostname, release])
    await db!.query(`UPDATE page_studio_sites SET current_checkpoint_id = $2, current_version_id = $3,
      current_release_id = $4 WHERE id = $1`, [site, checkpoint, version, release])
    await db!.query(`INSERT INTO page_studio_audit_events
      (tenant_id, client_id, site_id, actor_id, actor_role, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, $4, 'agency', 'site.published', 'release', $5, '{"retained":true}')`, [...scope, staff, release])
    await db!.query(`INSERT INTO page_studio_domains (tenant_id, client_id, site_id, normalized_hostname, lifecycle_state)
      VALUES ($1, $2, $3, $4, 'active')`, [...scope, hostname])
    await db!.query(`INSERT INTO page_studio_assets
      (tenant_id, client_id, site_id, r2_prefix, media_type, alt_text, scan_status, publication_status, created_by)
      VALUES ($1, $2, $3, 'media/logo', 'image/png', 'Existing logo', 'clean', 'published', $4)`, [...scope, user])
    return { client, user, site, tenant, entitlement, release, checkpoint }
  }
  const snapshot = async () => {
    const rows: Record<string, unknown[]> = {}
    for (const table of preservedTables) {
      rows[table] = (await db!.query(`SELECT to_jsonb(row) AS value FROM ${table} row ORDER BY to_jsonb(row)::text`)).rows
    }
    return rows
  }

  beforeEach(async () => {
    expect(['127.0.0.1', 'localhost']).toContain(new URL(databaseUrl!).hostname)
    schema = `legacy_upgrade_${randomUUID().replaceAll('-', '')}`
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query(`
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID REFERENCES agency_clients(id));
      CREATE TABLE team_members (id UUID PRIMARY KEY);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT, UNIQUE (role_id, permission_group));
    `)
    await db.query(migration('402_page_studio_control_plane.sql'))
    await db.query(migration('442_page_studio_customer_workspaces.sql'))
    sites = [await seedSite('active'), await seedSite('archived')]
    const identity = randomUUID(), workspace = randomUUID()
    await db.query(`INSERT INTO page_studio_customer_identities (id, issuer, subject, portal_user_id, verified_at)
      VALUES ($1, 'portal', $2::uuid::text, $2::uuid, NOW())`, [identity, sites[0]!.user])
    await db.query(`INSERT INTO page_studio_customer_workspaces (id, name, created_by, creation_request_id)
      VALUES ($1, 'Existing invited workspace', $2, $3)`, [workspace, identity, randomUUID()])
    await db.query(`INSERT INTO page_studio_workspace_memberships (workspace_id, identity_id, role)
      VALUES ($1, $2, 'owner')`, [workspace, identity])
    await db.query(`INSERT INTO page_studio_workspace_client_bindings (workspace_id, tenant_id, client_id)
      VALUES ($1, $2, $3)`, [workspace, sites[0]!.tenant, sites[0]!.client])
  })
  afterEach(async () => {
    if (!db) return
    try {
      await db.query('ROLLBACK')
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await db.end()
      db = undefined
    }
  })

  it('preserves populated active and archived site graphs and existing invited ownership on first apply and replay', async () => {
    expect((await db!.query('SELECT to_regclass(\'page_studio_business_owners\') AS owners')).rows[0].owners).toBeNull()
    const before = await snapshot()
    for (const phase of ['first apply', 'replay']) {
      await db!.query(migration(ownershipMigration))
      expect(await snapshot(), phase).toEqual(before)
      expect((await db!.query('SELECT id, agency_client_id, workspace_id FROM page_studio_business_owners ORDER BY id')).rows)
        .toEqual(sites.map(({ client }) => ({ id: client, agency_client_id: client, workspace_id: null })).sort((a, b) => a.id.localeCompare(b.id)))
    }
  })

  it('retains compound scope and deletion protection and permits ordinary legacy edits after upgrading populated sites', async () => {
    await db!.query(migration(ownershipMigration))
    const [a, b] = sites
    await expect(db!.query('UPDATE page_studio_sites SET entitlement_id = $2 WHERE id = $1', [a!.site, b!.entitlement]))
      .rejects.toMatchObject({ code: '23503' })
    await expect(db!.query('UPDATE page_studio_sites SET current_checkpoint_id = $2 WHERE id = $1', [a!.site, b!.checkpoint]))
      .rejects.toMatchObject({ code: '23503' })
    await expect(db!.query('UPDATE page_studio_release_pointers SET active_release_id = $2 WHERE site_id = $1', [a!.site, b!.release]))
      .rejects.toMatchObject({ code: '23503' })
    await expect(db!.query('DELETE FROM agency_clients WHERE id = $1', [a!.client])).rejects.toMatchObject({ code: '23503' })
    await expect(db!.query('DELETE FROM page_studio_business_owners WHERE id = $1', [b!.client])).rejects.toMatchObject({ code: '23503' })
    await db!.query('UPDATE page_studio_sites SET name = \'Edited legacy website\' WHERE id = $1', [a!.site])
    expect((await db!.query('SELECT name, client_id, current_release_id FROM page_studio_sites WHERE id = $1', [a!.site])).rows[0])
      .toEqual({ name: 'Edited legacy website', client_id: a!.client, current_release_id: a!.release })
  })
})
