import { readFileSync } from 'node:fs'
import pg from 'pg'
import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.PAGE_STUDIO_DATABASE_TEST_URL
const migrationSql = readFileSync(
  new URL('../../server/database/migrations/402_page_studio_control_plane.sql', import.meta.url),
  'utf8'
)

const bootstrapSql = `
  CREATE TABLE team_members (
    id UUID PRIMARY KEY,
    user_role TEXT
  );
  CREATE TABLE agency_clients (
    id UUID PRIMARY KEY,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
  );
  CREATE TABLE client_users (
    id UUID PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES agency_clients(id),
    status TEXT NOT NULL,
    role TEXT NOT NULL,
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE custom_roles (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE
  );
  CREATE TABLE role_permission_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES custom_roles(id),
    permission_group VARCHAR(50) NOT NULL,
    UNIQUE (role_id, permission_group)
  );
  INSERT INTO custom_roles (id, slug) VALUES
    ('10000000-0000-4000-8000-000000000001', 'owner'),
    ('10000000-0000-4000-8000-000000000002', 'admin'),
    ('10000000-0000-4000-8000-000000000003', 'viewer');
`

describe.runIf(Boolean(databaseUrl))('Page Studio migration on disposable PostgreSQL', () => {
  it('applies twice and enforces scope, route, immutable review, and immutable audit constraints', async () => {
    const client = new pg.Client({ connectionString: databaseUrl })
    const schema = `page_studio_${Date.now().toString(36)}`

    await client.connect()
    try {
      await client.query(`CREATE SCHEMA "${schema}"`)
      await client.query(`SET search_path TO "${schema}", pg_catalog`)
      await client.query(bootstrapSql)
      await client.query(migrationSql)
      await client.query(`SET search_path TO "${schema}", pg_catalog`)
      await client.query(migrationSql)

      const relations = await client.query(
        `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = $1 AND table_name LIKE 'page_studio_%'`,
        [schema]
      )
      expect(relations.rows).toHaveLength(12)

      const roleGroups = await client.query(
        `SELECT cr.slug, array_agg(rpg.permission_group ORDER BY rpg.permission_group) AS groups
           FROM custom_roles cr
           LEFT JOIN role_permission_groups rpg ON rpg.role_id = cr.id
           GROUP BY cr.slug`
      )
      expect(roleGroups.rows.find(row => row.slug === 'owner')?.groups).toContain('PAGE_STUDIO_SUBSCRIPTIONS')
      expect(roleGroups.rows.find(row => row.slug === 'viewer')?.groups).toEqual([null])

      const tenantId = 'tenant-alpha'
      const clientId = '20000000-0000-4000-8000-000000000001'
      const teamId = '30000000-0000-4000-8000-000000000001'
      const portalId = '40000000-0000-4000-8000-000000000001'
      await client.query('INSERT INTO team_members (id, user_role) VALUES ($1, $2)', [teamId, 'owner'])
      await client.query('INSERT INTO agency_clients (id) VALUES ($1)', [clientId])
      await client.query(
        `INSERT INTO client_users (id, client_id, status, role, is_primary_contact)
           VALUES ($1, $2, 'active', 'manager', TRUE)`,
        [portalId, clientId]
      )
      const entitlement = await client.query(
        `INSERT INTO page_studio_entitlements (tenant_id, client_id, created_by)
           VALUES ($1, $2, $3) RETURNING id`,
        [tenantId, clientId, teamId]
      )
      const site = await client.query(
        `INSERT INTO page_studio_sites (
             tenant_id, client_id, entitlement_id, name, route, starter_version, created_by
           ) VALUES ($1, $2, $3, 'Campaign', 'campaign', 'automotive-campaign-v1', $4)
           RETURNING id`,
        [tenantId, clientId, entitlement.rows[0].id, teamId]
      )
      const siteId = site.rows[0].id

      await expect(client.query(
        `INSERT INTO page_studio_sites (
             tenant_id, client_id, entitlement_id, name, route, starter_version, created_by
           ) VALUES ($1, $2, $3, 'Duplicate', 'campaign', 'automotive-campaign-v1', $4)`,
        [tenantId, clientId, entitlement.rows[0].id, teamId]
      )).rejects.toMatchObject({ code: '23505' })

      await client.query(
        `INSERT INTO page_studio_checkpoints (
             id, tenant_id, client_id, site_id, digest, object_key, etag, author_id, created_at
           ) VALUES ('checkpoint_01', $1, $2, $3, $4, $5, 'etag-1', $6, NOW())`,
        [
          tenantId,
          clientId,
          siteId,
          'a'.repeat(64),
          `tenants/${tenantId}/clients/${clientId}/sites/${siteId}/checkpoints/checkpoint_01.json`,
          portalId
        ]
      )
      const version = await client.query(
        `INSERT INTO page_studio_versions (
             tenant_id, client_id, site_id, checkpoint_id, digest, author_id,
             author_role, summary, status, idempotency_key, submitted_at
           ) VALUES ($1, $2, $3, 'checkpoint_01', $4, $5, 'client',
                     'Ready for review', 'in_review', 'version-request-01', NOW())
           RETURNING id`,
        [tenantId, clientId, siteId, 'a'.repeat(64), portalId]
      )
      await expect(client.query(
        `INSERT INTO page_studio_reviews (
             tenant_id, client_id, site_id, version_id, version_digest,
             reviewer_id, decision
           ) VALUES ($1, $2, $3, $4, $5, $6, 'approved')`,
        [tenantId, clientId, siteId, version.rows[0].id, 'b'.repeat(64), teamId]
      )).rejects.toMatchObject({ code: '23503' })

      const review = await client.query(
        `INSERT INTO page_studio_reviews (
             tenant_id, client_id, site_id, version_id, version_digest,
             reviewer_id, decision
           ) VALUES ($1, $2, $3, $4, $5, $6, 'approved') RETURNING id`,
        [tenantId, clientId, siteId, version.rows[0].id, 'a'.repeat(64), teamId]
      )
      await expect(client.query(
        `UPDATE page_studio_reviews SET decision = 'rejected' WHERE id = $1`,
        [review.rows[0].id]
      )).rejects.toThrow(/append-only/)

      const audit = await client.query(
        `INSERT INTO page_studio_audit_events (
             tenant_id, client_id, site_id, actor_id, actor_role,
             action, resource_type, resource_id
           ) VALUES ($1, $2, $3, $4, 'agency', 'site.created', 'site', $5)
           RETURNING id`,
        [tenantId, clientId, siteId, teamId, siteId]
      )
      await expect(client.query(
        'DELETE FROM page_studio_audit_events WHERE id = $1',
        [audit.rows[0].id]
      )).rejects.toThrow(/append-only/)
    } finally {
      await client.query('SET search_path TO public, pg_catalog').catch(() => undefined)
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined)
      await client.end()
    }
  })
})
