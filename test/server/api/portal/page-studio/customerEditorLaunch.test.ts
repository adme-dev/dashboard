import { createServer, type Server } from 'node:http'
import { createApp, toNodeListener, defineEventHandler } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), ready: vi.fn(), limit: vi.fn(), dashboard: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerEditorLaunch', () => ({ launchCustomerEditor: mocks.launch, readCustomerEditorAvailability: mocks.ready }))
vi.mock('~~/server/utils/pageStudio/customerDashboard', async original => ({ ...await original<object>(), readCustomerDashboard: mocks.dashboard }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
describe('native customer editor launch HTTP', () => {
  let server: Server, base: string, config: Record<string, unknown>
  beforeAll(async () => {
    const api = await import('~~/server/utils/pageStudio/customerEditorLaunchHttp')
    const { customerDashboardHandler } = await import('~~/server/utils/pageStudio/customerDashboardHttp')
    const app = createApp().use(defineEventHandler((event) => {
      event.context.cloudflare = { env: config }
      return event.path === '/dashboard' ? customerDashboardHandler(event) : api.customerEditorLaunchHandler(event)
    }))
    server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  })
  beforeEach(() => {
    vi.resetAllMocks()
    config = { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test',
      PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://customers.example.test', PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN: 'https://editor.example.test',
      PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED: 'true',
      PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
      PAGE_STUDIO_CHECKPOINTS: { get: vi.fn() }, PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget: vi.fn() } }
    mocks.limit.mockResolvedValue({ allowed: true })
    mocks.ready.mockResolvedValue(true)
    mocks.dashboard.mockResolvedValue({ state: 'verification-pending', canCreate: false, canRetry: false })
    mocks.launch.mockResolvedValue({ token: 'b'.repeat(64), editorOrigin: 'https://editor.example.test', expiresAt: new Date(Date.now() + 60000).toISOString() })
  })
  const call = (body: unknown = {}, headers: Record<string, string> = {}, path = '/editor', method = 'POST') => fetch(`${base}${path}`, {
    method, headers: { 'origin': 'https://customers.example.test', 'cookie': `__Host-studio_customer_session=${'a'.repeat(64)}`, 'content-type': 'application/json', ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) })
  })
  it('projects availability without issuing a ticket and launches only on explicit POST', async () => {
    const overview = await call({}, {}, '/dashboard', 'GET')
    expect(await overview.json()).toMatchObject({ state: 'verification-pending', canOpenStudio: true })
    expect(mocks.launch).not.toHaveBeenCalled()
    const result = await call()
    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(result.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await result.json()).toMatchObject({ token: 'b'.repeat(64), editorOrigin: 'https://editor.example.test' })
    expect(mocks.launch).toHaveBeenCalledWith('a'.repeat(64), expect.objectContaining({ configuration: { enabled: true, dashboardOrigin: 'https://customers.example.test', editorOrigin: 'https://editor.example.test' } }))
  })
  it('rejects wrong origin, portal-only cookies, caller scope and GET', async () => {
    expect((await call({}, { origin: 'https://foreign.test' })).status).toBe(403)
    expect((await call({}, { cookie: 'client_session_token=legacy' })).status).toBe(401)
    expect((await call({ siteId: 'foreign' })).status).toBe(400)
    expect((await call({ returnUrl: 'https://foreign.test' })).status).toBe(400)
    expect((await call({}, {}, '/editor', 'GET')).status).toBe(405)
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it.each(['browser-off', 'editor-off', 'production', 'content-production', 'invalid-origin', 'same-origin', 'missing-storage'])('fails closed for %s', async (reason) => {
    if (reason === 'browser-off') delete config.PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED
    if (reason === 'editor-off') delete config.PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED
    if (reason === 'production') config.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
    if (reason === 'content-production') config.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'production'
    if (reason === 'invalid-origin') config.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN = 'https://editor.example.test/path'
    if (reason === 'same-origin') config.PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN = config.PAGE_STUDIO_CUSTOMER_ORIGIN
    if (reason === 'missing-storage') delete config.PAGE_STUDIO_CHECKPOINTS
    expect((await call()).status).toBe(403)
    expect(await (await call({}, {}, '/dashboard', 'GET')).json()).toMatchObject({ canOpenStudio: false })
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.ready).not.toHaveBeenCalled()
  })
  it.each([401, 403])('does not return the earlier private dashboard after native access fails with %s', async (statusCode) => {
    mocks.ready.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      throw Object.assign(new Error('native authority lost during storage read'), { statusCode })
    })
    const response = await call({}, {}, '/dashboard', 'GET')
    expect(response.status).toBe(statusCode)
    expect(await response.text()).not.toContain('verification-pending')
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('rate limits before dispatch and redacts readiness failures', async () => {
    mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 10000) })
    expect((await call()).status).toBe(429)
    expect(mocks.launch).not.toHaveBeenCalled()
    mocks.launch.mockRejectedValueOnce(Object.assign(new Error('private bucket credential'), { statusCode: 409 }))
    const response = await call()
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain('private bucket credential')
  })
})
