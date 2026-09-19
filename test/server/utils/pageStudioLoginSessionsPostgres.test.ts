import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { resolve } from 'node:path'
import { createEvent, type H3Event } from 'h3'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJwt, verifyJwt } from '~~/server/utils/auth'
import {
  bindPageStudioLoginSession, resolvePageStudioLoginSession, revokePageStudioLoginSession,
  type PageStudioLoginSession
} from '~~/server/utils/pageStudio/loginSessions'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import type { PageStudioSessionQueryClient } from '~~/server/utils/pageStudio/sessions'

// The production helpers execute their complete SQL against PostgreSQL. This
// adapter replaces only connection acquisition, never query results or matching.
const adapter = vi.hoisted(() => ({
  transaction: undefined as undefined | (<T>(callback: (db: PageStudioSessionQueryClient) => Promise<T>) => Promise<T>)
}))
vi.mock('~~/server/utils/db', () => ({
  transaction: <T>(callback: (db: PageStudioSessionQueryClient) => Promise<T>) => {
    if (!adapter.transaction) throw new Error('Disposable database is not connected')
    return adapter.transaction(callback)
  },
  queryOne: () => { throw new Error('Unexpected application database call') },
  queryOneFresh: () => { throw new Error('Unexpected application database call') },
  queryRows: () => { throw new Error('Unexpected application database call') },
  execute: () => { throw new Error('Unexpected application database call') }
}))

const databaseUrl = process.env.PAGE_STUDIO_SESSION_AUTHORITY_DATABASE_TEST_URL
  ?? process.env.PAGE_STUDIO_AUTHORITY_DATABASE_TEST_URL
const userId = '30000000-0000-4000-8000-000000000401'
const clientId = '20000000-0000-4000-8000-000000000401'
const siteId = '50000000-0000-4000-8000-000000000401'
type Role = PageStudioLoginSession['role']

function eventFor(token?: string, cookie?: string): H3Event {
  const request = new IncomingMessage(new Socket())
  request.method = 'POST'
  request.url = '/test/logout'
  request.headers = token ? (cookie ? { cookie: `${cookie}=${encodeURIComponent(token)}` } : { authorization: `Bearer ${token}` }) : {}
  return createEvent(request, new ServerResponse(request))
}

describe.runIf(Boolean(databaseUrl))('Studio login helpers on disposable PostgreSQL', () => {
  const schema = `studio_login_${randomUUID().replaceAll('-', '')}`
  let observer: pg.Client
  let connected = false
  const transactionPids = new Set<number>()

  async function connection(): Promise<pg.Client> {
    const db = new pg.Client({ connectionString: databaseUrl, options: `-c search_path=${schema},pg_catalog` })
    await db.connect()
    return db
  }

  async function transaction<T>(callback: (db: PageStudioSessionQueryClient) => Promise<T>): Promise<T> {
    const db = await connection()
    const pid = (await db.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
    transactionPids.add(pid)
    try {
      await db.query('BEGIN')
      const result = await callback(db as unknown as PageStudioSessionQueryClient)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    } finally {
      transactionPids.delete(pid)
      await db.end()
    }
  }

  async function credential(role: Role): Promise<string> {
    if (role === 'agency') return createJwt({ userId, role: 'owner' })
    const token = randomUUID()
    await observer.query(`INSERT INTO client_sessions (token_hash, client_user_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '1 day')`, [await digestPortalSessionToken(token), userId])
    return token
  }

  async function insertChild(db: PageStudioSessionQueryClient, login: PageStudioLoginSession, nonce = randomUUID()): Promise<string> {
    await db.query(`INSERT INTO page_studio_sessions
      (nonce, tenant_id, client_id, site_id, user_id, role, login_session_hash)
      VALUES ($1, 'login-test', $2, $3, $4, $5, $6)`, [nonce, clientId, siteId, login.userId, login.role, login.tokenHash])
    return nonce
  }

  async function issue(token: string, role: Role): Promise<string> {
    return transaction(async (db) => {
      const login = await resolvePageStudioLoginSession(db, eventFor(token), role, userId)
      await bindPageStudioLoginSession(db, login)
      return insertChild(db, login)
    })
  }

  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    observer = new pg.Client({ connectionString: databaseUrl })
    await observer.connect()
    connected = true
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query(`SET search_path TO "${schema}", pg_catalog`)
    await observer.query(`
      CREATE TABLE page_studio_sessions (nonce TEXT PRIMARY KEY, tenant_id TEXT, client_id UUID,
        site_id UUID, user_id TEXT, role TEXT, revoked_at TIMESTAMPTZ);
      CREATE TABLE client_sessions (token_hash TEXT PRIMARY KEY, client_user_id UUID, expires_at TIMESTAMPTZ);
      CREATE TABLE page_studio_audit_events (tenant_id TEXT, client_id UUID, site_id UUID,
        actor_id TEXT, actor_role TEXT, action TEXT, resource_type TEXT, resource_id TEXT, metadata JSONB);
    `)
    const migration = await readFile(resolve(process.cwd(), 'server/database/migrations/420_page_studio_login_sessions.sql'), 'utf8')
    await observer.query(migration)
    await observer.query(migration)
    adapter.transaction = transaction
  })

  beforeEach(async () => {
    await observer.query('TRUNCATE page_studio_sessions, page_studio_login_sessions, client_sessions, page_studio_audit_events')
  })

  afterAll(async () => {
    adapter.transaction = undefined
    if (!connected) return
    try {
      await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await observer.end()
    }
  })

  it('resolves and binds a cryptographically verified agency cookie without storing the credential', async () => {
    const token = await credential('agency')
    const jwt = await verifyJwt(token)
    expect(jwt.userId).toBe(userId)
    const login = await transaction(async (db) => {
      const result = await resolvePageStudioLoginSession(db, eventFor(token, 'auth_token'), 'agency', userId)
      await bindPageStudioLoginSession(db, result)
      return result
    })
    expect(login.issuedAt.getTime()).toBe(jwt.iat)
    expect(login.expiresAt.getTime()).toBe(jwt.exp)
    expect(login.tokenHash).toBe(await digestPortalSessionToken(token))
    const retained = (await observer.query('SELECT * FROM page_studio_login_sessions')).rows
    expect(retained).toHaveLength(1)
    expect(JSON.stringify(retained)).not.toContain(token)
    expect(retained[0].revoked_at).toBeNull()
  })

  it('rejects a modified agency signature and a valid token belonging to a different actor', async () => {
    const token = await credential('agency')
    const [payload, signature] = token.split('.')
    const modified = `${payload}.${signature![0] === 'A' ? 'B' : 'A'}${signature!.slice(1)}`
    await expect(transaction(db => resolvePageStudioLoginSession(db, eventFor(modified), 'agency', userId))).rejects.toMatchObject({ statusCode: 401 })
    await expect(transaction(db => resolvePageStudioLoginSession(db, eventFor(token), 'agency', randomUUID()))).rejects.toMatchObject({ statusCode: 401 })
    expect((await observer.query('SELECT * FROM page_studio_login_sessions')).rows).toHaveLength(0)
  })

  it('creates a logout tombstone before the first Studio launch and refuses subsequent binding', async () => {
    const token = await credential('agency')
    const login = await transaction(db => resolvePageStudioLoginSession(db, eventFor(token), 'agency', userId))
    await revokePageStudioLoginSession(eventFor(token), 'agency')
    const row = (await observer.query('SELECT * FROM page_studio_login_sessions')).rows[0]
    expect(row.token_hash).toBe(login.tokenHash)
    expect(row.revoked_at).toBeInstanceOf(Date)
    await expect(transaction(db => bindPageStudioLoginSession(db, login))).rejects.toMatchObject({ statusCode: 401 })
    expect((await observer.query('SELECT * FROM page_studio_sessions')).rows).toHaveLength(0)
    expect((await observer.query('SELECT * FROM page_studio_audit_events')).rows).toHaveLength(0)
  })

  it('rejects an expired native portal login or a native login belonging to another user', async () => {
    const token = await credential('client')
    await expect(transaction(db => resolvePageStudioLoginSession(db, eventFor(token), 'client', randomUUID()))).rejects.toMatchObject({ statusCode: 401 })
    await observer.query('UPDATE client_sessions SET expires_at=NOW() - INTERVAL \'1 second\'')
    await expect(transaction(db => resolvePageStudioLoginSession(db, eventFor(token), 'client', userId))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('revokes both presented agency cookie logins while preserving an unrelated bearer login', async () => {
    const tokenA = await credential('agency')
    const tokenB = await credential('agency')
    const tokenC = await credential('agency')
    const childA = await issue(tokenA, 'agency')
    const childB = await issue(tokenB, 'agency')
    const childC = await issue(tokenC, 'agency')
    const event = eventFor(tokenA, 'auth_token')
    event.node.req.headers.cookie += `; auth_token_client=${encodeURIComponent(tokenB)}`
    event.node.req.headers.authorization = `Bearer ${tokenC}`
    await revokePageStudioLoginSession(event, 'agency')
    const children = (await observer.query('SELECT nonce, revoked_at FROM page_studio_sessions')).rows
    expect(children.find(row => row.nonce === childA).revoked_at).toBeInstanceOf(Date)
    expect(children.find(row => row.nonce === childB).revoked_at).toBeInstanceOf(Date)
    expect(children.find(row => row.nonce === childC).revoked_at).toBeNull()
    const audit = (await observer.query('SELECT resource_id FROM page_studio_audit_events ORDER BY resource_id')).rows
    expect(audit.map(row => row.resource_id)).toEqual([childA, childB].sort())
    await expect(issue(tokenA, 'agency')).rejects.toMatchObject({ statusCode: 401 })
    await expect(issue(tokenB, 'agency')).rejects.toMatchObject({ statusCode: 401 })
    await expect(issue(tokenC, 'agency')).resolves.toEqual(expect.any(String))
  })

  it.each(['extra segment', 'omitted base64 padding'])('revokes the canonical agency login when logout presents an accepted %s variant', async (variant) => {
    const token = await credential('agency')
    const independentToken = await credential('agency')
    const nonce = await issue(token, 'agency')
    const independentNonce = await issue(independentToken, 'agency')
    const alias = variant === 'extra segment' ? `${token}.ignored` : token.replace(/=+(?=\.|$)/g, '')
    expect(alias).not.toBe(token)
    expect((await verifyJwt(alias)).userId).toBe(userId)
    await expect(issue(alias, 'agency')).rejects.toMatchObject({ statusCode: 401 })
    await revokePageStudioLoginSession(eventFor(alias, 'auth_token'), 'agency')
    const parent = (await observer.query('SELECT revoked_at FROM page_studio_login_sessions WHERE role=$1 AND token_hash=$2',
      ['agency', await digestPortalSessionToken(token)])).rows[0]
    expect(parent.revoked_at).toBeInstanceOf(Date)
    const children = (await observer.query('SELECT nonce, revoked_at FROM page_studio_sessions')).rows
    expect(children.find(row => row.nonce === nonce).revoked_at).toBeInstanceOf(Date)
    expect(children.find(row => row.nonce === independentNonce).revoked_at).toBeNull()
    expect((await observer.query('SELECT resource_id FROM page_studio_audit_events')).rows).toEqual([{ resource_id: nonce }])
    await expect(issue(token, 'agency')).rejects.toMatchObject({ statusCode: 401 })
    await expect(issue(independentToken, 'agency')).resolves.toEqual(expect.any(String))
  })

  describe.each(['agency', 'client'] as const)('%s logout', (role) => {
    it('requires a native login credential to resolve an editor parent', async () => {
      await expect(transaction(db => resolvePageStudioLoginSession(db, eventFor(), role, userId))).rejects.toMatchObject({ statusCode: 401 })
    })

    it('revokes only login A and its children while preserving login B for the same user', async () => {
      const tokenA = await credential(role)
      const tokenB = await credential(role)
      const firstA = await issue(tokenA, role)
      const secondA = await issue(tokenA, role)
      const childB = await issue(tokenB, role)
      await revokePageStudioLoginSession(eventFor(tokenA), role)
      const children = (await observer.query('SELECT nonce, revoked_at FROM page_studio_sessions ORDER BY nonce')).rows
      expect(children.find(row => row.nonce === firstA).revoked_at).toBeInstanceOf(Date)
      expect(children.find(row => row.nonce === secondA).revoked_at).toBeInstanceOf(Date)
      expect(children.find(row => row.nonce === childB).revoked_at).toBeNull()
      const audit = (await observer.query('SELECT * FROM page_studio_audit_events ORDER BY resource_id')).rows
      expect(audit.map(row => row.resource_id)).toEqual([firstA, secondA].sort())
      expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({
        tenant_id: 'login-test', client_id: clientId, site_id: siteId, actor_id: userId,
        actor_role: role, action: 'session.revoked', resource_type: 'session', metadata: { reason: 'login_logout' }
      })]))
      await expect(issue(tokenB, role)).resolves.toEqual(expect.any(String))
      await expect(issue(tokenA, role)).rejects.toMatchObject({ statusCode: 401 })
      if (role === 'client') {
        const native = (await observer.query('SELECT token_hash FROM client_sessions')).rows
        expect(native).toEqual([{ token_hash: await digestPortalSessionToken(tokenB) }])
      }
    })

    it('makes repeated logout idempotent without duplicating audit events or replacing the revocation time', async () => {
      const token = await credential(role)
      const nonce = await issue(token, role)
      const event = eventFor(token, role === 'agency' ? 'auth_token_client' : 'client_session_token')
      await revokePageStudioLoginSession(event, role)
      const first = (await observer.query('SELECT revoked_at FROM page_studio_sessions WHERE nonce=$1', [nonce])).rows[0]
      await revokePageStudioLoginSession(event, role)
      const second = (await observer.query('SELECT revoked_at FROM page_studio_sessions WHERE nonce=$1', [nonce])).rows[0]
      expect(first.revoked_at).toBeInstanceOf(Date)
      expect(second.revoked_at).toEqual(first.revoked_at)
      expect((await observer.query('SELECT resource_id FROM page_studio_audit_events')).rows).toEqual([{ resource_id: nonce }])
    })

    it('waits for an in-progress issuance lock, then revokes the newly committed child', async () => {
      const token = await credential(role)
      const issuer = await connection()
      let logout: Promise<void> | undefined
      let nonce: string | undefined
      try {
        await issuer.query('BEGIN')
        const issuerPid = (await issuer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
        const login = await resolvePageStudioLoginSession(issuer as unknown as PageStudioSessionQueryClient, eventFor(token), role, userId)
        await bindPageStudioLoginSession(issuer as unknown as PageStudioSessionQueryClient, login)
        nonce = await insertChild(issuer as unknown as PageStudioSessionQueryClient, login)
        logout = revokePageStudioLoginSession(eventFor(token), role)
        // Inspect PostgreSQL's actual lock graph instead of assuming a sleep
        // means logout was blocked. This also proves distinct DB connections.
        await expect.poll(async () => {
          const result = await observer.query<{ waiting: boolean }>(`SELECT EXISTS(
            SELECT 1 FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND $2=ANY(pg_blocking_pids(pid))
          ) AS waiting`, [[...transactionPids], issuerPid])
          return result.rows[0]!.waiting
        }, { timeout: 3000, interval: 20 }).toBe(true)
        expect((await observer.query('SELECT nonce FROM page_studio_sessions')).rows).toHaveLength(0)
        await issuer.query('COMMIT')
        await logout
        const child = (await observer.query('SELECT revoked_at FROM page_studio_sessions WHERE nonce=$1', [nonce])).rows[0]
        expect(child.revoked_at).toBeInstanceOf(Date)
        expect((await observer.query('SELECT resource_id FROM page_studio_audit_events')).rows).toEqual([{ resource_id: nonce }])
      } finally {
        await issuer.query('ROLLBACK')
        await issuer.end()
        await logout
      }
    })

    it('does not permit rebinding after logout committed before issuance', async () => {
      const token = await credential(role)
      await issue(token, role)
      await revokePageStudioLoginSession(eventFor(token), role)
      await expect(issue(token, role)).rejects.toMatchObject({ statusCode: 401 })
      expect((await observer.query('SELECT * FROM page_studio_sessions WHERE revoked_at IS NULL')).rows).toHaveLength(0)
    })
  })
})
