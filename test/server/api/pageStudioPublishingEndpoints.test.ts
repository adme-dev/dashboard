import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activatePageStudioRelease: vi.fn(),
  getPageStudioBuildPointer: vi.fn(),
  getPageStudioReleasePointer: vi.fn(),
  requirePageStudioMachineAuth: vi.fn()
}))

vi.mock('~~/server/utils/pageStudio/publishing', () => ({
  activatePageStudioRelease: (...args: unknown[]) => mocks.activatePageStudioRelease(...args),
  getPageStudioBuildPointer: (...args: unknown[]) => mocks.getPageStudioBuildPointer(...args),
  getPageStudioReleasePointer: (...args: unknown[]) => mocks.getPageStudioReleasePointer(...args),
  PageStudioPublishingError: class PageStudioPublishingError extends Error {}
}))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({
  requirePageStudioMachineAuth: (...args: unknown[]) => mocks.requirePageStudioMachineAuth(...args)
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioInternalHttpError: (event: TestEvent, error: unknown) => {
    const candidate = error as {
      statusCode?: number
      data?: { error?: { code: string, message: string } }
    }
    event.responseStatus = candidate.statusCode ?? 500
    return candidate.data ?? {
      error: { code: 'INTERNAL_ERROR', message: 'Page Studio request failed' }
    }
  }
}))

type TestEvent = {
  context: Record<string, unknown>
  body?: unknown
  headers?: Record<string, string>
  params?: Record<string, string>
  query?: Record<string, unknown>
  responseStatus?: number
}

const testGlobal = globalThis as typeof globalThis & {
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
  eventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, unknown>
  getHeader: (event: TestEvent, key: string) => string | undefined
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  setResponseStatus: (event: TestEvent, status: number) => void
}
testGlobal.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
testGlobal.eventHandler = handler => handler
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.readBody = async event => event.body
testGlobal.setResponseStatus = (event, status) => {
  event.responseStatus = status
}

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const digest = 'a'.repeat(64)
const buildId = `build_${digest.slice(0, 32)}`
const releaseId = '33333333-3333-4333-8333-333333333333'
const pointer = {
  artifactPrefix: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${digest}`,
  buildId,
  manifestDigest: 'b'.repeat(64),
  manifestKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/builds/${digest}/release-manifest.json`,
  scope,
  versionDigest: digest
}

describe('Page Studio publishing catalog endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePageStudioMachineAuth.mockReturnValue({ service: 'page-studio' })
    mocks.activatePageStudioRelease.mockResolvedValue({
      ...pointer,
      environment: 'staging',
      releaseId
    })
    mocks.getPageStudioBuildPointer.mockResolvedValue(pointer)
    mocks.getPageStudioReleasePointer.mockResolvedValue({
      ...pointer,
      environment: 'staging',
      releaseId
    })
  })

  it('machine-authenticates and returns a scoped build pointer without release metadata', async () => {
    const { default: handler } = await import(
      '~~/server/routes/internal/page-studio/builds/[buildId].get'
    )
    const event: TestEvent = { context: {}, params: { buildId }, query: scope }

    await expect(handler(event as never)).resolves.toEqual(pointer)
    expect(mocks.requirePageStudioMachineAuth).toHaveBeenCalledWith(event)
    expect(mocks.getPageStudioBuildPointer).toHaveBeenCalledWith(scope, buildId)
  })

  it('returns 404 for a valid scoped build or release id that is unavailable', async () => {
    mocks.getPageStudioBuildPointer.mockResolvedValueOnce(null)
    const { default: buildHandler } = await import(
      '~~/server/routes/internal/page-studio/builds/[buildId].get'
    )
    const buildEvent: TestEvent = { context: {}, params: { buildId }, query: scope }
    await expect(buildHandler(buildEvent as never)).resolves.toEqual({
      error: { code: 'BUILD_NOT_FOUND', message: 'Page Studio build not found' }
    })
    expect(buildEvent.responseStatus).toBe(404)

    mocks.getPageStudioReleasePointer.mockResolvedValueOnce(null)
    const { default: releaseHandler } = await import(
      '~~/server/routes/internal/page-studio/releases/[releaseId].get'
    )
    const releaseEvent: TestEvent = { context: {}, params: { releaseId }, query: scope }
    await expect(releaseHandler(releaseEvent as never)).resolves.toEqual({
      error: { code: 'RELEASE_NOT_FOUND', message: 'Page Studio release not found' }
    })
    expect(releaseEvent.responseStatus).toBe(404)
  })

  it('validates the full explicit scope and identifier before querying the catalog', async () => {
    const { default: handler } = await import(
      '~~/server/routes/internal/page-studio/builds/[buildId].get'
    )
    const event: TestEvent = {
      context: {},
      params: { buildId: '../outside' },
      query: { ...scope, clientId: 'not-a-uuid' }
    }

    await expect(handler(event as never)).resolves.toEqual({
      error: { code: 'INVALID_INPUT', message: 'Invalid build lookup' }
    })
    expect(event.responseStatus).toBe(400)
    expect(mocks.getPageStudioBuildPointer).not.toHaveBeenCalled()
  })

  it('machine-authenticates and validates an activation plus its idempotency header', async () => {
    const { default: handler } = await import(
      '~~/server/routes/internal/page-studio/releases/activate.post'
    )
    const body = {
      actorId: 'user_publisher',
      buildId,
      environment: 'staging',
      expectedActiveReleaseId: null,
      hostname: 'SITE.STAGING.PAGES.XEROFLOW.COM',
      scope
    }
    const event: TestEvent = {
      body,
      context: {},
      headers: { 'idempotency-key': 'publish_01HXYZ' }
    }

    await expect(handler(event as never)).resolves.toMatchObject({ releaseId })
    expect(mocks.requirePageStudioMachineAuth).toHaveBeenCalledWith(event)
    expect(mocks.activatePageStudioRelease).toHaveBeenCalledWith({
      ...body,
      hostname: body.hostname.toLowerCase(),
      idempotencyKey: 'publish_01HXYZ'
    })
  })

  it('rejects invalid activation input before opening the publishing transaction', async () => {
    const { default: handler } = await import(
      '~~/server/routes/internal/page-studio/releases/activate.post'
    )
    const event: TestEvent = {
      body: {
        actorId: 'user_publisher',
        buildId,
        environment: 'preview',
        expectedActiveReleaseId: null,
        hostname: 'localhost',
        scope
      },
      context: {},
      headers: { 'idempotency-key': 'contains spaces' }
    }

    await expect(handler(event as never)).resolves.toEqual({
      error: { code: 'INVALID_INPUT', message: 'Invalid release activation' }
    })
    expect(event.responseStatus).toBe(400)
    expect(mocks.activatePageStudioRelease).not.toHaveBeenCalled()
  })
})
