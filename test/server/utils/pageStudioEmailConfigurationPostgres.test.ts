import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest'
import {
  readPageStudioEmailConfiguration,
  writePageStudioEmailConfiguration
} from '~~/workers/page-studio-management/src/emailConfiguration'

const databaseUrl = process.env.PAGE_STUDIO_EMAIL_DATABASE_TEST_URL
const siteId = randomUUID(),
  clientId = randomUUID(),
  actorId = randomUUID(),
  entitlementId = randomUUID()
const settings = {
  senderName: 'Synthetic Fleet',
  fromAddress: 'sender@example.invalid',
  replyTo: 'reply@example.invalid',
  notificationRecipient: 'staff@example.invalid',
  inboundAddress: '',
  forwardingDestination: ''
}
const request = {
  siteId,
  actor: {
    role: 'agency' as const,
    actorId,
    tenantId: 'selected',
    canEdit: true
  },
  env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }
}
const portal = {
  ...request,
  actor: { role: 'client' as const, actorId, clientId }
}
describe.runIf(Boolean(databaseUrl))(
  'customer email configuration on disposable PostgreSQL',
  () => {
    let pool: pg.Pool, admin: pg.PoolClient
    const schema = `email_${randomUUID().replaceAll('-', '')}`
    const migration = readFileSync(
      'server/database/migrations/418_page_studio_email_configuration.sql',
      'utf8'
    )
    const transaction = async <T>(work: (db: pg.PoolClient) => Promise<T>) => {
      const db = await pool.connect()
      try {
        await db.query('BEGIN')
        await db.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
        await db.query('SET LOCAL statement_timeout=\'5s\'')
        const result = await work(db)
        await db.query('COMMIT')
        return result
      } catch (error) {
        await db.query('ROLLBACK')
        throw error
      } finally {
        db.release()
      }
    }
    const read = (input = request) =>
      readPageStudioEmailConfiguration(input, { transaction })
    const write = (
      expectedRevision = 0,
      input: typeof request | typeof portal = request
    ) =>
      writePageStudioEmailConfiguration(
        { ...input, body: { expectedRevision, settings } },
        { transaction }
      )
    const counts = async () =>
      (
        await admin.query(
          'SELECT email_configuration, (SELECT COUNT(*)::int FROM page_studio_audit_events) AS audits FROM page_studio_sites'
        )
      ).rows[0]
    beforeAll(async () => {
      expect(['localhost', '127.0.0.1']).toContain(
        new URL(databaseUrl!).hostname
      )
      pool = new pg.Pool({ connectionString: databaseUrl, max: 4 })
      admin = await pool.connect()
      await admin.query(`CREATE SCHEMA "${schema}"`)
      await admin.query(`SET search_path TO "${schema}", pg_catalog`)
      await admin.query(`CREATE TABLE team_members (id uuid PRIMARY KEY, user_role text, custom_role_id uuid, is_active boolean);
      CREATE TABLE custom_roles (id uuid PRIMARY KEY, slug text, is_system boolean, is_read_only boolean);
      CREATE TABLE role_permission_groups (role_id uuid, permission_group text);
      CREATE TABLE agency_clients (id uuid PRIMARY KEY, is_active boolean);
      CREATE TABLE client_users (id uuid PRIMARY KEY, client_id uuid, role text, status text);
      CREATE TABLE page_studio_entitlements (id uuid PRIMARY KEY, tenant_id text, client_id uuid, status text, effective_from timestamptz, effective_until timestamptz);
      CREATE TABLE page_studio_sites (id uuid PRIMARY KEY, tenant_id text, client_id uuid, entitlement_id uuid, status text, updated_at timestamptz,
        current_release_id uuid, current_version_id uuid, current_checkpoint_id text, default_locale text, theme jsonb, navigation jsonb, footer jsonb, seo_defaults jsonb, integrations jsonb DEFAULT '{}');
      CREATE TABLE page_studio_site_memberships (tenant_id text, client_id uuid, site_id uuid, user_id uuid, role text);
      CREATE TABLE page_studio_audit_events (tenant_id text, client_id uuid, site_id uuid, actor_id text, actor_role text, action text, resource_type text, resource_id text, metadata jsonb);
      CREATE TABLE page_studio_releases (id uuid PRIMARY KEY, tenant_id text, client_id uuid, site_id uuid, build_id text);
      CREATE TABLE page_studio_builds (id text PRIMARY KEY, tenant_id text, client_id uuid, site_id uuid, version_id uuid, release_metadata jsonb);
      CREATE TABLE page_studio_versions (id uuid PRIMARY KEY, tenant_id text, client_id uuid, site_id uuid, checkpoint_id text);`)
      await admin.query(migration)
      await admin.query(
        readFileSync(
          'server/database/migrations/414_page_studio_atomic_release_metadata.sql',
          'utf8'
        )
      )
    })
    afterAll(async () => {
      if (admin) {
        try {
          await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
        } finally {
          admin.release()
        }
      }
      await pool?.end()
    })
    beforeEach(async () => {
      await admin.query(
        `TRUNCATE team_members, custom_roles, role_permission_groups, page_studio_sites, page_studio_entitlements, agency_clients, client_users, page_studio_site_memberships, page_studio_audit_events, page_studio_releases, page_studio_builds, page_studio_versions`
      )
      await admin.query(
        'INSERT INTO team_members VALUES ($1,\'owner\',NULL,TRUE)',
        [actorId]
      )
      await admin.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [
        clientId
      ])
      await admin.query(
        'INSERT INTO client_users VALUES ($1,$2,\'manager\',\'active\')',
        [actorId, clientId]
      )
      await admin.query(
        'INSERT INTO page_studio_entitlements VALUES ($1,\'selected\',$2,\'trial\',NOW()-INTERVAL \'1 hour\',NOW()+INTERVAL \'1 hour\')',
        [entitlementId, clientId]
      )
      await admin.query(
        'INSERT INTO page_studio_sites (id,tenant_id,client_id,entitlement_id,status) VALUES ($1,\'selected\',$2,$3,\'draft\')',
        [siteId, clientId, entitlementId]
      )
      await admin.query(
        'INSERT INTO page_studio_site_memberships VALUES (\'selected\',$1,$2,$3,\'editor\')',
        [clientId, siteId, actorId]
      )
    })
    it('applies additive migration twice, defaults old sites and persists settings with redacted audit', async () => {
      await admin.query(migration)
      expect(await counts()).toEqual({ email_configuration: {}, audits: 0 })
      expect(await write()).toMatchObject({
        revision: 1,
        settings,
        readiness: { sendingEnabled: false }
      })
      expect(await read()).toMatchObject({ revision: 1, settings })
      expect((await counts()).audits).toBe(1)
      const audit = (
        await admin.query('SELECT metadata FROM page_studio_audit_events')
      ).rows[0].metadata
      expect(audit).toEqual({
        environment: 'staging',
        revision: 1,
        previousRevision: 0
      })
    })
    it('keeps staging and production independent without replacing the other environment', async () => {
      await write()
      const production = {
        ...request,
        env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production' }
      }
      expect(await read(production)).toMatchObject({
        revision: 0,
        settings: null
      })
      await write(0, production)
      await write(1)
      expect(await read(production)).toMatchObject({ revision: 1 })
      expect(await read()).toMatchObject({ revision: 2 })
    })
    it('serializes two actual overlapping saves: one revision succeeds and the stale one fails', async () => {
      let locked!: () => void, resume!: () => void
      const entered = new Promise<void>((resolve) => {
        locked = resolve
      })
      const barrier = new Promise<void>((resolve) => {
        resume = resolve
      })
      const first = writePageStudioEmailConfiguration(
        { ...request, body: { expectedRevision: 0, settings } },
        {
          transaction: work =>
            transaction(async (db) => {
              return work({
                query: async (sql, values) => {
                  const result = await db.query(sql, values)
                  if (sql.includes('FROM page_studio_sites')) {
                    locked()
                    await barrier
                  }
                  return result
                }
              })
            })
        }
      )
      await entered
      let attempting!: () => void
      const secondEntered = new Promise<void>((resolve) => {
        attempting = resolve
      })
      const second = writePageStudioEmailConfiguration(
        { ...request, body: { expectedRevision: 0, settings } },
        {
          transaction: work =>
            transaction(db =>
              work({
                query: (sql, values) => {
                  const result = db.query(sql, values)
                  if (sql.includes('FROM page_studio_sites')) attempting()
                  return result
                }
              })
            )
        }
      ).then(
        () => 'unexpected',
        error => error.statusCode
      )
      await secondEntered
      resume()
      expect(await first).toMatchObject({ revision: 1 })
      expect(await second).toBe(409)
      expect((await counts()).audits).toBe(1)
    })
    it.each(['agency', 'portal'] as const)(
      'denies %s identity revoked after the site lock but before save',
      async (audience) => {
        let entered!: () => void, resume!: () => void
        const locked = new Promise<void>((resolve) => {
          entered = resolve
        })
        const barrier = new Promise<void>((resolve) => {
          resume = resolve
        })
        const attempt = writePageStudioEmailConfiguration(
          {
            ...(audience === 'agency' ? request : portal),
            body: { expectedRevision: 0, settings }
          },
          {
            transaction: work =>
              transaction(db =>
                work({
                  query: async (sql, values) => {
                    const result = await db.query(sql, values)
                    if (sql.includes('FROM page_studio_sites')) {
                      entered()
                      await barrier
                    }
                    return result
                  }
                })
              )
          }
        ).then(
          () => 'unexpected',
          error => error.statusCode
        )
        await locked
        await admin.query(
          audience === 'agency'
            ? 'UPDATE team_members SET is_active=FALSE'
            : 'UPDATE client_users SET status=\'inactive\''
        )
        resume()
        expect(await attempt).toBe(403)
        expect(await counts()).toEqual({ email_configuration: {}, audits: 0 })
      }
    )
    it('rolls back preferences if the audit cannot be persisted', async () => {
      await admin.query(
        'ALTER TABLE page_studio_audit_events ADD CONSTRAINT reject_email_audit CHECK (action <> \'email.settings.updated\')'
      )
      try {
        await expect(write()).rejects.toThrow()
        expect(await counts()).toEqual({ email_configuration: {}, audits: 0 })
      } finally {
        await admin.query(
          'ALTER TABLE page_studio_audit_events DROP CONSTRAINT reject_email_audit'
        )
      }
    })
    it.each([
      'UPDATE team_members SET is_active=FALSE',
      'UPDATE team_members SET user_role=\'viewer\'',
      'UPDATE agency_clients SET is_active=FALSE',
      'UPDATE page_studio_sites SET status=\'archived\'',
      'UPDATE page_studio_sites SET status=\'suspended\'',
      'UPDATE page_studio_entitlements SET status=\'revoked\'',
      'UPDATE page_studio_entitlements SET effective_until=NOW()-INTERVAL \'1 minute\'',
      'UPDATE page_studio_entitlements SET effective_from=NOW()+INTERVAL \'1 hour\'',
      'UPDATE page_studio_entitlements SET tenant_id=\'foreign\''
    ])('denies scope revocation without saving: %s', async (sql) => {
      await admin.query(sql)
      await expect(write()).rejects.toHaveProperty('statusCode')
      expect(await counts()).toEqual({ email_configuration: {}, audits: 0 })
    })
    it.each([
      'DELETE FROM page_studio_site_memberships',
      'UPDATE page_studio_site_memberships SET tenant_id=\'foreign\'',
      'UPDATE page_studio_site_memberships SET role=\'viewer\'',
      'UPDATE client_users SET role=\'viewer\'',
      'UPDATE client_users SET status=\'inactive\''
    ])('denies fresh portal revocation: %s', async (sql) => {
      await admin.query(sql)
      await expect(write(0, portal)).rejects.toMatchObject({ statusCode: 403 })
      expect(await counts()).toEqual({ email_configuration: {}, audits: 0 })
    })
    it('permits portal managers with exact editor membership and denies foreign client/site/tenant', async () => {
      expect(await write(0, portal)).toMatchObject({ revision: 1 })
      await expect(
        write(1, {
          ...portal,
          actor: { ...portal.actor, clientId: randomUUID() }
        })
      ).rejects.toMatchObject({ statusCode: 404 })
      await expect(
        read({ ...request, siteId: randomUUID() })
      ).rejects.toMatchObject({ statusCode: 404 })
      await expect(
        read({ ...request, actor: { ...request.actor, tenantId: 'foreign' } })
      ).rejects.toMatchObject({ statusCode: 404 })
    })
    it('rechecks custom role grants and read-only policy instead of cached actor permission', async () => {
      const roleId = randomUUID()
      await admin.query(
        'INSERT INTO custom_roles VALUES ($1,\'email-editor\',FALSE,FALSE)',
        [roleId]
      )
      await admin.query('UPDATE team_members SET custom_role_id=$1', [roleId])
      await admin.query(
        'INSERT INTO role_permission_groups VALUES ($1,\'PAGE_STUDIO_VIEW\'),($1,\'PAGE_STUDIO_EDIT\')',
        [roleId]
      )
      expect(await write()).toMatchObject({ revision: 1 })
      await admin.query(
        'DELETE FROM role_permission_groups WHERE permission_group=\'PAGE_STUDIO_EDIT\''
      )
      expect(await read()).toMatchObject({ canEdit: false })
      await expect(write(1)).rejects.toMatchObject({ statusCode: 403 })
      await admin.query(
        'INSERT INTO role_permission_groups VALUES ($1,\'PAGE_STUDIO_EDIT\')',
        [roleId]
      )
      await admin.query('UPDATE custom_roles SET is_read_only=TRUE')
      await expect(write(1)).rejects.toMatchObject({ statusCode: 403 })
      expect((await counts()).audits).toBe(1)
    })
    it('returns a safe setup-pending response when migration 418 is absent', async () => {
      await admin.query(
        'ALTER TABLE page_studio_sites RENAME COLUMN email_configuration TO pending_email_configuration'
      )
      try {
        await expect(read()).rejects.toMatchObject({
          statusCode: 503,
          code: 'EMAIL_SCHEMA_PENDING'
        })
      } finally {
        await admin.query(
          'ALTER TABLE page_studio_sites RENAME COLUMN pending_email_configuration TO email_configuration'
        )
      }
    })
    it('rejects malformed environment maps at the database constraint', async () => {
      for (const value of [
        [],
        { preview: {} },
        { staging: null },
        { production: [] }
      ]) {
        await expect(
          admin.query('UPDATE page_studio_sites SET email_configuration=$1', [
            JSON.stringify(value)
          ])
        ).rejects.toMatchObject({ code: '23514' })
      }
    })
    it('preserves preferences when the real release metadata trigger publishes and restores another version', async () => {
      await write()
      const before = (await counts()).email_configuration
      for (let index = 0; index < 2; index++) {
        const releaseId = randomUUID(),
          versionId = randomUUID(),
          buildId = randomUUID()
        await admin.query(
          'INSERT INTO page_studio_versions VALUES ($1,\'selected\',$2,$3,$4)',
          [versionId, clientId, siteId, `checkpoint-${index}`]
        )
        await admin.query(
          'INSERT INTO page_studio_builds VALUES ($1,\'selected\',$2,$3,$4,$5)',
          [
            buildId,
            clientId,
            siteId,
            versionId,
            {
              theme: {},
              navigation: {},
              footer: {},
              seoDefaults: {},
              integrations: { crm: index },
              defaultLocale: 'en-AU'
            }
          ]
        )
        await admin.query(
          'INSERT INTO page_studio_releases VALUES ($1,\'selected\',$2,$3,$4)',
          [releaseId, clientId, siteId, buildId]
        )
        await admin.query(
          'UPDATE page_studio_sites SET current_release_id=$1',
          [releaseId]
        )
        expect((await counts()).email_configuration).toEqual(before)
        expect(
          (
            await admin.query(
              'SELECT current_checkpoint_id FROM page_studio_sites'
            )
          ).rows[0].current_checkpoint_id
        ).toBe(`checkpoint-${index}`)
      }
    })
  }
)
