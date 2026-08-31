import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAgencyPageStudioAccess: vi.fn(),
  resolveAgencyPageStudioSiteClient: vi.fn(),
  resolvePageStudioDeliveryWorker: vi.fn()
}))
vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.requireAgencyPageStudioAccess(...args)
}))
vi.mock('~~/server/utils/pageStudio/versions', () => ({
  resolveAgencyPageStudioSiteClient: (...args: unknown[]) => mocks.resolveAgencyPageStudioSiteClient(...args),
  PageStudioVersionError: class PageStudioVersionError extends Error {}
}))
vi.mock('~~/server/utils/pageStudio/publishing', () => ({
  resolvePageStudioDeliveryWorker: (...args: unknown[]) => mocks.resolvePageStudioDeliveryWorker(...args),
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
const worker = { publish: vi.fn(), rollback: vi.fn() }

describe('Page Studio agency release actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAgencyPageStudioAccess.mockResolvedValue({
      tenantId: 'tenant-alpha', user: { id: actorId }
    })
    mocks.resolveAgencyPageStudioSiteClient.mockResolvedValue(clientId)
    mocks.resolvePageStudioDeliveryWorker.mockReturnValue(worker)
    worker.publish.mockResolvedValue({ releaseId: targetReleaseId })
    worker.rollback.mockResolvedValue({ releaseId: targetReleaseId })
  })

  it('publishes through the environment-pinned private Delivery Worker', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/releases/activate.post'
    )
    const body = {
      buildId: `build_${'a'.repeat(32)}`,
      environment: 'staging',
      expectedActiveReleaseId: null,
      hostname
    }
    const event: TestEvent = {
      body, context: {}, headers: { 'idempotency-key': 'publish_01HXYZ' }, params: { siteId }
    }

    await expect(handler(event as never)).resolves.toEqual({ release: { releaseId: targetReleaseId } })
    expect(mocks.requireAgencyPageStudioAccess).toHaveBeenCalledWith(event, 'PAGE_STUDIO_PUBLISH')
    expect(mocks.resolvePageStudioDeliveryWorker).toHaveBeenCalledWith(event, 'staging')
    expect(worker.publish).toHaveBeenCalledWith({
      actorId,
      ...body,
      idempotencyKey: 'publish_01HXYZ',
      scope: { tenantId: 'tenant-alpha', clientId, siteId }
    })
  })

  it('rolls back through Delivery artifact verification without accepting caller scope', async () => {
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

    await expect(handler(event as never)).resolves.toEqual({ release: { releaseId: targetReleaseId } })
    expect(worker.rollback).toHaveBeenCalledWith({
      actorId,
      ...body,
      idempotencyKey: 'rollback_01HXYZ',
      scope: { tenantId: 'tenant-alpha', clientId, siteId }
    })
  })
})
