import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, type H3Event } from 'h3'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJwt } from '~~/server/utils/auth'
import { captureMcpPageStudioLogin } from '~~/server/utils/ai/mcp/pageStudioLogin'
import { consumeMcpRequestClaim, getConsumedMcpPageStudioLogin } from '~~/server/utils/ai/mcp/requestClaim'
import { lockPageStudioHistoryAuthority } from '~~/server/utils/pageStudio/historyAuthority'
import { revokePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { withPageStudioPublishAuthority } from '~~/server/utils/pageStudio/publishAuthority'
import type { PageStudioControlQueryClient } from '~~/server/utils/pageStudio/controlStore'
import { digestMcpRequestBody, MCP_REQUEST_AUDIENCE, signMcpRequestClaim } from '~~/shared/utils/mcpRequestClaim'

// End to end on PostgreSQL: genuine app login captured at OAuth consent -> signed MCP request claim ->
// exact consumed event -> the unchanged native history/publish authority SQL. Only connection
// acquisition is replaced; every query and match runs in a disposable schema.
const adapter = vi.hoisted(() => ({ run: undefined as undefined | (<T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>) }))
vi.mock('~~/server/utils/db', () => ({
  transaction: <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => {
    if (!adapter.run) throw new Error('Inject the disposable transaction')
    return adapter.run(callback)
  },
  transactionWithoutRetry: () => { throw new Error('Inject runTransaction') },
  queryOneFresh: () => { throw new Error('Unexpected application database access') },
  queryOne: () => { throw new Error('Unexpected application database access') },
  queryRows: () => { throw new Error('Unexpected application database access') },
  execute: () => { throw new Error('Unexpected application database access') }
}))

const databaseUrl = process.env.MARKETING_MCP_STUDIO_BRIDGE_DATABASE_TEST_URL
if (databaseUrl && !['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('The Studio login bridge test requires a disposable localhost PostgreSQL')
}
const userId = '30000000-0000-4000-8000-000000000901'
const clientId = '20000000-0000-4000-8000-000000000901'
const roleId = '60000000-0000-4000-8000-000000000901'
const tenantId = 'mcp-bridge'
const tool = 'marketing_publish_website_version'
const secret = 'bridge-request-signing-secret'
const migrations = [402, 404, 420, 422, 425, 429].map(number => readFileSync(new URL(`../../../server/database/migrations/${{
  402: '402_page_studio_control_plane', 404: '404_page_studio_documents', 420: '420_page_studio_login_sessions',
  422: '422_page_studio_cms_visibility', 425: '425_page_studio_cms_authoring_scope', 429: '429_page_studio_checkpoint_staging_outbox'
}[number]}.sql`, import.meta.url), 'utf8'))

function eventFor(headers: Record<string, string> = {}): H3Event {
  const request = new IncomingMessage(new Socket())
  request.method = 'POST'
  request.url = '/api/internal/mcp/call'
  request.headers = headers
  return createEvent(request, new ServerResponse(request))
}

describe.runIf(Boolean(databaseUrl))('original Page Studio login over MCP against the native authority SQL', () => {
  let observer: pg.Client
  let schema: string
  let siteId: string
  let token: string
  const clients: pg.Client[] = []

  async function connect() {
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    clients.push(db)
    await db.query(`SET search_path TO "${schema}", pg_catalog`)
    return db
  }
  async function run<T>(callback: (db: PageStudioControlQueryClient) => Promise<T>): Promise<T> {
    const db = await connect()
    await db.query('BEGIN')
    try {
      const result = await callback(db as unknown as PageStudioControlQueryClient)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  }

  /** Consent capture from the browser cookie, then one consumed MCP call carrying the proof. */
  async function connectAndCall() {
    const browser = eventFor({ cookie: `auth_token=${token}` })
    const proof = await captureMcpPageStudioLogin(browser, userId)
    expect(proof).toBeDefined()
    expect(JSON.stringify(proof)).not.toContain(token)
    const mcp = eventFor()
    const body = { userId, tool, args: {}, idempotencyKey: `mcp:${'b'.repeat(64)}` }
    const encoded = await signMcpRequestClaim({
      uid: userId, scope: ['mcp:read', 'mcp:write'], godMode: false, audience: MCP_REQUEST_AUDIENCE, method: 'POST',
      path: '/api/internal/mcp/call', toolName: tool, bodyDigest: await digestMcpRequestBody(body), pageStudioLogin: proof
    }, secret)
    await consumeMcpRequestClaim(mcp, encoded, userId, {
      signingSecret: secret, body, method: 'POST', path: '/api/internal/mcp/call', scopeHeader: undefined,
      resolveAuthority: (async () => null) as never, consumeNonce: async () => true
    })
    const login = getConsumedMcpPageStudioLogin(mcp, userId, tool)
    expect(login).not.toBeNull()
    return { browser, mcp, login: login! }
  }
  const scope = () => ({ tenantId, clientId, siteId })
  const actor = { role: 'agency' as const, actorId: userId, tenantId, canEdit: true }
  const history = (mcp: H3Event, login: NonNullable<ReturnType<typeof getConsumedMcpPageStudioLogin>>) =>
    run(db => lockPageStudioHistoryAuthority(db, mcp, actor, scope(), login).then(() => 'history-ok'))
  const publish = (login: NonNullable<ReturnType<typeof getConsumedMcpPageStudioLogin>>) =>
    withPageStudioPublishAuthority(scope(), { actorId: userId, tenantId, login }, async () => 'publish-ok', { runTransaction: run as never })

  beforeEach(async () => {
    schema = `mcp_studio_bridge_${randomUUID().replaceAll('-', '')}`
    observer = await connect()
    await observer.query(`CREATE SCHEMA "${schema}"`)
    await observer.query(`SET search_path TO "${schema}", pg_catalog`)
    await observer.query(`
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID,sessions_invalidated_at TIMESTAMPTZ);
      CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN);
      CREATE TABLE client_users(id UUID PRIMARY KEY,client_id UUID,status TEXT,role TEXT);
      CREATE TABLE client_sessions(token_hash TEXT PRIMARY KEY,client_user_id UUID,expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,UNIQUE(role_id,permission_group));
      CREATE TABLE page_studio_sessions(nonce TEXT PRIMARY KEY,tenant_id TEXT,client_id UUID,site_id UUID,user_id TEXT,
        role TEXT,capabilities JSONB,issued_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,revoked_at TIMESTAMPTZ);
    `)
    for (const sql of migrations) await observer.query(sql)
    await observer.query('INSERT INTO custom_roles VALUES($1,\'marketing_manager\',FALSE,FALSE)', [roleId])
    await observer.query('INSERT INTO role_permission_groups VALUES($1,\'PAGE_STUDIO_EDIT\'),($1,\'PAGE_STUDIO_PUBLISH\')', [roleId])
    await observer.query('INSERT INTO team_members VALUES($1,TRUE,\'staff\',$2,NULL)', [userId, roleId])
    await observer.query('INSERT INTO agency_clients VALUES($1,TRUE)', [clientId])
    const entitlement = (await observer.query(`INSERT INTO page_studio_entitlements(tenant_id,client_id,created_by)
      VALUES($1,$2,$3) RETURNING id`, [tenantId, clientId, userId])).rows[0]
    siteId = (await observer.query(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,created_by)
      VALUES($1,$2,$3,'Bridge fixture','mcp-bridge','fixture-v1',$4) RETURNING id`, [tenantId, clientId, entitlement.id, userId])).rows[0].id
    token = await createJwt({ userId, role: 'staff' })
    adapter.run = run
  })

  afterEach(async () => {
    adapter.run = undefined
    await Promise.all(clients.splice(0).filter(db => db !== observer).map(db => db.end()))
    try {
      await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await observer.end()
    }
  })

  it('authorises history and publication with the proven login, then refuses both after app logout', async () => {
    const { browser, mcp, login } = await connectAndCall()
    expect(await history(mcp, login)).toBe('history-ok')
    expect(await publish(login)).toBe('publish-ok')
    await revokePageStudioLoginSession(browser, 'agency')
    await expect(history(mcp, login)).rejects.toMatchObject({ statusCode: 401 })
    await expect(publish(login)).rejects.toMatchObject({ statusCode: 403 })
    // A tombstoned login can never be re-captured for a new connector grant.
    expect(await captureMcpPageStudioLogin(browser, userId)).toBeUndefined()
  })

  it('refuses the proof after "sign out everywhere" (sessions_invalidated_at)', async () => {
    const { mcp, login } = await connectAndCall()
    await observer.query('UPDATE team_members SET sessions_invalidated_at = NOW() + INTERVAL \'1 second\' WHERE id = $1', [userId])
    await expect(history(mcp, login)).rejects.toMatchObject({ statusCode: 403 })
    await expect(publish(login)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('applies the current native grants: PUBLISH removal, read-only role, deactivation and inactive client', async () => {
    const { mcp, login } = await connectAndCall()
    await observer.query('DELETE FROM role_permission_groups WHERE permission_group = \'PAGE_STUDIO_PUBLISH\'')
    await expect(publish(login)).rejects.toMatchObject({ statusCode: 403 })
    expect(await history(mcp, login)).toBe('history-ok')
    await observer.query('UPDATE custom_roles SET is_read_only = TRUE')
    await expect(history(mcp, login)).rejects.toMatchObject({ statusCode: 403 })
    await observer.query('UPDATE custom_roles SET is_read_only = FALSE')
    await observer.query('UPDATE agency_clients SET is_active = FALSE')
    await expect(history(mcp, login)).rejects.toMatchObject({ statusCode: 403 })
    await observer.query('UPDATE agency_clients SET is_active = TRUE')
    await observer.query('UPDATE team_members SET is_active = FALSE')
    await expect(history(mcp, login)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a proof whose timestamps were altered from the bound login row', async () => {
    const { login } = await connectAndCall()
    await expect(publish({ ...login, expiresAt: new Date(login.expiresAt.getTime() + 3_600_000) })).rejects.toMatchObject({ statusCode: 403 })
  })
})
