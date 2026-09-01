import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activatePageStudioRelease: vi.fn(),
  getPageStudioBuildPointer: vi.fn(),
  getPageStudioReleasePointer: vi.fn(),
  requireAgencyPageStudioAccess: vi.fn(),
  resolveAgencyPageStudioSiteClient: vi.fn(),
  resolvePageStudioDeliveryWorker: vi.fn(),
  rollbackPageStudioRelease: vi.fn()
}))
vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.requireAgencyPageStudioAccess(...args)
}))
vi.mock('~~/server/utils/pageStudio/versions', () => ({
  resolveAgencyPageStudioSiteClient: (...args: unknown[]) => mocks.resolveAgencyPageStudioSiteClient(...args),
  PageStudioVersionError: class PageStudioVersionError extends Error {}
}))
vi.mock('~~/server/utils/pageStudio/publishing', () => ({
  activatePageStudioRelease: (...args: unknown[]) => mocks.activatePageStudioRelease(...args),
  getPageStudioBuildPointer: (...args: unknown[]) => mocks.getPageStudioBuildPointer(...args),
  getPageStudioReleasePointer: (...args: unknown[]) => mocks.getPageStudioReleasePointer(...args),
  resolvePageStudioDeliveryWorker: (...args: unknown[]) => mocks.resolvePageStudioDeliveryWorker(...args),
  rollbackPageStudioRelease: (...args: unknown[]) => mocks.rollbackPageStudioRelease(...args),
  PageStudioPublishingError: class PageStudioPublishingError extends Error {}
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioHttpError: (error: unknown) => { throw error }
}))

type TestEvent = {
  body?: unknown
  context: Record<string, unknown>
  headers?: Record<string, string>
  params?: Record<string, string>
}
const testGlobal = globalThis as typeof globalThis & {
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
  eventHandler: <T>(handler: T) => T
  getHeader: (event: TestEvent, key: string) => string | undefined
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
}
testGlobal.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
testGlobal.eventHandler = handler => handler
testGlobal.getHeader = (event, key) => event.headers?.[key.toLowerCase()]
testGlobal.getRouterParam = (event, key) => event.params?.[key]
testGlobal.readBody = async event => event.body

const siteId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const actorId = '33333333-3333-4333-8333-333333333333'
const activeReleaseId = '44444444-4444-4444-8444-444444444444'
const targetReleaseId = '55555555-5555-4555-8555-555555555555'
const hostname = 'site.staging.pages.xeroflow.com'
const digest = 'a'.repeat(64)
const buildId = `build_${digest.slice(0, 32)}`
const scope = { tenantId: 'tenant-alpha', clientId, siteId }
const artifactPrefix = `tenants/${scope.tenantId}/clients/${clientId}/sites/${siteId}/builds/${digest}`
const buildPointer = {
  artifactPrefix,
  buildId,
  manifestDigest: 'b'.repeat(64),
  manifestKey: `${artifactPrefix}/release-manifest.json`,
  scope,
  versionDigest: digest
}
const releasePointer = {
  ...buildPointer,
  environment: 'staging' as const,
  releaseId: targetReleaseId
}
const worker = { verifyBuild: vi.fn(), verifyRelease: vi.fn() }

describe('Page Studio agency release actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAgencyPageStudioAccess.mockResolvedValue({
      tenantId: 'tenant-alpha', user: { id: actorId }
    })
    mocks.resolveAgencyPageStudioSiteClient.mockResolvedValue(clientId)
    mocks.resolvePageStudioDeliveryWorker.mockReturnValue(worker)
    mocks.getPageStudioBuildPointer.mockResolvedValue(buildPointer)
    mocks.getPageStudioReleasePointer.mockResolvedValue(releasePointer)
    mocks.activatePageStudioRelease.mockResolvedValue(releasePointer)
    mocks.rollbackPageStudioRelease.mockResolvedValue(releasePointer)
    worker.verifyBuild.mockResolvedValue(buildPointer)
    worker.verifyRelease.mockResolvedValue(releasePointer)
  })

  it('verifies the immutable build in Delivery before activating it locally without a control-plane callback', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/releases/activate.post'
    )
    const body = {
      buildId,
      environment: 'staging',
      expectedActiveReleaseId: null,
      hostname
    }
    const event: TestEvent = {
      body, context: {}, headers: { 'idempotency-key': 'publish_01HXYZ' }, params: { siteId }
    }

    await expect(handler(event as never)).resolves.toEqual({ release: releasePointer })
    expect(mocks.requireAgencyPageStudioAccess).toHaveBeenCalledWith(event, 'PAGE_STUDIO_PUBLISH')
    expect(mocks.resolvePageStudioDeliveryWorker).toHaveBeenCalledWith(event, 'staging')
    expect(mocks.getPageStudioBuildPointer).toHaveBeenCalledWith(scope, buildId)
    expect(worker.verifyBuild).toHaveBeenCalledWith(buildPointer)
    expect(mocks.activatePageStudioRelease).toHaveBeenCalledWith({
      actorId,
      ...body,
      idempotencyKey: 'publish_01HXYZ',
      scope
    })
  })

  it('verifies the immutable target release in Delivery before rolling back locally', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/releases/rollback.post'
    )
    const body = {
      environment: 'staging',
      expectedActiveReleaseId: activeReleaseId,
      hostname,
      targetReleaseId
    }
    const event: TestEvent = {
      body, context: {}, headers: { 'idempotency-key': 'rollback_01HXYZ' }, params: { siteId }
    }

    await expect(handler(event as never)).resolves.toEqual({ release: releasePointer })
    expect(mocks.getPageStudioReleasePointer).toHaveBeenCalledWith(scope, targetReleaseId)
    expect(worker.verifyRelease).toHaveBeenCalledWith(releasePointer)
    expect(mocks.rollbackPageStudioRelease).toHaveBeenCalledWith({
      actorId,
      ...body,
      idempotencyKey: 'rollback_01HXYZ',
      scope
    })
  })
})
