import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildApprovedPageStudioVersion: vi.fn(),
  requireAgencyPageStudioAccess: vi.fn(),
  resolvePageStudioBuildWorker: vi.fn()
}))

vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.requireAgencyPageStudioAccess(...args)
}))
vi.mock('~~/server/utils/pageStudio/builds', () => ({
  buildApprovedPageStudioVersion: (...args: unknown[]) => mocks.buildApprovedPageStudioVersion(...args),
  resolvePageStudioBuildWorker: (...args: unknown[]) => mocks.resolvePageStudioBuildWorker(...args),
  PageStudioBuildError: class PageStudioBuildError extends Error {}
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
const versionId = '22222222-2222-4222-8222-222222222222'
const actorId = '33333333-3333-4333-8333-333333333333'
const worker = { build: vi.fn() }

describe('Page Studio agency build endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAgencyPageStudioAccess.mockResolvedValue({
      tenantId: 'tenant-alpha',
      user: { id: actorId }
    })
    mocks.resolvePageStudioBuildWorker.mockReturnValue(worker)
    mocks.buildApprovedPageStudioVersion.mockResolvedValue({ buildId: 'build_a' })
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

    await expect(handler(event as never)).resolves.toEqual({ build: { buildId: 'build_a' } })
    expect(mocks.requireAgencyPageStudioAccess)
      .toHaveBeenCalledWith(event, 'PAGE_STUDIO_PUBLISH')
    expect(mocks.buildApprovedPageStudioVersion).toHaveBeenCalledWith({
      actorId,
      ...body,
      idempotencyKey: 'build_01HXYZ',
      siteId,
      tenantId: 'tenant-alpha',
      versionId
    }, { worker })
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

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.resolvePageStudioBuildWorker).not.toHaveBeenCalled()
    expect(mocks.buildApprovedPageStudioVersion).not.toHaveBeenCalled()
  })
})
