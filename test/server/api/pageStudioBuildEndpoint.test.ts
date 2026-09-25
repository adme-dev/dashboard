import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildApprovedPageStudioVersion: vi.fn(),
  coordinateSealedFeatureBuild: vi.fn(),
  nativeFeaturePublisher: vi.fn(),
  featureBuildServices: vi.fn(),
  requireAgencyPageStudioAccess: vi.fn(),
  resolvePageStudioBuildWorker: vi.fn(),
  astroConfigured: vi.fn(), astroServices: vi.fn(), astroCoordinate: vi.fn(), publishPrincipal: vi.fn(), siteClient: vi.fn()
}))
vi.mock('~~/server/utils/pageStudio/astroBuildHttp', () => ({ hasAstroReleaseConfiguration: mocks.astroConfigured, resolveAstroBuildServices: mocks.astroServices }))
vi.mock('~~/server/utils/pageStudio/astroBuildCoordinator', () => ({ coordinateApprovedAstroBuild: mocks.astroCoordinate }))
vi.mock('~~/server/utils/pageStudio/publishHttp', () => ({ preparePageStudioPublishPrincipal: mocks.publishPrincipal }))
vi.mock('~~/server/utils/pageStudio/versions', () => ({ resolveAgencyPageStudioSiteClient: mocks.siteClient }))

vi.mock('~~/server/utils/pageStudio/releaseFeatureBuild', () => ({
  coordinateSealedFeatureBuild: (...args: unknown[]) =>
    mocks.coordinateSealedFeatureBuild(...args)
}))
vi.mock('~~/server/utils/pageStudio/releaseFeatureHttp', () => ({
  nativeFeaturePublisher: (...args: unknown[]) =>
    mocks.nativeFeaturePublisher(...args),
  featureBuildServices: (...args: unknown[]) =>
    mocks.featureBuildServices(...args)
}))
vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) =>
    mocks.requireAgencyPageStudioAccess(...args)
}))
vi.mock('~~/server/utils/pageStudio/builds', () => ({
  buildApprovedPageStudioVersion: (...args: unknown[]) =>
    mocks.buildApprovedPageStudioVersion(...args),
  resolvePageStudioBuildWorker: (...args: unknown[]) =>
    mocks.resolvePageStudioBuildWorker(...args),
  PageStudioBuildError: class PageStudioBuildError extends Error {}
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioHttpError: (error: unknown) => {
    throw error
  }
}))

type TestEvent = {
  body?: unknown
  context: Record<string, unknown>
  headers?: Record<string, string>
  params?: Record<string, string>
}
const testGlobal = globalThis as typeof globalThis & {
  createError: (
    input: Record<string, unknown>
  ) => Error & Record<string, unknown>
  eventHandler: <T>(handler: T) => T
  getHeader: (event: TestEvent, key: string) => string | undefined
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
}
testGlobal.createError = input =>
  Object.assign(new Error(String(input.statusMessage)), input)
testGlobal.eventHandler = handler => handler
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.readBody = async event => event.body

const siteId = '11111111-1111-4111-8111-111111111111'
const versionId = '22222222-2222-4222-8222-222222222222'
const actorId = '33333333-3333-4333-8333-333333333333'
const worker = { build: vi.fn() }

describe('Page Studio agency build endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.astroConfigured.mockReturnValue(false)
    mocks.requireAgencyPageStudioAccess.mockResolvedValue({
      tenantId: 'tenant-alpha',
      user: { id: actorId }
    })
    mocks.resolvePageStudioBuildWorker.mockReturnValue(worker)
    mocks.buildApprovedPageStudioVersion.mockResolvedValue({
      buildId: 'build_a'
    })
  })

  it('uses native approved-checkpoint orchestration for configured Astro builds and never falls back after failure', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/builds/index.post')
    mocks.astroConfigured.mockReturnValue(true)
    const services = { buildAstroApproved: vi.fn() }, principal = { actorId, tenantId: 'tenant-alpha' }
    mocks.astroServices.mockReturnValue({ environment: 'production', services })
    mocks.publishPrincipal.mockResolvedValue(principal)
    mocks.siteClient.mockResolvedValue('client-a')
    mocks.astroCoordinate.mockResolvedValue({ buildId: 'build_astro_a' })
    const event: TestEvent = { body: { assets: [], manifest: { schemaVersion: 2 } }, context: {},
      headers: { 'idempotency-key': 'astro-request' }, params: { siteId, versionId } }
    expect(await handler(event as never)).toEqual({ build: { buildId: 'build_astro_a' } })
    expect(mocks.astroCoordinate).toHaveBeenCalledWith({ scope: { tenantId: 'tenant-alpha', clientId: 'client-a', siteId },
      versionId, environment: 'production', idempotencyKey: 'astro-request' }, principal, services)
    expect(mocks.resolvePageStudioBuildWorker).not.toHaveBeenCalled()
    expect(mocks.buildApprovedPageStudioVersion).not.toHaveBeenCalled()
    mocks.astroCoordinate.mockRejectedValueOnce(new Error('Retained compiler unavailable'))
    await expect(handler(event as never)).rejects.toThrow('Retained compiler unavailable')
    expect(mocks.buildApprovedPageStudioVersion).not.toHaveBeenCalled()
  })

  it('routes accepted features through original native authority and private seal orchestration', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/builds/index.post'
    )
    const principal = { source: 'native-login' },
      services = { buildSealed: vi.fn() }
    mocks.nativeFeaturePublisher.mockResolvedValue(principal)
    mocks.featureBuildServices.mockReturnValue(services)
    mocks.coordinateSealedFeatureBuild.mockResolvedValue({ buildId: 'sealed' })
    const event: TestEvent = {
      body: {
        assets: [],
        manifest: { schemaVersion: 2, builderApplication: {} }
      },
      context: {},
      headers: { 'idempotency-key': 'build_feature' },
      params: { siteId, versionId }
    }
    expect(await handler(event as never)).toEqual({
      build: { buildId: 'sealed' }
    })
    expect(mocks.nativeFeaturePublisher).toHaveBeenCalledWith(event, siteId)
    expect(mocks.coordinateSealedFeatureBuild).toHaveBeenCalledWith(
      expect.objectContaining({ actorId, siteId, versionId }),
      principal,
      services
    )
    expect(mocks.buildApprovedPageStudioVersion).not.toHaveBeenCalled()
    mocks.nativeFeaturePublisher.mockRejectedValueOnce(
      Object.assign(new Error('edit required'), { statusCode: 403 })
    )
    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 403
    })
    expect(mocks.coordinateSealedFeatureBuild).toHaveBeenCalledTimes(1)
  })
  it('requires publish access and sends a bounded build to the private worker orchestration', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/builds/index.post'
    )
    const body = { assets: [], manifest: { schemaVersion: 2 } }
    const event: TestEvent = {
      body,
      context: {},
      headers: { 'idempotency-key': 'build_01HXYZ' },
      params: { siteId, versionId }
    }

    await expect(handler(event as never)).resolves.toEqual({
      build: { buildId: 'build_a' }
    })
    expect(mocks.requireAgencyPageStudioAccess).toHaveBeenCalledWith(
      event,
      'PAGE_STUDIO_PUBLISH'
    )
    expect(mocks.buildApprovedPageStudioVersion).toHaveBeenCalledWith(
      {
        actorId,
        ...body,
        idempotencyKey: 'build_01HXYZ',
        siteId,
        tenantId: 'tenant-alpha',
        versionId
      },
      { worker }
    )
  })

  it('rejects malformed, oversized, or non-idempotent input before calling the worker', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/builds/index.post'
    )
    const event: TestEvent = {
      body: { assets: [], manifest: 'not-an-object' },
      context: {},
      headers: { 'idempotency-key': 'contains spaces' },
      params: { siteId, versionId }
    }

    await expect(handler(event as never)).rejects.toMatchObject({
      statusCode: 400
    })
    expect(mocks.resolvePageStudioBuildWorker).not.toHaveBeenCalled()
    expect(mocks.buildApprovedPageStudioVersion).not.toHaveBeenCalled()
  })
})
