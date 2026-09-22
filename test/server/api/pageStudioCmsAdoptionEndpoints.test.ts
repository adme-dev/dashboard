import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleNativeCmsAdoption,
  handleStudioCmsAdoption
} from '~~/server/utils/pageStudio/cmsAdoptionHttp'

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  login: vi.fn(),
  coordinate: vi.fn(),
  machine: vi.fn(),
  verify: vi.fn(),
  header: vi.fn(),
  stream: vi.fn(),
  router: vi.fn(),
  setHeader: vi.fn()
}))
vi.mock('h3', async original => ({
  ...(await original<object>()),
  getHeader: mocks.header,
  getRequestWebStream: mocks.stream,
  getRouterParam: mocks.router,
  setHeader: mocks.setHeader
}))
vi.mock('~~/server/utils/pageStudio/httpActor', () => ({ resolvePageStudioHttpActor: mocks.actor }))
vi.mock('~~/server/utils/pageStudio/contentNativeLogin', () => ({
  preparePageStudioContentLogin: mocks.login
}))
vi.mock('~~/server/utils/pageStudio/cmsAdoptionCoordinator', async original => ({
  ...(await original<object>()),
  coordinateCmsAdoption: mocks.coordinate
}))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({
  requirePageStudioMachineAuth: mocks.machine
}))
vi.mock('~~/server/utils/pageStudio/sessions', async original => ({
  ...(await original<object>()),
  verifyPageStudioSessionToken: mocks.verify,
  resolvePageStudioSessionEnvironment: () => ({ issuer: 'native' }),
  resolvePageStudioSessionPublicKey: () => 'public-key'
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioHttpError: (error: unknown) => {
    throw error
  },
  pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
    throw error
  }
}))
const event = { context: { cloudflare: { env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' } } } }
function body(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  mocks.stream.mockImplementation(
    () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text))
          controller.close()
        }
      })
  )
}
describe('native adoption ingress', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.actor.mockResolvedValue({
      role: 'agency',
      actorId: 'actual-user',
      tenantId: 'actual-tenant',
      canEdit: true
    })
    mocks.login.mockResolvedValue({ userId: 'actual-user', tokenHash: 'actual-login' })
    mocks.router.mockReturnValue('actual-site')
    mocks.header.mockImplementation((_event, name) =>
      name === 'x-page-studio-session'
        ? 'actual-token'
        : name === 'content-type'
          ? 'application/json'
          : null
    )
    mocks.verify.mockResolvedValue({
      siteId: 'session-site',
      clientId: 'session-client',
      nonce: 'child'
    })
    mocks.coordinate.mockResolvedValue({ phase: 'freezing', progressDigest: 'a'.repeat(64) })
    body({ action: 'start' })
  })
  it.each(['agency', 'portal'] as const)(
    'derives %s principal and status without reading a request body',
    async (audience) => {
      await handleNativeCmsAdoption(event as never, audience, 'GET')
      expect(mocks.stream).not.toHaveBeenCalled()
      expect(mocks.actor).toHaveBeenCalledWith(event, audience, true)
      expect(mocks.coordinate).toHaveBeenCalledWith(
        { action: 'status' },
        expect.objectContaining({
          source: 'native-login',
          request: expect.objectContaining({
            siteId: 'actual-site',
            login: { userId: 'actual-user', tokenHash: 'actual-login' }
          })
        })
      )
    }
  )
  it('forwards strict bounded ordinary POST with actual login', async () => {
    await handleNativeCmsAdoption(event as never, 'agency', 'POST')
    expect(mocks.coordinate).toHaveBeenCalledWith(
      { action: 'start' },
      expect.objectContaining({ source: 'native-login' })
    )
    expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
  })
  it.each([
    { action: 'start', actor: {} },
    { action: 'start', target: {} },
    { action: 'start', generation: 'forged' },
    { action: 'advance', cursor: {} }
  ])('rejects authored authority %#', async (value) => {
    body(value)
    await expect(handleNativeCmsAdoption(event as never, 'agency', 'POST')).rejects.toMatchObject({
      statusCode: 400
    })
    expect(mocks.coordinate).not.toHaveBeenCalled()
  })
  it('bounds actual body bytes', async () => {
    body(' '.repeat(4097))
    await expect(handleNativeCmsAdoption(event as never, 'portal', 'POST')).rejects.toMatchObject({
      statusCode: 413
    })
  })
  it('derives Studio principal exclusively from verified child claims', async () => {
    await handleStudioCmsAdoption(event as never)
    expect(mocks.coordinate).toHaveBeenCalledWith(
      { action: 'start' },
      {
        source: 'studio-session',
        claims: { siteId: 'session-site', clientId: 'session-client', nonce: 'child' },
        env: event.context.cloudflare.env,
        capability: 'workspace:checkpoint'
      }
    )
  })
  it('denies machine auth before token or storage access', async () => {
    mocks.machine.mockImplementation(() => {
      throw Object.assign(new Error('denied'), { statusCode: 401 })
    })
    await expect(handleStudioCmsAdoption(event as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.coordinate).not.toHaveBeenCalled()
  })
})
