import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  issuePageStudioSession: vi.fn(),
  requireAgencyPageStudioAccess: vi.fn(),
  requireClientAuth: vi.fn()
}))

vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.requireAgencyPageStudioAccess(...args)
}))
vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args)
}))
vi.mock('~~/server/utils/pageStudio/sites', () => ({
  PageStudioSiteError: class PageStudioSiteError extends Error {}
}))
vi.mock('~~/server/utils/pageStudio/sessions', () => ({
  PageStudioSessionError: class PageStudioSessionError extends Error {},
  issuePageStudioSession: (...args: unknown[]) => mocks.issuePageStudioSession(...args)
}))

type TestEvent = { context: Record<string, unknown>, params?: Record<string, string> }
const testGlobal = globalThis as typeof globalThis & {
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  setResponseHeader: (event: TestEvent, name: string, value: string) => void
}
const setResponseHeader = vi.fn()
testGlobal.eventHandler = handler => handler
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
testGlobal.setResponseHeader = setResponseHeader

const SITE_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const session = {
  token: 'signed-token',
  expiresAt: 1_900,
  sessionId: '55555555-5555-4555-8555-555555555555',
  capabilities: ['workspace:create']
}

describe('Page Studio editor-session endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAgencyPageStudioAccess.mockResolvedValue({
      tenantId: 'tenant-alpha',
      user: { id: 'agency-user' }
    })
    mocks.requireClientAuth.mockResolvedValue({ id: 'portal-user', clientId: CLIENT_ID })
    mocks.issuePageStudioSession.mockResolvedValue(session)
  })

  it('requires agency edit permission and issues within the selected tenant', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/editor-sessions.post'
    )
    const event = { context: {}, params: { siteId: SITE_ID } }

    await expect(handler(event as never)).resolves.toEqual({ session })
    expect(mocks.requireAgencyPageStudioAccess).toHaveBeenCalledWith(event, 'PAGE_STUDIO_EDIT')
    expect(mocks.issuePageStudioSession).toHaveBeenCalledWith({
      actorId: 'agency-user',
      actorRole: 'agency',
      siteId: SITE_ID,
      tenantId: 'tenant-alpha'
    }, { event })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
  })

  it('derives every portal scope identifier from the authenticated user and membership', async () => {
    const { default: handler } = await import(
      '~~/server/api/portal/page-studio/sites/[siteId]/editor-sessions.post'
    )
    const event = { context: {}, params: { siteId: SITE_ID } }

    await expect(handler(event as never)).resolves.toEqual({ session })
    expect(mocks.issuePageStudioSession).toHaveBeenCalledWith({
      actorId: 'portal-user',
      actorRole: 'client',
      clientId: CLIENT_ID,
      siteId: SITE_ID
    }, { event })
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
  })

  it('rejects malformed site identifiers before session issuance', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/editor-sessions.post'
    )

    await expect(handler({ context: {}, params: { siteId: '../other' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.issuePageStudioSession).not.toHaveBeenCalled()
  })
})
