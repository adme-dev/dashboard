import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withPageStudioPublishAuthority, type PageStudioPublishPrincipal } from '~~/server/utils/pageStudio/publishAuthority'
import { withPortalPageStudioReleaseAuthority } from '~~/server/utils/pageStudio/portalReleaseAuthority'
import type { PageStudioPublishingQueryClient } from '~~/server/utils/pageStudio/publishing'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/studio_cms(?:_[a-z0-9_]+)?$/.test(url.pathname)) {
    throw new Error('A disposable localhost studio_cms database is required')
  }
}

describe.runIf(Boolean(databaseUrl))('Portal publication authority on PostgreSQL', () => {
  let db: pg.Client
  const scope = { tenantId: 'portal-publish-test', clientId: randomUUID(), siteId: randomUUID() }
  const actorId = randomUUID()
  const entitlementId = randomUUID()
  let principal: PageStudioPublishPrincipal
  const runTransaction = async <T>(work: (client: PageStudioPublishingQueryClient) => Promise<T>) => {
    await db.query('BEGIN')
    try {
      const result = await work(db)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }
  const authorize = (work = async () => 'allowed', candidate = principal, candidateScope = scope) =>
    withPageStudioPublishAuthority(candidateScope, candidate, work, { runTransaction })

  beforeAll(async () => {
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`
      CREATE TEMP TABLE page_studio_sites(id uuid PRIMARY KEY, tenant_id text, client_id uuid, entitlement_id uuid, status text, delivery_mode text DEFAULT 'static');
      CREATE TEMP TABLE page_studio_domains(tenant_id text,client_id uuid,site_id uuid,normalized_hostname text,
        lifecycle_state text,hostname_status text,tls_status text,dns_status text,verified_at timestamptz);
      CREATE TEMP TABLE agency_clients(id uuid PRIMARY KEY, is_active boolean);
      CREATE TEMP TABLE page_studio_entitlements(id uuid PRIMARY KEY, tenant_id text, client_id uuid,
        status text, effective_from timestamptz, effective_until timestamptz, custom_domain_limit integer);
      CREATE TEMP TABLE client_users(id uuid PRIMARY KEY, client_id uuid, status text, role text);
      CREATE TEMP TABLE client_sessions(token_hash text PRIMARY KEY, client_user_id uuid, expires_at timestamptz);
      CREATE TEMP TABLE page_studio_login_sessions(role text, token_hash text, user_id text,
        issued_at timestamptz, expires_at timestamptz, revoked_at timestamptz, PRIMARY KEY(role, token_hash));
      CREATE TEMP TABLE page_studio_site_memberships(tenant_id text, client_id uuid, site_id uuid, user_id uuid, role text);
      CREATE TEMP TABLE publication_effects(id integer);
    `)
  })
  afterAll(async () => {
    await db?.end()
  })
  beforeEach(async () => {
    await db.query(`TRUNCATE page_studio_sites, agency_clients, page_studio_entitlements, client_users,
      client_sessions, page_studio_login_sessions, page_studio_site_memberships, publication_effects, page_studio_domains`)
    principal = { actorId, tenantId: scope.tenantId, login: { role: 'client', userId: actorId,
      tokenHash: 'a'.repeat(64), issuedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 60_000) } }
    await db.query(`INSERT INTO agency_clients VALUES($1,TRUE)`, [scope.clientId])
    await db.query(`INSERT INTO page_studio_entitlements VALUES($1,$2,$3,'active',NOW()-INTERVAL '1 day',NULL,1)`,
      [entitlementId, scope.tenantId, scope.clientId])
    await db.query(`INSERT INTO page_studio_sites(id,tenant_id,client_id,entitlement_id,status) VALUES($1,$2,$3,$4,'draft')`,
      [scope.siteId, scope.tenantId, scope.clientId, entitlementId])
    await db.query(`INSERT INTO client_users VALUES($1,$2,'active','admin')`, [actorId, scope.clientId])
    await db.query(`INSERT INTO client_sessions VALUES($1,$2,$3)`, [principal.login.tokenHash, actorId, principal.login.expiresAt])
    await db.query(`INSERT INTO page_studio_login_sessions VALUES('client',$1,$2,$3,$4,NULL)`,
      [principal.login.tokenHash, actorId, principal.login.issuedAt, principal.login.expiresAt])
    await db.query(`INSERT INTO page_studio_site_memberships VALUES($1,$2,$3,$4,'editor')`,
      [scope.tenantId, scope.clientId, scope.siteId, actorId])
    await db.query(`INSERT INTO page_studio_domains VALUES($1,$2,$3,'www.customer.example','verified','active','active','active',NOW())`,
      [scope.tenantId, scope.clientId, scope.siteId])
  })

  it.each(['admin', 'manager'])('admits an active %s with exact site editor membership and domain allowance', async (role) => {
    await db.query('UPDATE client_users SET role=$1', [role])
    await expect(authorize()).resolves.toBe('allowed')
  })

  const withdrawals = [
    ['viewer account', 'UPDATE client_users SET role=\'viewer\''],
    ['inactive account', 'UPDATE client_users SET status=\'inactive\''],
    ['foreign account', `UPDATE client_users SET client_id='${randomUUID()}'`],
    ['viewer membership', 'UPDATE page_studio_site_memberships SET role=\'viewer\''],
    ['removed membership', 'DELETE FROM page_studio_site_memberships'],
    ['foreign membership tenant', 'UPDATE page_studio_site_memberships SET tenant_id=\'foreign\''],
    ['foreign membership client', `UPDATE page_studio_site_memberships SET client_id='${randomUUID()}'`],
    ['foreign membership site', `UPDATE page_studio_site_memberships SET site_id='${randomUUID()}'`],
    ['logout', 'DELETE FROM client_sessions'],
    ['expired session', 'UPDATE client_sessions SET expires_at=NOW()-INTERVAL \'1 second\''],
    ['revoked login', 'UPDATE page_studio_login_sessions SET revoked_at=NOW()'],
    ['expired login', 'UPDATE page_studio_login_sessions SET expires_at=NOW()-INTERVAL \'1 second\''],
    ['replaced original login', 'UPDATE page_studio_login_sessions SET issued_at=issued_at+INTERVAL \'1 second\''],
    ['inactive business', 'UPDATE agency_clients SET is_active=FALSE'],
    ['suspended site', 'UPDATE page_studio_sites SET status=\'suspended\''],
    ['suspended entitlement', 'UPDATE page_studio_entitlements SET status=\'suspended\''],
    ['expired entitlement', 'UPDATE page_studio_entitlements SET effective_until=NOW()-INTERVAL \'1 second\''],
    ['future entitlement', 'UPDATE page_studio_entitlements SET effective_from=NOW()+INTERVAL \'1 day\''],
    ['removed domain allowance', 'UPDATE page_studio_entitlements SET custom_domain_limit=0']
  ]
  it.each(withdrawals)('rejects %s before a publication effect', async (_name, sql) => {
    await db.query(sql!)
    let called = false
    await expect(authorize(async () => {
      called = true
      return 'effect'
    })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    expect(called).toBe(false)
  })

  it.each(withdrawals)('rolls back publication if %s changes during the operation', async (_name, sql) => {
    let called = false
    await expect(authorize(async () => {
      called = true
      await db.query('INSERT INTO publication_effects VALUES(1)')
      await db.query(sql!)
      return 'effect'
    })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    expect(called).toBe(true)
    expect((await db.query('SELECT * FROM publication_effects')).rows).toEqual([])
  })

  it('does not substitute another site or tenant for the requested scope', async () => {
    await expect(authorize(undefined, principal, { ...scope, siteId: randomUUID() })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
    await expect(authorize(undefined, principal, { ...scope, tenantId: 'foreign' })).rejects.toMatchObject({ code: 'PUBLISH_AUTHORITY_DENIED' })
  })

  const release = (work = async () => 'release', hostname = 'www.customer.example') =>
    withPortalPageStudioReleaseAuthority(scope, principal, hostname, work, { runTransaction })
  it('admits a verified static site on the exact customer hostname', async () => {
    await expect(release()).resolves.toBe('release')
  })
  const domainWithdrawals = [
    'UPDATE page_studio_domains SET lifecycle_state=\'detached\'',
    'UPDATE page_studio_domains SET hostname_status=\'pending\'',
    'UPDATE page_studio_domains SET tls_status=\'pending\'',
    'UPDATE page_studio_domains SET dns_status=\'pending\'',
    'UPDATE page_studio_domains SET verified_at=NULL',
    'UPDATE page_studio_domains SET tenant_id=\'foreign\'',
    `UPDATE page_studio_domains SET client_id='${randomUUID()}'`,
    `UPDATE page_studio_domains SET site_id='${randomUUID()}'`,
    'UPDATE page_studio_sites SET delivery_mode=\'runtime\''
  ]
  it.each(domainWithdrawals)('denies a domain or delivery mismatch before release: %s', async (sql) => {
    await db.query(sql)
    let called = false
    await expect(release(async () => {
      called = true
      return 'release'
    })).rejects.toMatchObject({ code: 'RELEASE_DOMAIN_NOT_READY' })
    expect(called).toBe(false)
  })
  it.each(domainWithdrawals)('rolls back if domain readiness changes inside publication: %s', async (sql) => {
    let called = false
    await expect(release(async () => {
      called = true
      await db.query('INSERT INTO publication_effects VALUES(1)')
      await db.query(sql)
      return 'release'
    })).rejects.toMatchObject({ code: 'RELEASE_DOMAIN_NOT_READY' })
    expect(called).toBe(true)
    expect((await db.query('SELECT * FROM publication_effects')).rows).toEqual([])
  })
  it('does not admit another hostname just because the customer has a verified domain', async () => {
    await expect(release(undefined, 'www.other.example')).rejects.toMatchObject({ code: 'RELEASE_DOMAIN_NOT_READY' })
  })
})
