import { createServer, type Server } from 'node:http'
import { createApp, toNodeListener, defineEventHandler } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), create: vi.fn(), recover: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerDashboard', async original => ({ ...await original<object>(), readCustomerDashboard: mocks.read, createCustomerDashboardPreview: mocks.create, recoverCustomerDashboardPreview: mocks.recover }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))

describe('customer dashboard HTTP boundary', () => {
  let server: Server, base: string
  let config: Record<string, unknown>
  beforeAll(async () => {
    const api = await import('~~/server/utils/pageStudio/customerDashboardHttp')
    const app = createApp().use(defineEventHandler((event) => {
      event.context.cloudflare = { env: config }
      if (event.path === '/recover') return api.customerRecoveryHandler(event)
      return event.path === '/preview' ? api.customerPreviewHandler(event) : api.customerDashboardHandler(event)
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
    config = { PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true', PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://studio.example.test',
      PAGE_STUDIO_CUSTOMER_TERMS_VERSION: 'v1', PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'studio@example.test',
      PAGE_STUDIO_CUSTOMER_PREVIEW_ENABLED: 'true', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging',
      PAGE_STUDIO_PROVISIONER: { readProvisioning: vi.fn(), createProvisioning: vi.fn() } }
    mocks.limit.mockResolvedValue({ allowed: true })
    mocks.read.mockResolvedValue({ state: 'approval-pending', canCreate: false })
    mocks.create.mockResolvedValue({ state: 'preparing', canCreate: false })
  })
  const call = (body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}/${body === undefined ? 'dashboard' : 'preview'}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'origin': 'https://studio.example.test', 'cookie': `__Host-studio_customer_session=${'a'.repeat(64)}`, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const recover = (body: unknown, headers: Record<string, string> = {}) => fetch(`${base}/recover`, {
    method: 'POST', headers: { 'origin': 'https://studio.example.test', 'cookie': `__Host-studio_customer_session=${'a'.repeat(64)}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
  })
  it('requires the current cookie, exact origin and strict recovery challenge before dispatch', async () => {
    const body = { recoveryId: '11111111-1111-4111-8111-111111111111', expectedRecoveryId: null, expectedJobDigest: 'a'.repeat(64) }
    mocks.recover.mockResolvedValue({ state: 'preparing' })
    expect((await recover(body)).status).toBe(200)
    expect(mocks.recover).toHaveBeenCalledWith('a'.repeat(64), body, expect.objectContaining({ enabled: true }))
    expect((await recover({ ...body, siteId: 'foreign' })).status).toBe(400)
    expect((await recover(body, { origin: 'https://foreign.test' })).status).toBe(403)
    expect((await recover(body, { cookie: 'client_session_token=portal' })).status).toBe(401)
    mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 10000) })
    expect((await recover(body)).status).toBe(429)
    delete config.PAGE_STUDIO_CUSTOMER_PREVIEW_ENABLED
    expect((await recover(body)).status).toBe(403)
    expect(mocks.recover).toHaveBeenCalledTimes(1)
  })
  it('reads with the native cookie and private no-store headers', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.read).toHaveBeenCalledWith('a'.repeat(64), expect.objectContaining({ enabled: true, approvals: [] }))
  })
  it('rejects portal cookies, foreign origins and caller-selected scope or policies', async () => {
    expect((await call(undefined, { cookie: 'client_session_token=portal; session_token=staff' })).status).toBe(401)
    expect((await call({}, { origin: 'https://foreign.test' })).status).toBe(403)
    expect((await call({ siteId: 'foreign' })).status).toBe(400)
    expect((await call({ policy: {}, actor: 'owner' })).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it.each(['disabled', 'production', 'missing-binding', 'malformed-approvals'])('denies preview creation for %s', async (reason) => {
    if (reason === 'disabled') delete config.PAGE_STUDIO_CUSTOMER_PREVIEW_ENABLED
    if (reason === 'production') config.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
    if (reason === 'missing-binding') delete config.PAGE_STUDIO_PROVISIONER
    if (reason === 'malformed-approvals') config.PAGE_STUDIO_CUSTOMER_PREVIEW_APPROVALS = '[{"workspaceId":"foreign"}]'
    expect((await call({})).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('limits creation before dispatch and allows only an empty body', async () => {
    expect((await call({})).status).toBe(200)
    expect(mocks.create).toHaveBeenCalledWith('a'.repeat(64), expect.objectContaining({ enabled: true }))
    mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 10000) })
    expect((await call({})).status).toBe(429)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('never leaks provider errors or changes a failed mutation into success', async () => {
    mocks.create.mockRejectedValueOnce(new Error('private worker token'))
    const response = await call({})
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private worker token')
  })
})
