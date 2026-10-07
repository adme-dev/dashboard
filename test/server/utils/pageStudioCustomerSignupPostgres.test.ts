import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
const databaseUrl = process.env.PAGE_STUDIO_WORKSPACE_TEST_URL

describe.runIf(Boolean(databaseUrl))('standalone signup and setup on disposable PostgreSQL', () => {
  const schema = `signup_${randomUUID().replaceAll('-', '')}`
  let db: pg.Client
  let api: typeof import('~~/server/utils/pageStudio/customerSignup')
  const run = async <T>(fn: (client: pg.Client) => Promise<T>) => {
    const client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`)
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      await client.end()
    }
  }
  const request = (email = 'owner@example.test', mode: 'signup' | 'signin' = 'signup') => api.requestCustomerSignIn({ email, name: 'Alex', mode, acceptedTerms: true }, 'preview-v1', run)
  const signup = async (email = 'owner@example.test') => {
    const delivery = await request(email)
    return api.verifyCustomerSignIn(delivery!.token, run)
  }
  const draft = { businessName: 'Alex Flowers', businessType: 'Florist', timezone: 'Australia/Melbourne', goals: ['enquiries', 'gallery'] }
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    await db.query('CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID, status TEXT, role TEXT); CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN); CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN)')
    for (const file of ['442_page_studio_customer_workspaces.sql', '443_page_studio_customer_signup.sql']) {
      const sql = readFileSync(new URL(`../../../server/database/migrations/${file}`, import.meta.url), 'utf8')
      await db.query(sql)
      await db.query(sql)
    }
    api = await import('~~/server/utils/pageStudio/customerSignup')
  })
  beforeEach(async () => {
    await db.query(`TRUNCATE page_studio_customer_accounts, page_studio_customer_identities CASCADE`)
  })
  afterAll(async () => {
    if (db) {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await db.end()
    }
  })

  it('verifies one normalized account without creating agency/client users', async () => {
    const delivery = await request(' OWNER@Example.test ')
    expect(delivery!.email).toBe('owner@example.test')
    expect((await db.query('SELECT count(*) FROM page_studio_customer_identities')).rows[0].count).toBe('0')
    const session = await api.verifyCustomerSignIn(delivery!.token, run)
    expect(await api.readCustomerSession(session.sessionToken, run)).toMatchObject({ name: 'Alex', email: 'owner@example.test' })
    expect((await db.query('SELECT count(*) FROM client_users')).rows[0].count).toBe('0')
    expect((await db.query('SELECT count(*) FROM agency_clients')).rows[0].count).toBe('0')
    expect((await db.query('SELECT token_hash FROM page_studio_customer_sessions')).rows[0].token_hash).toBe(await digestPortalSessionToken(session.sessionToken))
    await expect(api.verifyCustomerSignIn(delivery!.token, run)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('does not create accounts for sign-in or missing signup consent', async () => {
    expect(await request('missing@example.test', 'signin')).toBeNull()
    await expect(api.requestCustomerSignIn({ email: 'new@example.test', name: 'Alex', mode: 'signup', acceptedTerms: false }, 'preview-v1', run)).rejects.toMatchObject({ statusCode: 400 })
    expect((await db.query('SELECT count(*) FROM page_studio_customer_accounts')).rows[0].count).toBe('0')
  })
  it('invalidates the old link on resend and preserves verified account name', async () => {
    const old = await request()
    const fresh = await request()
    await expect(api.verifyCustomerSignIn(old!.token, run)).rejects.toMatchObject({ statusCode: 401 })
    await api.verifyCustomerSignIn(fresh!.token, run)
    await api.requestCustomerSignIn({ email: 'owner@example.test', name: 'Forged', mode: 'signup', acceptedTerms: true }, 'preview-v1', run)
    expect((await db.query('SELECT name FROM page_studio_customer_accounts')).rows[0].name).toBe('Alex')
  })
  it('allows only one concurrent verification', async () => {
    const delivery = await request()
    const results = await Promise.allSettled([api.verifyCustomerSignIn(delivery!.token, run), api.verifyCustomerSignIn(delivery!.token, run)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await db.query('SELECT count(*) FROM page_studio_customer_identities')).rows[0].count).toBe('1')
    expect((await db.query('SELECT count(*) FROM page_studio_customer_sessions')).rows[0].count).toBe('1')
  })
  it('rejects expired links, suspended accounts and suspended identities', async () => {
    const expired = await request()
    await db.query(`UPDATE page_studio_customer_login_tokens SET expires_at = NOW() - INTERVAL '1 minute'`)
    await expect(api.verifyCustomerSignIn(expired!.token, run)).rejects.toMatchObject({ statusCode: 401 })
    const session = await signup()
    await db.query(`UPDATE page_studio_customer_identities SET status = 'suspended'`)
    await expect(api.readCustomerSession(session.sessionToken, run)).rejects.toMatchObject({ statusCode: 401 })
    expect(await request()).toBeNull()
    await db.query(`UPDATE page_studio_customer_identities SET status = 'active'`)
    await db.query(`UPDATE page_studio_customer_accounts SET status = 'suspended'`)
    expect(await request()).toBeNull()
    await expect(api.readCustomerSession(session.sessionToken, run)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('revokes only the current session at logout and rejects expired sessions', async () => {
    const first = await signup()
    const second = await signup()
    await api.revokeCustomerSession(first.sessionToken, run)
    await expect(api.readCustomerSession(first.sessionToken, run)).rejects.toMatchObject({ statusCode: 401 })
    expect(await api.readCustomerSession(second.sessionToken, run)).toHaveProperty('identityId')
    await db.query(`UPDATE page_studio_customer_sessions SET expires_at = NOW() - INTERVAL '1 minute'`)
    await expect(api.readCustomerSession(second.sessionToken, run)).rejects.toMatchObject({ statusCode: 401 })
  })
  it('saves a revisioned draft, rejects stale writes and isolates another customer', async () => {
    const a = await signup()
    const b = await signup('other@example.test')
    expect(await api.readCustomerSetup(a.sessionToken, run)).toMatchObject({ revision: 0, workspaceId: null })
    const saved = await api.saveCustomerSetup(a.sessionToken, { expectedRevision: 0, draft }, run)
    expect(saved.revision).toBe(1)
    expect(await api.readCustomerSetup(a.sessionToken, run)).toMatchObject({ draft, revision: 1 })
    expect(await api.readCustomerSetup(b.sessionToken, run)).toMatchObject({ revision: 0 })
    await expect(api.saveCustomerSetup(a.sessionToken, { expectedRevision: 0, draft }, run)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('completes setup once across concurrent retries without creating a site or payer', async () => {
    const a = await signup()
    await api.saveCustomerSetup(a.sessionToken, { expectedRevision: 0, draft }, run)
    const results = await Promise.all([api.completeCustomerSetup(a.sessionToken, 1, run), api.completeCustomerSetup(a.sessionToken, 1, run)])
    expect(results[0].workspaceId).toBe(results[1].workspaceId)
    expect((await db.query('SELECT count(*) FROM page_studio_customer_workspaces')).rows[0].count).toBe('1')
    expect(await api.readCustomerSetup(a.sessionToken, run)).toMatchObject({ workspaceId: results[0].workspaceId })
    await expect(api.saveCustomerSetup(a.sessionToken, { expectedRevision: 1, draft }, run)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('does not complete an empty draft or accept an unknown timezone', async () => {
    const a = await signup()
    await expect(api.completeCustomerSetup(a.sessionToken, 0, run)).rejects.toMatchObject({ statusCode: 409 })
    await expect(api.saveCustomerSetup(a.sessionToken, { expectedRevision: 0, draft: { ...draft, timezone: 'Invalid/Zone' } }, run)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rolls back token consumption and identity creation if session persistence fails', async () => {
    const delivery = await request()
    await db.query(`CREATE FUNCTION fail_session() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$ LANGUAGE plpgsql`)
    await db.query('CREATE TRIGGER fail_session BEFORE INSERT ON page_studio_customer_sessions FOR EACH ROW EXECUTE FUNCTION fail_session()')
    try {
      await expect(api.verifyCustomerSignIn(delivery!.token, run)).rejects.toThrow('fixture failure')
      expect((await db.query('SELECT consumed_at FROM page_studio_customer_login_tokens')).rows[0].consumed_at).toBeNull()
      expect((await db.query('SELECT count(*) FROM page_studio_customer_identities')).rows[0].count).toBe('0')
    } finally {
      await db.query('DROP TRIGGER fail_session ON page_studio_customer_sessions; DROP FUNCTION fail_session()')
    }
    expect(await api.verifyCustomerSignIn(delivery!.token, run)).toHaveProperty('sessionToken')
  })
  it('rechecks workspace membership on completion retries and saved receipt reads', async () => {
    const a = await signup()
    await api.saveCustomerSetup(a.sessionToken, { expectedRevision: 0, draft }, run)
    await api.completeCustomerSetup(a.sessionToken, 1, run)
    await db.query('UPDATE page_studio_workspace_memberships SET revoked_at = NOW()')
    await expect(api.completeCustomerSetup(a.sessionToken, 1, run)).rejects.toMatchObject({ statusCode: 403 })
    await expect(api.readCustomerSetup(a.sessionToken, run)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('never lets an unverified account sign in and rejects foreign identity fields', async () => {
    await request()
    expect(await request('owner@example.test', 'signin')).toBeNull()
    const a = await signup()
    await expect(api.saveCustomerSetup(a.sessionToken, { expectedRevision: 0, draft, identityId: randomUUID() }, run)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('refreshes pending signup metadata with the link being verified, but never changes an active account', async () => {
    const first = await api.requestCustomerSignIn({ mode: 'signup', email: 'owner@example.test', name: 'Wrong', acceptedTerms: true }, 'old-v1', run)
    const old = (await db.query('SELECT terms_accepted_at FROM page_studio_customer_accounts')).rows[0].terms_accepted_at
    const next = await api.requestCustomerSignIn({ mode: 'signup', email: 'owner@example.test', name: 'Correct', acceptedTerms: true }, 'current-v2', run)
    const session = await api.verifyCustomerSignIn(next!.token, run)
    expect(await api.readCustomerSession(session.sessionToken, run)).toMatchObject({ name: 'Correct' })
    const account = (await db.query('SELECT name, terms_version, terms_accepted_at FROM page_studio_customer_accounts')).rows[0]
    expect(account.terms_version).toBe('current-v2')
    expect(account.terms_accepted_at.getTime()).toBeGreaterThan(old.getTime())
    await expect(api.verifyCustomerSignIn(first!.token, run)).rejects.toMatchObject({ statusCode: 401 })
    await api.requestCustomerSignIn({ mode: 'signup', email: 'owner@example.test', name: 'Forged', acceptedTerms: true }, 'forged-v3', run)
    expect((await db.query('SELECT name, terms_version, terms_accepted_at FROM page_studio_customer_accounts')).rows[0]).toEqual(account)
  })
})
