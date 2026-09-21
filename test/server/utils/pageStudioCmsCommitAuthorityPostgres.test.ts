import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withCmsCommitAuthority } from '~~/server/utils/pageStudio/cmsCommitAuthority'
import type { ContentAuthorityRequest } from '~~/server/utils/pageStudio/businessContent'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'

vi.mock('~~/server/utils/db', () => ({
  transactionWithoutRetry: () => {
    throw new Error('Use disposable transaction')
  },
  queryOneFresh: () => {
    throw new Error('Use locked transaction')
  }
}))
const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1'
    || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname)
    || url.search
  )
    throw new Error('Disposable localhost studio_cms database required')
}
describe.runIf(Boolean(databaseUrl))(
  'CMS commit authority on disposable PostgreSQL',
  () => {
    let observer: pg.Client,
      connections: pg.Client[],
      schema: string,
      scope: PageStudioContentScope,
      request: ContentAuthorityRequest
    async function connect() {
      const db = new pg.Client({ connectionString: databaseUrl })
      await db.connect()
      connections.push(db)
      await db.query(`SET search_path TO "${schema}", pg_catalog`)
      await db.query('SET statement_timeout=\'6s\'')
      return db
    }
    function transactionFor(db: pg.Client) {
      return async <T>(
        work: (db: PageStudioControlQueryClient) => Promise<T>
      ) => {
        await db.query('BEGIN')
        try {
          const result = await work(
            db as unknown as PageStudioControlQueryClient
          )
          await db.query('COMMIT')
          return result
        } catch (error) {
          await db.query('ROLLBACK')
          throw error
        }
      }
    }
    async function run(
      mutation:
        | 'business-content'
        | 'collection-record'
        | 'collection-schema' = 'collection-record',
      work: (db: PageStudioControlQueryClient) => Promise<unknown> = db =>
        db.query('INSERT INTO visible_effects DEFAULT VALUES')
    ) {
      return withCmsCommitAuthority(
        { scope, principal: { source: 'native-login', request }, mutation },
        work,
        { runTransaction: transactionFor(await connect()) }
      )
    }
    beforeEach(async () => {
      connections = []
      schema = `cms_${randomUUID().replaceAll('-', '')}`
      observer = await connect()
      await observer.query(`CREATE SCHEMA "${schema}"`)
      await observer.query(`CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
      CREATE TABLE visible_effects(id BIGSERIAL PRIMARY KEY);`)
      for (const file of [
        '402_page_studio_control_plane.sql',
        '404_page_studio_documents.sql',
        '420_page_studio_login_sessions.sql'
      ]) {
        await observer.query(
          readFileSync(
            new URL(
              `../../../server/database/migrations/${file}`,
              import.meta.url
            ),
            'utf8'
          )
        )
      }
      const clientId = randomUUID(),
        userId = randomUUID(),
        roleId = randomUUID()
      await observer.query(
        'INSERT INTO team_members VALUES($1,TRUE,\'owner\',NULL,NULL)',
        [userId]
      )
      await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [
        clientId
      ])
      await observer.query(
        'INSERT INTO custom_roles VALUES($1,\'owner\',TRUE,FALSE)',
        [roleId]
      )
      await observer.query(
        'INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\')',
        [roleId]
      )
      const entitlementId = (
        await observer.query(
          `INSERT INTO page_studio_entitlements(tenant_id,client_id,monthly_ai_operation_limit,active_site_limit,portal_creation_enabled,plan_metadata)
      VALUES('cms-tenant',$1,0,2,TRUE,'{"builder":{"collectionSchemas":true}}') RETURNING id`,
          [clientId]
        )
      ).rows[0].id
      const siteId = (
        await observer.query(
          `INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version)
      VALUES('cms-tenant',$1,$2,'CMS test','cms-test','fixture') RETURNING id`,
          [clientId, entitlementId]
        )
      ).rows[0].id
      scope = {
        tenantId: 'cms-tenant',
        clientId,
        businessId: clientId,
        siteId,
        environment: 'staging'
      }
      const hash = randomUUID().replaceAll('-', '').repeat(2)
      const login = (
        await observer.query(
          `INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('agency',$1,$2,date_trunc('milliseconds',clock_timestamp())-INTERVAL '1hour',date_trunc('milliseconds',clock_timestamp())+INTERVAL '1day') RETURNING *`,
          [hash, userId]
        )
      ).rows[0]
      request = {
        siteId,
        actor: {
          role: 'agency',
          actorId: userId,
          tenantId: scope.tenantId,
          canEdit: true
        },
        login: {
          role: 'agency',
          userId,
          tokenHash: hash,
          issuedAt: login.issued_at,
          expiresAt: login.expires_at
        },
        env: {
          PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
          PAGE_STUDIO_CONTENT_ROUTER: {
            readContent() {
              throw new Error('No remote I/O')
            },
            writeContent() {
              throw new Error('No remote I/O')
            }
          }
        }
      }
    })
    afterEach(async () => {
      await Promise.all(
        connections.filter(db => db !== observer).map(db => db.end())
      )
      if (observer) {
        try {
          await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        } finally {
          await observer.end()
        }
      }
    })
    const count = async () =>
      Number(
        (await observer.query('SELECT count(*) FROM visible_effects')).rows[0]
          .count
      )
    it('permits ordinary admin edits without AI allowance', async () => {
      await run()
      expect(await count()).toBe(1)
    })
    it.each([
      'UPDATE team_members SET is_active=FALSE',
      'DELETE FROM role_permission_groups',
      'UPDATE custom_roles SET is_read_only=TRUE',
      'UPDATE agency_clients SET is_active=FALSE',
      'UPDATE page_studio_entitlements SET status=\'suspended\'',
      'UPDATE page_studio_entitlements SET plan_metadata=\'{}\'',
      'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'
    ])(
      'denies changed native policy with no visible writes: %s',
      async (sql) => {
        await observer.query(sql)
        await expect(run()).rejects.toMatchObject({
          statusCode: sql.includes('agency_clients') ? 404 : 403
        })
        expect(await count()).toBe(0)
      }
    )
    it('retains basic content edit rights without schema package access', async () => {
      await observer.query(
        'UPDATE page_studio_entitlements SET plan_metadata=\'{}\',active_site_limit=0'
      )
      await run('business-content')
      expect(await count()).toBe(1)
      await expect(run('collection-schema')).rejects.toMatchObject({
        statusCode: 403
      })
    })
    it('rolls back work when entitlement expires before the final policy check', async () => {
      await observer.query(
        'UPDATE page_studio_entitlements SET effective_until=clock_timestamp()+INTERVAL \'150milliseconds\''
      )
      await expect(
        run('collection-record', async (db) => {
          await db.query('INSERT INTO visible_effects DEFAULT VALUES')
          await db.query('SELECT pg_sleep(0.2)')
        })
      ).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(0)
    })
    it('fails retryably rather than deadlocking against client-first deactivation', async () => {
      const revoker = await connect()
      await revoker.query('BEGIN')
      await revoker.query('UPDATE agency_clients SET is_active=FALSE')
      try {
        await expect(run()).rejects.toMatchObject({
          code: 'CMS_AUTHORITY_BUSY',
          statusCode: 503
        })
        expect(await count()).toBe(0)
      } finally {
        await revoker.query('ROLLBACK')
      }
      await run()
      expect(await count()).toBe(1)
    })
    it('holds actual permission rows until native commit', async () => {
      const revoker = await connect()
      await run('collection-record', async (db) => {
        await db.query('INSERT INTO visible_effects DEFAULT VALUES')
        await revoker.query('BEGIN')
        try {
          await expect(
            revoker.query(
              'SELECT role_id FROM role_permission_groups FOR UPDATE NOWAIT'
            )
          ).rejects.toMatchObject({ code: '55P03' })
        } finally {
          await revoker.query('ROLLBACK')
        }
      })
      await revoker.query('DELETE FROM role_permission_groups')
      await expect(run()).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(1)
    })
    it('rejects foreign environment and actor scope before work', async () => {
      scope = { ...scope, environment: 'production' }
      await expect(run()).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(0)
    })
    async function portal() {
      const userId = randomUUID(),
        hash = randomUUID().replaceAll('-', '').repeat(2)
      await observer.query(
        'INSERT INTO client_users VALUES($1,$2,\'active\',\'member\')',
        [userId, scope.clientId]
      )
      await observer.query(
        'INSERT INTO client_sessions VALUES($1,$2,clock_timestamp()+INTERVAL \'1day\')',
        [hash, userId]
      )
      const login = (
        await observer.query(
          `INSERT INTO page_studio_login_sessions(role,token_hash,user_id,issued_at,expires_at)
      VALUES('client',$1,$2,date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',clock_timestamp())+INTERVAL '1day') RETURNING *`,
          [hash, userId]
        )
      ).rows[0]
      await observer.query(
        `INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role)
      VALUES($1,$2,$3,$4,'editor')`,
        [scope.tenantId, scope.clientId, scope.siteId, userId]
      )
      request = {
        ...request,
        actor: { role: 'client', actorId: userId, clientId: scope.clientId },
        login: {
          role: 'client',
          userId,
          tokenHash: hash,
          issuedAt: login.issued_at,
          expiresAt: login.expires_at
        }
      }
    }
    it('preserves portal record editing while requiring manager rights for schemas', async () => {
      await portal()
      await run()
      expect(await count()).toBe(1)
      await expect(run('collection-schema')).rejects.toMatchObject({
        statusCode: 403
      })
      await observer.query('UPDATE client_users SET role=\'manager\'')
      await run('collection-schema')
      expect(await count()).toBe(2)
      await observer.query('DELETE FROM page_studio_site_memberships')
      await expect(run()).rejects.toMatchObject({ statusCode: 403 })
    })
    it('locks native portal sessions and memberships through commit', async () => {
      await portal()
      const revoker = await connect()
      await run('collection-record', async (db) => {
        await db.query('INSERT INTO visible_effects DEFAULT VALUES')
        for (const table of [
          'client_sessions',
          'page_studio_site_memberships'
        ]) {
          await revoker.query('BEGIN')
          try {
            await expect(
              revoker.query(`SELECT * FROM ${table} FOR UPDATE NOWAIT`)
            ).rejects.toMatchObject({ code: '55P03' })
          } finally {
            await revoker.query('ROLLBACK')
          }
        }
      })
      await observer.query('DELETE FROM client_sessions')
      await expect(run()).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(1)
    })
    it('verifies exact Studio child claims as well as CMS permissions', async () => {
      const now = Math.floor(Date.now() / 1000)
      const claims = {
        tenantId: scope.tenantId,
        clientId: scope.clientId,
        siteId: scope.siteId,
        role: 'agency' as const,
        userId: request.actor.actorId,
        nonce: randomUUID(),
        issuedAt: now - 1,
        expiresAt: now + 600,
        capabilities: ['workspace:checkpoint' as const]
      }
      await observer.query(
        `INSERT INTO page_studio_sessions(nonce,tenant_id,client_id,site_id,user_id,role,capabilities,issued_at,expires_at,login_session_hash)
      VALUES($1,$2,$3,$4,$5,'agency',$6,to_timestamp($7),to_timestamp($8),$9)`,
        [
          claims.nonce,
          scope.tenantId,
          scope.clientId,
          scope.siteId,
          claims.userId,
          JSON.stringify(claims.capabilities),
          claims.issuedAt,
          claims.expiresAt,
          request.login.tokenHash
        ]
      )
      const invoke = async () =>
        withCmsCommitAuthority(
          {
            scope,
            mutation: 'collection-record',
            principal: {
              source: 'studio-session',
              claims,
              env: request.env,
              capability: 'workspace:checkpoint'
            }
          },
          db => db.query('INSERT INTO visible_effects DEFAULT VALUES'),
          { runTransaction: transactionFor(await connect()) }
        )
      await invoke()
      expect(await count()).toBe(1)
      await observer.query(
        'UPDATE page_studio_sessions SET revoked_at=clock_timestamp()'
      )
      await expect(invoke()).rejects.toMatchObject({ statusCode: 403 })
      expect(await count()).toBe(1)
    })
    it('rechecks logout after waiting for the site lock', async () => {
      const blocker = await connect(),
        writer = await connect()
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM page_studio_sites FOR NO KEY UPDATE')
      const attempt = withCmsCommitAuthority(
        {
          scope,
          mutation: 'collection-record',
          principal: { source: 'native-login', request }
        },
        db => db.query('INSERT INTO visible_effects DEFAULT VALUES'),
        { runTransaction: transactionFor(writer) }
      )
      const observed = expect(attempt).rejects.toMatchObject({
        statusCode: 403
      })
      try {
        for (let count = 0; count < 50; count++) {
          const blocked = (
            await observer.query(
              'SELECT cardinality(pg_blocking_pids($1)) AS count',
              [(writer as unknown as { processID: number }).processID]
            )
          ).rows[0].count
          if (blocked > 0) break
          if (count === 49) throw new Error('Writer did not wait for site lock')
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        await observer.query(
          'UPDATE page_studio_login_sessions SET revoked_at=clock_timestamp()'
        )
      } finally {
        await blocker.query('COMMIT')
      }
      await observed
      expect(await count()).toBe(0)
    })
  }
)
