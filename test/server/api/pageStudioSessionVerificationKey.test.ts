import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { createApp, createError, eventHandler, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), verifyJwt: vi.fn(), query: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, verifyJwt: mocks.verifyJwt }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: mocks.transaction }))
vi.stubGlobal('eventHandler', eventHandler)
const { default: handler } = await import('~~/server/api/agency/page-studio/session-verification-key.get')
const actorId = randomUUID(), roleId = randomUUID()
const issuer = 'https://app.example.test'
const publicPem = (curve = 'prime256v1') => generateKeyPairSync('ec', { namedCurve: curve }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
const publicKey = publicPem()
const offCurveDer = Buffer.from(publicKey.replace(/-----(?:BEGIN|END) PUBLIC KEY-----|\s/g, ''), 'base64')
offCurveDer.fill(0, offCurveDer.length - 64)
const offCurveKey = `-----BEGIN PUBLIC KEY-----\n${offCurveDer.toString('base64')}\n-----END PUBLIC KEY-----`
const token = [btoa(JSON.stringify({ userId: actorId })), btoa('signature')].join('.')
const db = { query: mocks.query }
let staff: { user_role: string, custom_role_id: string | null } | null
let systemRole: boolean, activeLogin: boolean, invalidated: boolean
let sql: string[]
async function request(options: { env?: Record<string, unknown>, cookie?: string, query?: string, method?: string, headers?: Record<string, string> } = {}) {
  const env = options.env ?? { PAGE_STUDIO_SESSION_PUBLIC_KEY: publicKey, PAGE_STUDIO_SESSION_ISSUER: issuer }
  const app = createApp().use((event) => {
    event.context.cloudflare = { env }
  }).use(handler)
  return toWebHandler(app)(new Request(`https://app.example.test/api/agency/page-studio/session-verification-key${options.query ?? ''}`, {
    method: options.method ?? 'GET', headers: { host: 'app.example.test', cookie: options.cookie ?? `auth_token=${token}`, ...options.headers }
  }))
}
async function denied(response: Response, status: number) {
  expect(response.status).toBe(status)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.text()).not.toMatch(/private-secret|BEGIN|postgresql:|custom role|raw-error/)
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('eventHandler', eventHandler)
  staff = { user_role: 'owner', custom_role_id: null }
  systemRole = true
  activeLogin = true
  invalidated = false
  sql = []
  mocks.auth.mockResolvedValue({ id: actorId, role: 'owner', godMode: true })
  mocks.verifyJwt.mockResolvedValue({ userId: actorId, iat: Date.now() - 60_000, exp: Date.now() + 60_000 })
  mocks.transaction.mockImplementation(work => work(db))
  mocks.query.mockImplementation(async (text: string) => {
    sql.push(text)
    if (/SELECT user_role,custom_role_id/.test(text)) return { rows: staff ? [staff] : [] }
    if (/FROM custom_roles/.test(text)) return { rows: systemRole ? [{ id: roleId }] : [] }
    if (/FROM page_studio_login_sessions/.test(text)) return { rows: activeLogin ? [] : [{ user_id: actorId, revoked_at: new Date(), expires_at: new Date(Date.now() + 60_000) }] }
    if (/FROM team_members/.test(text)) return { rows: invalidated ? [] : [{ id: actorId }] }
    throw new Error('Unexpected SQL')
  })
  vi.stubEnv('PAGE_STUDIO_SESSION_PUBLIC_KEY', '')
  vi.stubEnv('PAGE_STUDIO_SESSION_ISSUER', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
describe('public session verification key operator bootstrap', () => {
  it('returns only the existing validated public material with no writes', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ publicKey, issuer, algorithm: 'ES256' })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(sql.length).toBeGreaterThan(0)
    expect(sql.every(statement => /^\s*SELECT\b/.test(statement))).toBe(true)
    expect(mocks.verifyJwt).toHaveBeenCalledWith(token)
  })
  it.each(['', 'client_session_token=customer', '__Host-studio_customer_session=customer'])('requires an original staff cookie: %s', async (cookie) => {
    await denied(await request({ cookie, headers: { authorization: 'Bearer internal-owner-delegation' } }), 401)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('accepts the alternate staff cookie while rejecting a forged cookie with a valid bearer fallback', async () => {
    expect((await request({ cookie: `auth_token_client=${token}` })).status).toBe(200)
    await denied(await request({ cookie: 'auth_token=forged', headers: { authorization: `Bearer ${token}` } }), 401)
  })
  it('preserves authentication denial before any database or config access', async () => {
    mocks.auth.mockRejectedValue(createError({ statusCode: 401, statusMessage: 'raw-error private-secret' }))
    await denied(await request(), 401)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([null, { userId: randomUUID(), iat: Date.now() - 1000, exp: Date.now() + 60_000 }, { userId: actorId, iat: Date.now() - 1000, exp: Date.now() - 1 }])('rejects invalid, foreign or expired original JWT', async (claims) => {
    mocks.verifyJwt.mockResolvedValue(claims)
    await denied(await request(), 401)
  })
  it('rejects revoked logins and staff-wide session invalidation without creating login rows', async () => {
    activeLogin = false
    await denied(await request(), 401)
    activeLogin = true
    invalidated = true
    await denied(await request(), 401)
    expect(sql.every(statement => /^\s*SELECT\b/.test(statement))).toBe(true)
  })
  it.each(['viewer', 'guest', 'client', 'project_manager'])('denies fresh non-operator role %s despite cached owner/God mode', async () => {
    staff = null
    await denied(await request(), 403)
    expect(mocks.query.mock.calls[0][0]).toContain('user_role IN (\'owner\',\'admin\')')
  })
  it('accepts a matching built-in system-role assignment under the actual role helper', async () => {
    staff = { user_role: 'admin', custom_role_id: roleId }
    expect((await request()).status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('AND is_system=TRUE FOR SHARE NOWAIT'), [roleId, 'admin'])
  })
  it.each(['custom owner role', 'mismatched built-in role'])('rejects %s without bypassing the actual helper', async () => {
    staff = { user_role: 'owner', custom_role_id: roleId }
    systemRole = false
    await denied(await request(), 403)
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('slug=$2'), [roleId, 'owner'])
  })
  it('reads only the two named public configuration properties', async () => {
    const accessed: string[] = []
    const env = new Proxy({ PAGE_STUDIO_SESSION_PUBLIC_KEY: publicKey, PAGE_STUDIO_SESSION_ISSUER: issuer }, {
      get(target, key: string) {
        accessed.push(key)
        if (!(key in target)) throw new Error('private-secret')
        return target[key]
      },
      ownKeys() { throw new Error('private-secret: environment enumeration') }
    })
    expect((await request({ env })).status).toBe(200)
    expect(accessed.sort()).toEqual(['PAGE_STUDIO_SESSION_ISSUER', 'PAGE_STUDIO_SESSION_PUBLIC_KEY'])
  })
  it('uses explicit Cloudflare bindings before local fallback', async () => {
    vi.stubEnv('PAGE_STUDIO_SESSION_PUBLIC_KEY', publicPem())
    vi.stubEnv('PAGE_STUDIO_SESSION_ISSUER', 'https://local.example.test')
    expect(await (await request()).json()).toEqual({ publicKey, issuer, algorithm: 'ES256' })
    for (const value of ['', undefined, null, false]) {
      await denied(await request({ env: { PAGE_STUDIO_SESSION_PUBLIC_KEY: value, PAGE_STUDIO_SESSION_ISSUER: issuer } }), 503)
      await denied(await request({ env: { PAGE_STUDIO_SESSION_PUBLIC_KEY: publicKey, PAGE_STUDIO_SESSION_ISSUER: value } }), 503)
    }
  })
  it('uses local fallback only for absent bindings and rejects missing configuration', async () => {
    await denied(await request({ env: {} }), 503)
    vi.stubEnv('PAGE_STUDIO_SESSION_PUBLIC_KEY', publicKey)
    vi.stubEnv('PAGE_STUDIO_SESSION_ISSUER', issuer)
    expect(await (await request({ env: {} })).json()).toEqual({ publicKey, issuer, algorithm: 'ES256' })
  })
  it.each([
    ['private envelope', publicKey.replaceAll('PUBLIC KEY', 'PRIVATE KEY')],
    ['RSA', generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()],
    ['P-384', publicPem('secp384r1')], ['off-curve public point', offCurveKey], ['malformed', '-----BEGIN PUBLIC KEY-----\nnot-valid-base64\n-----END PUBLIC KEY-----'],
    ['surrounding data', `private-secret\n${publicKey}`], ['concatenated PEMs', publicKey + publicKey],
    ['trailing DER', `-----BEGIN PUBLIC KEY-----\n${Buffer.concat([Buffer.from(publicKey.replace(/-----(?:BEGIN|END) PUBLIC KEY-----|\s/g, ''), 'base64'), Buffer.from([0])]).toString('base64')}\n-----END PUBLIC KEY-----`],
    ['oversized', 'x'.repeat(16_385)]
  ])('rejects %s instead of returning invalid or private material', async (_label, key) => {
    await denied(await request({ env: { PAGE_STUDIO_SESSION_PUBLIC_KEY: key, PAGE_STUDIO_SESSION_ISSUER: issuer } }), 503)
  })
  it.each(['http://app.example.test', 'https://user:private-secret@app.example.test', 'https://app.example.test/path', 'https://app.example.test?x=1', 'https://app.example.test/#fragment', 'invalid'])('preserves issuer-origin policy for %s', async (value) => {
    await denied(await request({ env: { PAGE_STUDIO_SESSION_PUBLIC_KEY: publicKey, PAGE_STUDIO_SESSION_ISSUER: value } }), 503)
  })
  it.each([{ query: '?key=private' }, { query: '?issuer=https://attacker.test' }, { headers: { 'content-length': '2' } }, { headers: { 'transfer-encoding': 'chunked' } }])('rejects all unknown request inputs %j', async (options) => {
    await denied(await request(options), 400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects non-GET methods before any authority or configuration work', async () => {
    await denied(await request({ method: 'POST' }), 405)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([new Error('raw-error postgresql://private-secret'), { statusCode: 503, message: 'private-secret', data: { secret: 'private-secret' } }])('uses generic no-store errors for infrastructure failure', async (error) => {
    mocks.query.mockRejectedValue(error)
    await denied(await request(), 503)
  })
})
