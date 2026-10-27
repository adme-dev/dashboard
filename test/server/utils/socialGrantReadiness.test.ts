import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest'
import { createError } from 'h3'
import { guardedSocialTask3Pool, resetSocialTask3Schema, socialTask3DbModule } from '../../helpers/socialRevisionPostgres'

const f = vi.hoisted(() => ({ db: null as any, oauth: vi.fn(), http: vi.fn(), state: null as any, scope: undefined as string | undefined, multi: false }))
vi.mock('~~/server/utils/db', () => Object.fromEntries(['execute', 'queryOne', 'queryRows', 'queryOneFresh', 'queryRowsFresh', 'transaction'].map(k => [k, (...args: any[]) => f.db[k](...args)])))
vi.mock('ofetch', () => ({ ofetch: (...args: any[]) => f.oauth(...args), $fetch: (...args: any[]) => f.oauth(...args) }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: S, role: 'creative', permissionGroups: ['CREATIVE'] }), requireRole: async () => ({ id: S }) }))
vi.mock('~~/server/utils/socialOAuth/state', () => ({ verifyState: () => f.state, signState: () => 'selection', expiredMetaStateContext: () => null }))
vi.mock('~~/server/utils/social/publishingAccountGodMode', () => ({ executeGodModeSocialPublishingAccountComplete: async (_event: any, fn: any) => f.db.transaction(fn) }))
const C = '0a000000-0000-4000-8000-00000000000a', S = '51000000-0000-4000-8000-000000000001'
const dsn = process.env.SOCIAL_TASK5_TEST_DSN ?? ''
let pool: ReturnType<typeof guardedSocialTask3Pool>, kv: Map<string, string>
const event = () => ({ query: { clientId: C, code: 'code', state: 'state' }, context: { cloudflare: { env: {
  SOCIAL_OAUTH_REDIRECT_BASE: 'https://fixture.test', LINKEDIN_ORGANIC_CLIENT_SECRET: 'fixture-secret', SOCIAL_OAUTH_STATE_SECRET: 'fixture', MCP_MARKETING_STAFF_GRANTS: JSON.stringify({ [S]: ['social_draft', 'reporting'] }),
  CACHE: { put: async (k: string, v: string) => {
    kv.set(k, v)
  }, get: async (k: string) => kv.get(k), delete: async (k: string) => {
    kv.delete(k)
  } } } } } } as any)
async function lists() {
  const ev = event()
  const browser = await (await import('~~/server/api/agency/social/publishing/accounts/index.get')).default(ev)
  const { resolveMcpStaffContext } = await import('~~/server/utils/ai/mcp/staffAuthority')
  const ctx = await resolveMcpStaffContext(ev, S, ['mcp:read', 'mcp:write'])
  const { socialMcpTools } = await import('~~/server/utils/ai/mcp/socialTools')
  const result = await socialMcpTools.find(t => t.name === 'list_social_publishing_accounts')!.handler({ clientId: C }, ctx)
  return { browser, mcp: (result as any).data.accounts, ctx }
}
describe.skipIf(!dsn)('I4 actual callback selection and readiness compositions', () => {
  beforeAll(async () => {
    pool = guardedSocialTask3Pool(dsn)
    f.db = socialTask3DbModule(pool)
  })
  afterAll(async () => {
    await pool?.end()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
  beforeEach(async () => {
    await resetSocialTask3Schema(pool)
    await pool.query('ALTER TABLE social_accounts ALTER COLUMN id SET DEFAULT gen_random_uuid(), ADD COLUMN created_by UUID, ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW(), ADD COLUMN last_synced_at TIMESTAMPTZ')
    await pool.query('INSERT INTO agency_clients VALUES($1,\'Client\',TRUE)', [C])
    await pool.query('INSERT INTO team_members(id,user_role,role) VALUES($1,\'creative\',\'creative\')', [S])
    await pool.query('INSERT INTO client_team_assignments VALUES($1,$2)', [S, C])
    kv = new Map()
    f.state = { clientId: C, userId: S, platform: 'linkedin' }
    f.scope = 'w_organization_social r_organization_social'
    f.multi = false
    vi.stubGlobal('defineEventHandler', (fn: any) => fn)
    vi.stubGlobal('getQuery', (e: any) => e.query)
    vi.stubGlobal('getRequestURL', () => new URL('https://fixture.test'))
    vi.stubGlobal('sendRedirect', (_e: any, location: string) => location)
    vi.stubGlobal('readBody', async (e: any) => e.body)
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('fetch', (...args: any[]) => f.http(...args))
    vi.stubGlobal('$fetch', (...args: any[]) => f.oauth(...args))
    vi.stubEnv('META_APP_ID', 'fixture-app')
    vi.stubEnv('META_APP_SECRET', 'fixture-secret')
    f.oauth.mockReset().mockImplementation(async (url: string) => {
      if (url.includes('accessToken')) return { access_token: 'new-token', refresh_token: 'refresh', expires_in: 3600, scope: f.scope }
      if (url.includes('organizationAcls')) return { elements: (f.multi ? ['11', '22'] : ['11']).map(id => ({ organization: `urn:li:organization:${id}`, role: 'ADMINISTRATOR' })) }
      if (url.includes('/organizations?')) return { results: { 11: { localizedName: 'Org A' }, 22: { localizedName: 'Org B' } } }
      return { access_token: 'user-token', expires_in: 5184000 }
    })
    f.http.mockReset().mockImplementation(async (url: string) => ({ ok: true, status: 200, json: async () => url.includes('/debug_token')
      ? { data: { is_valid: true, app_id: 'fixture-app', scopes: ['pages_manage_posts'], granular_scopes: [{ scope: 'pages_manage_posts', target_ids: ['11'] }] } }
      : url.includes('/me/accounts') ? { data: (f.multi ? ['11', '22'] : ['11']).map(id => ({ id, name: `Page ${id}`, access_token: `page-token-${id}` })) } : { success: true } }))
  })
  it.each(['media_buyer', 'account_manager', 'clients_only', 'creative', 'owner', 'admin', 'read_only'])('R3 fresh browser publishing policy for %s', async (role) => {
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/linkedin.get')).default(event())
    if (role === 'clients_only' || role === 'read_only') {
      const id = 'cc000000-0000-4000-8000-000000000001'
      await pool.query('INSERT INTO custom_roles(id,slug,is_read_only) VALUES($1,$2,$3)', [id, role, role === 'read_only'])
      await pool.query('INSERT INTO role_permission_groups VALUES($1,$2)', [id, role === 'clients_only' ? 'CLIENTS' : 'CREATIVE'])
      await pool.query('UPDATE team_members SET role=$1,user_role=$1,custom_role_id=$2', [role, id])
    } else await pool.query('UPDATE team_members SET role=$1,user_role=$1', [role])
    if (role === 'owner' || role === 'admin') await pool.query('DELETE FROM client_team_assignments')
    const browser = await (await import('~~/server/api/agency/social/publishing/accounts/index.get')).default(event())
    expect(browser).toHaveLength(1)
    expect(browser[0].operations.find((r: any) => r.operation === 'organic_publish').state)
      .toBe(['creative', 'owner', 'admin'].includes(role) ? 'available' : 'external_blocked')
    expect(browser[0].operations.find((r: any) => r.operation === 'organic_publish').authorityChannel).toBe('browser')
  })
  it.each([false, true])('persists LinkedIn actual grants through callback/selection multi=%s and exposes real browser/MCP readiness', async (multi) => {
    f.multi = multi
    const ev = event()
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/linkedin.get')).default(ev)
    if (multi) {
      const [key] = [...kv.keys()]
      f.state = { clientId: C, userId: S, nonce: key!.replace('social_oauth_pending:', '') }
      ev.body = { token: 'selection', pageIds: ['22'] }
      await (await import('~~/server/api/agency/social/publishing/accounts/complete.post')).default(ev)
    }
    const { browser, mcp, ctx } = await lists()
    expect(browser[0].operations.find((r: any) => r.operation === 'organic_publish').state).toBe('available')
    expect(mcp[0].publishReady).toBe(true)
    const { socialMcpTools } = await import('~~/server/utils/ai/mcp/socialTools')
    ctx.mcpScopes = new Set(['mcp:read'])
    const readOnly: any = await socialMcpTools.find(t => t.name === 'list_social_publishing_accounts')!.handler({ clientId: C }, ctx)
    expect(readOnly.data.accounts[0].publishReady).toBe(false)
    f.multi = false
    f.state = { clientId: C, userId: S, platform: 'linkedin' }
    f.scope = undefined
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/linkedin.get')).default(ev)
    const rows = (await pool.query('SELECT metadata FROM social_accounts WHERE platform_account_id=\'11\'')).rows
    expect(rows[0].metadata.grantedScopes).toEqual([])
  })
  it.each([false, true])('maps only actual Page-scoped Meta grants through callback/selection multi=%s', async (multi) => {
    f.multi = multi
    f.state = { clientId: C, userId: S }
    const ev = event()
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/meta.get')).default(ev)
    if (multi) {
      const [key] = [...kv.keys()]
      f.state = { clientId: C, userId: S, nonce: key!.replace('social_oauth_pending:', '') }
      ev.body = { token: 'selection', pageIds: ['11', '22'] }
      await (await import('~~/server/api/agency/social/publishing/accounts/complete.post')).default(ev)
    }
    const { browser, mcp } = await lists()
    expect(browser.find((r: any) => r.platform_account_id === '11').operations.find((r: any) => r.operation === 'organic_publish').state).toBe('available')
    expect(mcp.find((r: any) => r.platformAccountId === '11').publishReady).toBe(true)
    if (multi)expect(mcp.find((r: any) => r.platformAccountId === '22').publishReady).toBe(false)
  })
  it('maps Page-scoped Instagram grants and requires the linked Page in browser and MCP readiness', async () => {
    f.multi = true
    f.state = { clientId: C, userId: S }
    const ev = event(), original = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url: string, ...args: any[]) => {
      const response = await original(url, ...args), data = await response.json()
      if (url.includes('/me/accounts'))data.data = data.data.map((p: any) => ({ ...p, instagram_business_account: { id: `ig-${p.id}`, username: `ig${p.id}` } }))
      if (url.includes('/debug_token')) {
        data.data.scopes.push('instagram_content_publish')
        data.data.granular_scopes.push({ scope: 'instagram_content_publish', target_ids: ['11'] })
      }
      return { ...response, json: async () => data }
    })
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/meta.get')).default(ev)
    const [key] = [...kv.keys()]
    f.state = { clientId: C, userId: S, nonce: key!.replace('social_oauth_pending:', '') }
    ev.body = { token: 'selection', pageIds: ['11', '22'] }
    await (await import('~~/server/api/agency/social/publishing/accounts/complete.post')).default(ev)
    let current = await lists()
    expect(current.mcp.find((r: any) => r.platformAccountId === 'ig-11').publishReady).toBe(true)
    expect(current.mcp.find((r: any) => r.platformAccountId === 'ig-22').publishReady).toBe(false)
    expect(current.browser.find((r: any) => r.platform_account_id === 'ig-11').operations.find((r: any) => r.operation === 'organic_publish').state).toBe('available')
    await pool.query('UPDATE social_accounts SET is_active=FALSE WHERE platform=\'facebook\' AND platform_account_id=\'11\'')
    current = await lists()
    expect(current.mcp.find((r: any) => r.platformAccountId === 'ig-11').publishReady).toBe(false)
    expect(current.browser.find((r: any) => r.platform_account_id === 'ig-11').operations.find((r: any) => r.operation === 'organic_publish').state).toBe('external_blocked')
  })
  it.each(['all', 'empty', 'absent', 'revoked', 'missing', 'invalid'])('Meta reconnect replaces evidence with precise granular semantics: %s', async (mode) => {
    f.state = { clientId: C, userId: S }
    const ev = event()
    const callback = (await import('~~/server/api/agency/social/publishing/accounts/callback/meta.get')).default
    await callback(ev)
    const original = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url: string, ...args: any[]) => {
      if (!url.includes('/debug_token')) return original(url, ...args)
      const entry = mode === 'all' ? { scope: 'pages_manage_posts' } : { scope: 'pages_manage_posts', target_ids: [] }
      return { ok: true, status: 200, json: async () => ({ data: { is_valid: mode !== 'invalid', app_id: 'fixture-app', scopes: mode === 'revoked' ? [] : ['pages_manage_posts'], ...(mode === 'missing' ? {} : { granular_scopes: mode === 'absent' ? [] : [entry] }) } }) }
    })
    await callback(ev)
    expect((await lists()).mcp[0].publishReady).toBe(mode === 'all')
    expect((await pool.query('SELECT metadata FROM social_accounts')).rows[0].metadata.grantedScopes).toEqual(mode === 'all' ? ['pages_manage_posts'] : [])
  })
  it.each(['winner', 'revoked'])('LinkedIn refresh preserves the winning CAS or clears revoked evidence: %s', async (mode) => {
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/linkedin.get')).default(event())
    const account = (await pool.query('UPDATE social_accounts SET token_expires_at=NOW() RETURNING *')).rows[0]
    f.oauth.mockImplementation(async () => {
      if (mode === 'revoked') throw new Error('invalid_grant: revoked')
      await pool.query('UPDATE social_accounts SET access_token=\'winner\',metadata=metadata || \'{"grantedScopes":[]}\'::jsonb')
      return { access_token: 'loser', scope: 'w_organization_social', expires_in: 3600 }
    })
    const refresh = (await import('~~/server/utils/socialInbox/tokenRefresh')).resolveSocialAccountAccessToken
    if (mode === 'revoked') await expect(refresh({ event: event(), db: f.db, account })).rejects.toThrow('revoked')
    else expect(await refresh({ event: event(), db: f.db, account })).toBe('winner')
    const current = (await pool.query('SELECT * FROM social_accounts')).rows[0]
    expect(current.metadata.grantedScopes).toEqual([])
    if (mode === 'winner')expect(current.access_token).toBe('winner')
    expect((await lists()).mcp[0].publishReady).toBe(false)
  })
  it('browser role read-only blocks publishing without inventing connector scopes', async () => {
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/linkedin.get')).default(event())
    await pool.query('INSERT INTO custom_roles(id,is_read_only) VALUES(\'00000000-0000-4000-8000-000000000011\',TRUE)')
    await pool.query('INSERT INTO role_permission_groups VALUES(\'00000000-0000-4000-8000-000000000011\',\'CREATIVE\')')
    await pool.query('UPDATE team_members SET custom_role_id=\'00000000-0000-4000-8000-000000000011\'')
    const browser = await (await import('~~/server/api/agency/social/publishing/accounts/index.get')).default(event())
    expect(browser[0].operations.find((r: any) => r.operation === 'organic_publish')).toMatchObject({ authorityChannel: 'browser', state: 'external_blocked', reason: 'The current browser role is read-only.' })
  })
  it('refresh replaces missing/revoked LinkedIn evidence under the winning token CAS', async () => {
    await (await import('~~/server/api/agency/social/publishing/accounts/callback/linkedin.get')).default(event())
    const account = (await pool.query('UPDATE social_accounts SET token_expires_at=NOW() RETURNING *')).rows[0]
    f.scope = undefined
    await (await import('~~/server/utils/socialInbox/tokenRefresh')).resolveSocialAccountAccessToken({ event: event(), db: f.db, account })
    const row = (await pool.query('SELECT * FROM social_accounts')).rows[0]
    expect(row.metadata.grantedScopes).toEqual([])
    expect((await lists()).mcp[0].publishReady).toBe(false)
  })
})
