import { createServer, type Server } from 'node:http'
import { createApp, toNodeListener, defineEventHandler } from 'h3'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), limit: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerCmsSetup', () => ({ readCustomerCmsSetup: mocks.read, mutateCustomerCmsSetup: mocks.mutate }))
vi.mock('~~/server/utils/rateLimit', () => ({ checkAndConsume: mocks.limit }))
describe('native CMS setup HTTP boundary', () => {
  let server: Server, base: string, config: Record<string, unknown>
  beforeAll(async () => {
    const api = await import('~~/server/utils/pageStudio/customerCmsSetupHttp')
    server = createServer(toNodeListener(createApp().use(defineEventHandler((event) => {
      event.context.cloudflare = { env: config }
      return event.method === 'GET' ? api.customerCmsSetupStatusHandler(event) : api.customerCmsSetupMutationHandler(event)
    }))))
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
      PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED: 'true', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging',
      PAGE_STUDIO_PROVISIONER: { readProvisioning: vi.fn() }, PAGE_STUDIO_CONTENT_ROUTER: { readManagedCmsTarget: vi.fn() }, PAGE_STUDIO_CHECKPOINTS: { get: vi.fn() } }
    mocks.limit.mockResolvedValue({ allowed: true })
    mocks.read.mockResolvedValue({ resumeRequired: true, prerequisites: [], adoption: null })
    mocks.mutate.mockResolvedValue({ resumed: true })
  })
  const call = (body: unknown = { operation: 'resume' }, headers: Record<string, string> = {}, method = 'POST') => fetch(base, { method,
    headers: { 'origin': 'https://customers.example.test', 'cookie': `__Host-studio_customer_session=${'a'.repeat(64)}`, 'content-type': 'application/json', ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })
  it('uses only the complete activation bundle and retains independent gates', async () => {
    delete config.PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED
    const activation = { previewEnabled: true, previewApprovals: [], cmsSetupEnabled: true, browserEnabled: true, editorEnabled: true }
    config.PAGE_STUDIO_CUSTOMER_ACTIVATION = JSON.stringify(activation)
    expect((await call()).status).toBe(200)
    expect((await call({}, { origin: 'https://foreign.test' })).status).toBe(403)
    expect((await call({}, { cookie: 'client_session_token=legacy' })).status).toBe(401)
    expect((await call({ siteId: 'foreign' })).status).toBe(400)
    config.PAGE_STUDIO_CUSTOMER_ACTIVATION = JSON.stringify({ ...activation, cmsSetupEnabled: false })
    expect((await call()).status).toBe(403)
    config.PAGE_STUDIO_CUSTOMER_ACTIVATION = JSON.stringify({ ...activation, previewApprovals: [{ workspaceId: 'foreign' }] })
    expect((await call()).status).toBe(403)
    config.PAGE_STUDIO_CUSTOMER_ACTIVATION = JSON.stringify(activation)
    config.PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED = 'true'
    expect((await call()).status).toBe(403)
  })
  it.each(['{', '{}', '{"editorEnabled":true}'])('rejects a present invalid bundle %s despite enabled legacy settings', async (value) => {
    config.PAGE_STUDIO_CUSTOMER_ACTIVATION = value
    expect((await call()).status).toBe(403)
  })
  it('GET reads only, explicit POST resumes with a genuine cookie', async () => {
    const r = await call({}, {}, 'GET')
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(await (await call()).json()).toEqual({ resumed: true })
    expect(mocks.mutate).toHaveBeenCalledWith('a'.repeat(64), { operation: 'resume' }, expect.objectContaining({ event: expect.anything() }))
  })
  it('denies caller-chosen scope, JWTs, wrong origin and legacy cookies', async () => {
    for (const extra of [{ scope: {} }, { siteId: 'foreign' }, { claims: {} }, { token: 'jwt' }])expect((await call({ operation: 'resume', ...extra })).status).toBe(400)
    expect((await call({}, { origin: 'https://foreign.test' })).status).toBe(403)
    expect((await call({}, { cookie: 'client_session_token=legacy' })).status).toBe(401)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
  it.each(['off', 'production', 'content-production', 'storage'])('closes %s without touching coordinators', async (reason) => {
    if (reason === 'off') delete config.PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED
    if (reason === 'production')config.PAGE_STUDIO_PROVISIONING_ENVIRONMENT = 'production'
    if (reason === 'content-production')config.PAGE_STUDIO_CONTENT_ENVIRONMENT = 'production'
    if (reason === 'storage') delete config.PAGE_STUDIO_CONTENT_ROUTER
    expect((await call()).status).toBe(403)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
  it('limits mutations and redacts provider failures', async () => {
    mocks.limit.mockResolvedValueOnce({ allowed: false, resetAt: new Date(Date.now() + 10000) })
    expect((await call()).status).toBe(429)
    expect(mocks.mutate).not.toHaveBeenCalled()
    mocks.mutate.mockRejectedValueOnce(new Error('private key database details'))
    const r = await call()
    expect(r.status).toBe(503)
    expect(await r.text()).not.toContain('private key')
  })
})
