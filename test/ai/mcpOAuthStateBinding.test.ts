import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The consent assertion is bound to the exact OAuth authorization request (`state`). A captured
// assertion can no longer complete a different OAuth request, and only a state-bound assertion
// carries the original Page Studio login proof into a grant.
const m = vi.hoisted(() => ({ consent: vi.fn((opts: Record<string, string>) => opts), capture: vi.fn(), user: { id: '11111111-1111-4111-8111-111111111111', name: 'Staff' } }))
vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    defineEventHandler: <T>(handler: T) => handler,
    getHeader: (event: { headers?: Record<string, string> }, name: string) => event.headers?.[name.toLowerCase()],
    readBody: async (event: { body?: unknown }) => event.body,
    getQuery: (event: { query?: unknown }) => event.query ?? {},
    sendRedirect: (_event: unknown, location: string) => ({ redirect: location })
  }
})
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => m.user }))
vi.mock('~~/server/utils/ai/mcp/consent', () => ({ buildConsentHtml: m.consent }))
vi.mock('~~/server/utils/ai/mcp/pageStudioLogin', () => ({ captureMcpPageStudioLogin: m.capture }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: async () => ({ active: false }) }))

const { signMcpAssertion, verifyMcpAssertion, digestMcpOAuthState } = await import('~~/server/utils/ai/mcp/assertion')
const authorize = (await import('~~/server/api/mcp/authorize.get')).default as unknown as (event: unknown) => Promise<Record<string, string>>
const exchange = (await import('~~/server/api/internal/mcp/exchange.post')).default as unknown as (event: unknown) => Promise<Record<string, unknown>>

const UID = m.user.id
const HANDSHAKE = 'handshake-secret'
const INTERNAL = 'internal-secret'
const STATE = Buffer.from(JSON.stringify({ clientId: 'client-1', redirectUri: 'https://client.test/cb' })).toString('base64url')
const OTHER_STATE = Buffer.from(JSON.stringify({ clientId: 'attacker', redirectUri: 'https://attacker.test/cb' })).toString('base64url')
const proof = { role: 'agency' as const, userId: UID, tokenHash: 'c'.repeat(64), issuedAt: Date.now() - 60_000, expiresAt: Date.now() + 600_000 }
const exchangeEvent = (body: Record<string, unknown>) => ({ body, headers: { 'x-mcp-secret': INTERNAL }, context: {} })

beforeEach(() => {
  vi.stubEnv('MCP_SERVER_ENABLED', 'true')
  vi.stubEnv('MCP_HANDSHAKE_SECRET', HANDSHAKE)
  vi.stubEnv('MCP_INTERNAL_SECRET', INTERNAL)
  vi.stubEnv('MCP_WORKER_ORIGIN', 'https://mcp.test')
  m.capture.mockResolvedValue(proof)
  m.consent.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('OAuth state binding of the consent assertion', () => {
  it('signs the exact authorization request into both consent assertions', async () => {
    const opts = await authorize({ query: { redirect_uri: 'https://mcp.test/callback', state: STATE }, path: '/api/mcp/authorize', context: {} })
    for (const url of [opts.allowUrl, opts.allowWriteUrl]) {
      const assertion = new URL(url!).searchParams.get('assertion')!
      expect(await verifyMcpAssertion(assertion, HANDSHAKE)).toMatchObject({ uid: UID, stateHash: await digestMcpOAuthState(STATE), pageStudioLogin: proof })
    }
  })

  it('completes only the bound request and carries the Studio proof only when bound', async () => {
    const assertion = await signMcpAssertion(UID, HANDSHAKE, { scope: ['mcp:read', 'mcp:write'], pageStudioLogin: proof, stateHash: await digestMcpOAuthState(STATE) })
    expect(await exchange(exchangeEvent({ assertion, state: STATE }))).toMatchObject({ userId: UID, pageStudioLogin: proof })
    // A captured assertion replayed with another OAuth request (client/redirect) is refused outright.
    await expect(exchange(exchangeEvent({ assertion, state: OTHER_STATE }))).rejects.toMatchObject({ statusCode: 401 })
    // A Worker that does not forward state (pre-rollout) cannot complete a new connection at all.
    await expect(exchange(exchangeEvent({ assertion }))).rejects.toMatchObject({ statusCode: 401 })
    await expect(exchange(exchangeEvent({ assertion, state: 42 }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses unbound (legacy-format) assertions with or without Studio proof', async () => {
    for (const unbound of [
      await signMcpAssertion(UID, HANDSHAKE, { scope: ['mcp:read'], pageStudioLogin: proof }),
      await signMcpAssertion(UID, HANDSHAKE, { scope: ['mcp:read'] })
    ]) {
      await expect(exchange(exchangeEvent({ assertion: unbound, state: STATE }))).rejects.toMatchObject({ statusCode: 401 })
      await expect(exchange(exchangeEvent({ assertion: unbound }))).rejects.toMatchObject({ statusCode: 401 })
    }
  })

  it('completes a bound ordinary (proof-less) connection', async () => {
    m.capture.mockResolvedValue(undefined)
    const assertion = await signMcpAssertion(UID, HANDSHAKE, { scope: ['mcp:read'], stateHash: await digestMcpOAuthState(STATE) })
    const result = await exchange(exchangeEvent({ assertion, state: STATE }))
    expect(result).toMatchObject({ userId: UID, scope: ['mcp:read'] })
    expect(result).not.toHaveProperty('pageStudioLogin')
  })

  it('integrity-protects the state binding and rejects a malformed one', async () => {
    const assertion = await signMcpAssertion(UID, HANDSHAKE, { stateHash: await digestMcpOAuthState(STATE) })
    const [body, signature] = assertion.split('.')
    const payload = JSON.parse(Buffer.from(body!, 'base64url').toString())
    const forged = `${Buffer.from(JSON.stringify({ ...payload, sth: await digestMcpOAuthState(OTHER_STATE) })).toString('base64url')}.${signature}`
    expect(await verifyMcpAssertion(forged, HANDSHAKE)).toBeNull()
    await expect(signMcpAssertion(UID, HANDSHAKE, { stateHash: 'not-a-digest' })).rejects.toThrow()
  })
})
