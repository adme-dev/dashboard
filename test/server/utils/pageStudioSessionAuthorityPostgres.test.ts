import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertPageStudioSessionAuthority } from '~~/server/utils/pageStudio/sessionAuthority'
import type { PageStudioSessionClaims, PageStudioSessionQueryOne } from '~~/server/utils/pageStudio/sessions'

// The production SQL runs unchanged. Only the connection is replaced with an
// isolated local database; accidental use of the application connection fails.
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: () => { throw new Error('Inject the disposable PostgreSQL connection') },
  transaction: () => { throw new Error('Session authority must not issue a session') }
}))
const databaseUrl = process.env.PAGE_STUDIO_SESSION_AUTHORITY_DATABASE_TEST_URL
  ?? process.env.PAGE_STUDIO_AUTHORITY_DATABASE_TEST_URL
const clientId = '20000000-0000-4000-8000-000000000301'
const userId = '30000000-0000-4000-8000-000000000301'
const entitlementId = '40000000-0000-4000-8000-000000000301'
const siteId = '50000000-0000-4000-8000-000000000301'
const staffRoleId = '60000000-0000-4000-8000-000000000301'
const customRoleId = '60000000-0000-4000-8000-000000000302'
const loginSessionHash = 'a'.repeat(64)
const independentLoginSessionHash = 'b'.repeat(64)
const denied = { code: 'SESSION_AUTHORITY_DENIED', statusCode: 403 }

describe.runIf(Boolean(databaseUrl))('current editor session authority on disposable PostgreSQL', () => {
  let client: pg.Client
  let connected = false
  let claims: PageStudioSessionClaims
  const schema = `session_authority_${randomUUID().replaceAll('-', '')}`
  const queryOneFresh: PageStudioSessionQueryOne = async (sql, values) => (await client.query(sql, values)).rows[0] ?? null
  const authorize = (capability: string = 'workspace:preview') => assertPageStudioSessionAuthority(claims, capability, { queryOneFresh })

  async function saveClaims() {
    await client.query('DELETE FROM page_studio_sessions')
    await client.query('DELETE FROM page_studio_login_sessions')
    await client.query('DELETE FROM client_sessions')
    await client.query(`INSERT INTO page_studio_login_sessions
      (role, token_hash, user_id, issued_at, expires_at)
      VALUES ($1, $2, $3, to_timestamp($4) - INTERVAL '1 hour', NOW() + INTERVAL '1 day')`,
    [claims.role, loginSessionHash, claims.userId, claims.issuedAt])
    if (claims.role === 'client') {
      await client.query(`INSERT INTO client_sessions (token_hash, client_user_id, expires_at)
        VALUES ($1, $2, NOW() + INTERVAL '1 day')`, [loginSessionHash, claims.userId])
    }
    await client.query(`INSERT INTO page_studio_sessions
      (nonce, tenant_id, client_id, site_id, user_id, role, capabilities, issued_at, expires_at, login_session_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),$10)`,
    [claims.nonce, claims.tenantId, claims.clientId, claims.siteId, claims.userId, claims.role,
      JSON.stringify(claims.capabilities), claims.issuedAt, claims.expiresAt, loginSessionHash])
  }

  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    connected = true
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}", pg_catalog`)
    // Relevant migration columns, with real timestamps, JSONB comparisons and
    // role joins. Full migration/FK coverage belongs to migration tests.
    await client.query(`
      CREATE TYPE user_role AS ENUM ('owner', 'admin', 'sales', 'member', 'viewer', 'guest');
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN, user_role user_role, custom_role_id UUID,
        sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT, is_system BOOLEAN, is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT);
      CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID, status TEXT, role TEXT);
      CREATE TABLE client_sessions (token_hash TEXT, client_user_id UUID, expires_at TIMESTAMPTZ);
      CREATE TABLE page_studio_login_sessions (role TEXT, token_hash TEXT, user_id TEXT,
        issued_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, PRIMARY KEY (role, token_hash));
      CREATE TABLE page_studio_sites (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, entitlement_id UUID, status TEXT);
      CREATE TABLE page_studio_site_memberships (tenant_id TEXT, client_id UUID, site_id UUID, user_id UUID, role TEXT);
      CREATE TABLE page_studio_entitlements (id UUID PRIMARY KEY, tenant_id TEXT, client_id UUID, status TEXT,
        effective_from TIMESTAMPTZ, effective_until TIMESTAMPTZ, monthly_ai_operation_limit INTEGER);
      CREATE TABLE page_studio_sessions (nonce TEXT PRIMARY KEY, tenant_id TEXT, client_id UUID,
        site_id UUID, user_id TEXT, role TEXT, capabilities JSONB, issued_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, login_session_hash TEXT);
    `)
    await client.query('INSERT INTO team_members VALUES ($1, TRUE, \'owner\', NULL, NULL)', [userId])
    await client.query('INSERT INTO custom_roles VALUES ($1, \'owner\', TRUE, FALSE), ($2, \'limited\', FALSE, FALSE)', [staffRoleId, customRoleId])
    await client.query('INSERT INTO role_permission_groups VALUES ($1, \'PAGE_STUDIO_EDIT\')', [staffRoleId])
    await client.query('INSERT INTO agency_clients VALUES ($1, TRUE)', [clientId])
    // Portal role alone does not grant editor access: the current explicit site
    // membership does. Preserve the existing issuance contract for viewers.
    await client.query('INSERT INTO client_users VALUES ($1, $2, \'active\', \'viewer\')', [userId, clientId])
    await client.query('INSERT INTO page_studio_sites VALUES ($1, \'session-test\', $2, $3, \'draft\')', [siteId, clientId, entitlementId])
    await client.query('INSERT INTO page_studio_site_memberships VALUES (\'session-test\', $1, $2, $3, \'editor\')', [clientId, siteId, userId])
    await client.query('INSERT INTO page_studio_entitlements VALUES ($1, \'session-test\', $2, \'trial\', NOW() - INTERVAL \'1 hour\', NULL, 100)', [entitlementId, clientId])
  })

  beforeEach(async () => {
    await client.query('BEGIN')
    const now = Math.floor(Date.now() / 1000)
    claims = {
      capabilities: ['workspace:preview', 'workspace:checkpoint', 'model:invoke'],
      clientId, siteId, userId, tenantId: 'session-test', role: 'client',
      nonce: randomUUID(), issuedAt: now - 10, expiresAt: now + 600
    }
    await saveClaims()
  })
  afterEach(async () => {
    await client.query('ROLLBACK')
  })
  afterAll(async () => {
    if (!connected) return
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await client.end()
    }
  })

  it('allows an active editor for draft and active sites with trial or active packages', async () => {
    await expect(authorize()).resolves.toBeUndefined()
    await client.query('UPDATE page_studio_sites SET status=\'active\'')
    await client.query('UPDATE page_studio_entitlements SET status=\'active\', effective_until=NOW() + INTERVAL \'1 day\'')
    await expect(authorize('workspace:checkpoint')).resolves.toBeUndefined()
  })

  describe.each(['client', 'agency'] as const)('%s parent login authority', (role) => {
    beforeEach(async () => {
      claims.role = role
      await saveClaims()
    })

    it.each([
      'UPDATE page_studio_sessions SET login_session_hash=NULL',
      'UPDATE page_studio_sessions SET login_session_hash=\'unknown-login\'',
      'DELETE FROM page_studio_login_sessions',
      'UPDATE page_studio_login_sessions SET revoked_at=NOW()',
      'UPDATE page_studio_login_sessions SET expires_at=NOW() - INTERVAL \'1 second\'',
      'UPDATE page_studio_login_sessions SET user_id=\'another-user\'',
      `UPDATE page_studio_login_sessions SET role='${role === 'client' ? 'agency' : 'client'}'`
    ])('denies the editor after %s', async (mutation) => {
      await expect(authorize()).resolves.toBeUndefined()
      await client.query(mutation)
      await expect(authorize()).rejects.toMatchObject(denied)
    })

    it('revokes one login without denying an independent login for the same user', async () => {
      const independentClaims = { ...claims, nonce: randomUUID() }
      await client.query(`INSERT INTO page_studio_login_sessions
        (role, token_hash, user_id, issued_at, expires_at)
        SELECT role, $1, user_id, issued_at, expires_at FROM page_studio_login_sessions
        WHERE role=$2 AND token_hash=$3`, [independentLoginSessionHash, role, loginSessionHash])
      if (role === 'client') {
        await client.query(`INSERT INTO client_sessions (token_hash, client_user_id, expires_at)
          VALUES ($1, $2, NOW() + INTERVAL '1 day')`, [independentLoginSessionHash, userId])
      }
      await client.query(`INSERT INTO page_studio_sessions
        (nonce, tenant_id, client_id, site_id, user_id, role, capabilities, issued_at, expires_at, login_session_hash)
        SELECT $1, tenant_id, client_id, site_id, user_id, role, capabilities, issued_at, expires_at, $2
        FROM page_studio_sessions WHERE nonce=$3`, [independentClaims.nonce, independentLoginSessionHash, claims.nonce])
      const authorizeIndependent = () => assertPageStudioSessionAuthority(independentClaims, 'workspace:preview', { queryOneFresh })
      await expect(authorize()).resolves.toBeUndefined()
      await expect(authorizeIndependent()).resolves.toBeUndefined()
      await client.query('UPDATE page_studio_login_sessions SET revoked_at=NOW() WHERE role=$1 AND token_hash=$2', [role, loginSessionHash])
      await expect(authorizeIndependent()).resolves.toBeUndefined()
      await expect(authorize()).rejects.toMatchObject(denied)
    })
  })

  it.each([
    'DELETE FROM client_sessions',
    'UPDATE client_sessions SET expires_at=NOW() - INTERVAL \'1 second\'',
    'UPDATE client_sessions SET client_user_id=\'30000000-0000-4000-8000-000000000302\'',
    'UPDATE client_sessions SET token_hash=\'another-native-session\''
  ])('denies portal editor access after native login mutation %s', async (mutation) => {
    await expect(authorize()).resolves.toBeUndefined()
    await client.query(mutation)
    await expect(authorize()).rejects.toMatchObject(denied)
  })

  it('denies agency sessions whose parent login predates global session invalidation', async () => {
    claims.role = 'agency'
    await saveClaims()
    await expect(authorize()).resolves.toBeUndefined()
    // The editor token is newer than the global invalidation; its older parent
    // login still makes the editor unauthorized.
    await client.query('UPDATE team_members SET sessions_invalidated_at=to_timestamp($1) - INTERVAL \'30 minutes\'', [claims.issuedAt])
    await expect(authorize()).rejects.toMatchObject(denied)
  })

  it('allows agency login issued after an earlier global session invalidation', async () => {
    claims.role = 'agency'
    await saveClaims()
    await client.query('UPDATE team_members SET sessions_invalidated_at=to_timestamp($1) - INTERVAL \'2 hours\'', [claims.issuedAt])
    await expect(authorize()).resolves.toBeUndefined()
  })

  it.each([
    'UPDATE page_studio_sessions SET revoked_at=NOW()',
    'DELETE FROM page_studio_sessions',
    'UPDATE page_studio_sessions SET expires_at=NOW() - INTERVAL \'1 second\'',
    'UPDATE page_studio_sessions SET issued_at=issued_at + INTERVAL \'1 second\'',
    'UPDATE page_studio_sessions SET expires_at=expires_at + INTERVAL \'1 second\'',
    'UPDATE page_studio_sessions SET capabilities=\'["workspace:preview"]\'',
    'UPDATE page_studio_sessions SET role=\'agency\'',
    'UPDATE page_studio_sessions SET tenant_id=\'foreign\'',
    'UPDATE page_studio_sessions SET client_id=\'20000000-0000-4000-8000-000000000302\'',
    'UPDATE page_studio_sessions SET site_id=\'50000000-0000-4000-8000-000000000302\'',
    'UPDATE page_studio_sessions SET user_id=\'another-user\'',
    'UPDATE page_studio_sessions SET nonce=\'another-session-nonce\'',
    'DELETE FROM page_studio_site_memberships',
    'UPDATE page_studio_site_memberships SET role=\'viewer\'',
    'UPDATE page_studio_site_memberships SET tenant_id=\'foreign\'',
    'UPDATE page_studio_site_memberships SET client_id=\'20000000-0000-4000-8000-000000000302\'',
    'UPDATE page_studio_site_memberships SET site_id=\'50000000-0000-4000-8000-000000000302\'',
    'UPDATE page_studio_site_memberships SET user_id=\'30000000-0000-4000-8000-000000000302\'',
    'UPDATE client_users SET status=\'disabled\'',
    'UPDATE client_users SET client_id=\'20000000-0000-4000-8000-000000000302\'',
    'DELETE FROM client_users',
    'UPDATE agency_clients SET is_active=FALSE',
    'UPDATE page_studio_sites SET status=\'suspended\'',
    'UPDATE page_studio_sites SET status=\'archived\'',
    'UPDATE page_studio_sites SET tenant_id=\'foreign\'',
    'UPDATE page_studio_sites SET client_id=\'20000000-0000-4000-8000-000000000302\'',
    'UPDATE page_studio_entitlements SET status=\'suspended\'',
    'UPDATE page_studio_entitlements SET tenant_id=\'foreign\'',
    'UPDATE page_studio_entitlements SET client_id=\'20000000-0000-4000-8000-000000000302\'',
    'UPDATE page_studio_entitlements SET effective_until=NOW() - INTERVAL \'1 second\'',
    'UPDATE page_studio_entitlements SET effective_from=NOW() + INTERVAL \'1 hour\'',
    'DELETE FROM page_studio_entitlements'
  ])('denies an already-issued session immediately after %s', async (mutation) => {
    await expect(authorize()).resolves.toBeUndefined()
    await client.query(mutation)
    await expect(authorize()).rejects.toMatchObject(denied)
  })

  it('denies an expired token even when retained timestamps match', async () => {
    claims.expiresAt = claims.issuedAt - 1
    claims.issuedAt = claims.expiresAt - 600
    await saveClaims()
    await expect(authorize()).rejects.toMatchObject(denied)
  })

  it.each(['source:edit', 'workspace:terminate', 'unknown:capability', ''])('denies unavailable capability %s', async (capability) => {
    await expect(authorize(capability)).rejects.toMatchObject(denied)
  })

  it('denies client source editing even if retained claims contain that capability', async () => {
    claims.capabilities.push('source:edit')
    await saveClaims()
    await expect(authorize('source:edit')).rejects.toMatchObject(denied)
  })

  it('checks the current model allowance without taking away ordinary preview access', async () => {
    await expect(authorize('model:invoke')).resolves.toBeUndefined()
    await client.query('UPDATE page_studio_entitlements SET monthly_ai_operation_limit=0')
    await expect(authorize('model:invoke')).rejects.toMatchObject(denied)
    await expect(authorize()).resolves.toBeUndefined()
  })

  it('allows agency editing independently of portal membership and checks custom-role permissions freshly', async () => {
    claims.role = 'agency'
    claims.capabilities.push('source:edit')
    await saveClaims()
    await client.query('DELETE FROM client_users')
    await client.query('DELETE FROM page_studio_site_memberships')
    await expect(authorize('source:edit')).resolves.toBeUndefined()
    await client.query('UPDATE team_members SET custom_role_id=$1', [customRoleId])
    await expect(authorize()).rejects.toMatchObject(denied)
    await client.query('INSERT INTO role_permission_groups VALUES ($1, \'PAGE_STUDIO_EDIT\')', [customRoleId])
    await expect(authorize()).resolves.toBeUndefined()
    await client.query('UPDATE custom_roles SET is_read_only=TRUE WHERE id=$1', [customRoleId])
    await expect(authorize()).rejects.toMatchObject(denied)
  })

  it.each([
    'UPDATE team_members SET is_active=FALSE',
    'UPDATE team_members SET user_role=\'viewer\'',
    'UPDATE team_members SET user_role=\'guest\'',
    'DELETE FROM team_members',
    'DELETE FROM role_permission_groups',
    'UPDATE custom_roles SET is_read_only=TRUE',
    'UPDATE custom_roles SET is_system=FALSE',
    'DELETE FROM custom_roles',
    'UPDATE agency_clients SET is_active=FALSE',
    'UPDATE page_studio_entitlements SET status=\'suspended\'',
    'UPDATE page_studio_sites SET tenant_id=\'foreign\''
  ])('revokes agency access immediately after %s', async (mutation) => {
    claims.role = 'agency'
    await saveClaims()
    await expect(authorize()).resolves.toBeUndefined()
    await client.query(mutation)
    await expect(authorize()).rejects.toMatchObject(denied)
  })
})
