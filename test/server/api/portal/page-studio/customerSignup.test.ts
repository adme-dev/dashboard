import { createServer, type Server } from 'node:http'
import { createApp, toNodeListener, defineEventHandler } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(), verify: vi.fn(), me: vi.fn(), logout: vi.fn(), setup: vi.fn(), save: vi.fn(), complete: vi.fn(), send: vi.fn(), limit: vi.fn()
}))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({ requestCustomerSignIn: mocks.request, verifyCustomerSignIn: mocks.verify, readCustomerSession: mocks.me, revokeCustomerSession: mocks.logout, readCustomerSetup: mocks.setup, saveCustomerSetup: mocks.save, completeCustomerSetup: mocks.complete }))
vi.mock('~~/server/utils/pageStudio/customerSignupEmail', () => ({ customerEmailAvailable: () => true, sendCustomerSignInEmail: mocks.send }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))

describe('standalone signup HTTP boundaries', () => {
  let server: Server
  let base: string
  let config: Record<string, string>
  let api: typeof import('~~/server/utils/pageStudio/customerSignupHttp')
  const call = (route: string, body?: unknown, extra: Record<string, string> = {}) => fetch(`${base}/${route}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'origin': 'https://studio.example.test', 'content-type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  beforeAll(async () => {
    api = await import('~~/server/utils/pageStudio/customerSignupHttp')
    const app = createApp().use(defineEventHandler((event) => {
      event.context.cloudflare = { env: config }
      const route = event.path.slice(1).split('?')[0]!
      const handlers = { config: api.customerConfigHandler, request: api.customerRequestHandler, verify: api.customerVerifyHandler, me: api.customerMeHandler, logout: api.customerLogoutHandler, setup: api.customerSetupHandler, save: api.customerSaveHandler, complete: api.customerCompleteHandler }
      return handlers[route as keyof typeof handlers](event)
    }))
    server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  beforeEach(() => {
    vi.resetAllMocks()
    config = { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.example.test', PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'preview-v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test' }
    mocks.limit.mockResolvedValue({ allowed: true })
    mocks.request.mockResolvedValue({ email: 'owner@example.test', token: 'A'.repeat(64) })
    mocks.verify.mockResolvedValue({ identityId: 'private-id', sessionToken: 'B'.repeat(64) })
    mocks.me.mockResolvedValue({ name: 'Alex', email: 'owner@example.test', identityId: 'private-id', accountId: 'private-id' })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  })
  it('is disabled by default and exposes no private configuration', async () => {
    delete config.PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED
    expect(await (await call('config')).json()).toEqual({ enabled: false })
    expect((await call('request', {})).status).toBe(404)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it.each(['https://evil.test', '', 'null'])('rejects a foreign or missing origin %s before work', async (origin) => {
    expect((await call('request', {}, { origin })).status).toBe(403)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('fails closed for an unsafe configured origin', async () => {
    config.PAGE_STUDIO_CUSTOMER_ORIGIN = 'http://studio.example.test'
    expect((await call('request', {})).status).toBe(503)
  })
  it('validates signup consent and rejects caller-selected roles', async () => {
    expect((await call('request', { mode: 'signup', email: 'owner@example.test', name: 'Alex' })).status).toBe(400)
    expect((await call('request', { mode: 'signin', email: 'owner@example.test', role: 'owner' })).status).toBe(400)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('returns the same generic response for missing and eligible accounts without leaking tokens', async () => {
    const body = { mode: 'signin', email: 'owner@example.test' }
    const first = await (await call('request', body)).json()
    expect(mocks.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ origin: 'https://studio.example.test' }), { email: 'owner@example.test', token: 'A'.repeat(64) })
    mocks.request.mockResolvedValueOnce(null)
    expect(await (await call('request', body)).json()).toEqual(first)
    expect(JSON.stringify(first)).not.toContain('AAAA')
  })
  it('does not expose delivery failures or account existence', async () => {
    mocks.send.mockRejectedValueOnce(new Error('private recipient'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await call('request', { mode: 'signin', email: 'owner@example.test' })).status).toBe(200)
    expect(log).toHaveBeenCalledWith('[Studio signup] Sign-in email delivery failed')
    log.mockRestore()
  })
  it('enforces the fail-closed limiter before creating any account', async () => {
    mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 60_000) })
    const response = await call('request', { mode: 'signin', email: 'owner@example.test' })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBeTruthy()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('sets a dedicated secure host-only HttpOnly cookie and returns only a fixed destination', async () => {
    const response = await call('verify', { token: 'A'.repeat(64) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ next: '/studio/onboarding' })
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toMatch(/^__Host-studio_customer_session=/)
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) expect(cookie).toContain(attr)
    expect(cookie).not.toContain('Domain=')
  })
  it('rejects redirect injection and never verifies on a GET', async () => {
    expect((await call('verify', { token: 'A'.repeat(64), redirect: 'https://evil.test' })).status).toBe(400)
    expect((await call('verify')).status).toBe(405)
    expect(mocks.verify).not.toHaveBeenCalled()
  })
  it('does not accept portal or staff cookies as customer authority', async () => {
    expect((await call('setup', undefined, { cookie: 'client_session_token=portal; session_token=staff' })).status).toBe(401)
    expect(mocks.setup).not.toHaveBeenCalled()
  })
  it.each(['me', 'setup'])('rejects an unprefixed parent-domain cookie for %s', async (route) => {
    expect((await call(route, undefined, { cookie: `studio_customer_session=${'A'.repeat(64)}` })).status).toBe(401)
    expect(mocks.me).not.toHaveBeenCalled()
    expect(mocks.setup).not.toHaveBeenCalled()
  })
  it.each([true, false])('ignores a competing legacy cookie regardless of order (legacy first: %s)', async (legacyFirst) => {
    const cookies = [`studio_customer_session=${'A'.repeat(64)}`, `__Host-studio_customer_session=${'B'.repeat(64)}`]
    const cookie = (legacyFirst ? cookies : cookies.reverse()).join('; ')
    mocks.setup.mockResolvedValueOnce({ revision: 0 })
    expect((await call('setup', undefined, { cookie })).status).toBe(200)
    expect(mocks.setup).toHaveBeenCalledWith('B'.repeat(64))
  })
  it('derives the setup actor only from the standalone cookie and rejects foreign IDs', async () => {
    const cookie = `__Host-studio_customer_session=${'B'.repeat(64)}`
    mocks.setup.mockResolvedValueOnce({ revision: 0 })
    expect((await call('setup', undefined, { cookie })).status).toBe(200)
    expect(mocks.setup).toHaveBeenCalledWith('B'.repeat(64))
    expect((await call('complete', { expectedRevision: 1, identityId: 'foreign' }, { cookie })).status).toBe(400)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
  it('revokes the current session and deletes its cookie on logout', async () => {
    const response = await call('logout', {}, { cookie: `__Host-studio_customer_session=${'B'.repeat(64)}; studio_customer_session=${'A'.repeat(64)}` })
    expect(mocks.logout).toHaveBeenCalledWith('B'.repeat(64))
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toMatch(/^__Host-studio_customer_session=/)
    for (const attr of ['Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) expect(cookie).toContain(attr)
    expect(cookie).not.toContain('Domain=')
  })
})
