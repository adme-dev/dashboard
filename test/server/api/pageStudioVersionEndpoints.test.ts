import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAgencyPageStudioAccess: vi.fn(),
  requireClientAuth: vi.fn(),
  resolveAgencyPageStudioSiteClient: vi.fn(),
  resolvePortalPageStudioSiteTenant: vi.fn(),
  reviewPageStudioVersion: vi.fn(),
  submitPageStudioVersion: vi.fn()
}))

vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.requireAgencyPageStudioAccess(...args)
}))
vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args)
}))
vi.mock('~~/server/utils/pageStudio/versions', () => ({
  resolveAgencyPageStudioSiteClient: (...args: unknown[]) => mocks.resolveAgencyPageStudioSiteClient(...args),
  resolvePortalPageStudioSiteTenant: (...args: unknown[]) => mocks.resolvePortalPageStudioSiteTenant(...args),
  reviewPageStudioVersion: (...args: unknown[]) => mocks.reviewPageStudioVersion(...args),
  submitPageStudioVersion: (...args: unknown[]) => mocks.submitPageStudioVersion(...args),
  PageStudioVersionError: class PageStudioVersionError extends Error {}
}))

type Event = { context: Record<string, unknown>, params: Record<string, string>, body?: unknown }
const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getRouterParam: (event: Event, key: string) => string | undefined
  readBody: (event: Event) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
testGlobal.eventHandler = handler => handler
testGlobal.getRouterParam = (event, key) => event.params[key]
testGlobal.readBody = async event => event.body
testGlobal.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

const siteId = '11111111-1111-4111-8111-111111111111'
const versionId = '22222222-2222-4222-8222-222222222222'
const clientId = '33333333-3333-4333-8333-333333333333'

describe('Page Studio version endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAgencyPageStudioAccess.mockResolvedValue({
      tenantId: 'tenant-alpha', user: { id: 'agency-user' }
    })
    mocks.requireClientAuth.mockResolvedValue({ id: 'portal-user', clientId, role: 'manager' })
    mocks.resolvePortalPageStudioSiteTenant.mockResolvedValue('tenant-alpha')
    mocks.resolveAgencyPageStudioSiteClient.mockResolvedValue(clientId)
    mocks.submitPageStudioVersion.mockResolvedValue({ id: versionId, status: 'in_review' })
    mocks.reviewPageStudioVersion.mockResolvedValue({
      id: 'review-1', versionId, decision: 'approved', versionDigest: 'a'.repeat(64)
    })
  })

  it('submits through the authenticated portal client and site membership', async () => {
    const { default: handler } = await import(
      '~~/server/api/portal/page-studio/sites/[siteId]/versions/[versionId]/submissions.post'
    )
    const event = { context: {}, params: { siteId, versionId } }

    await expect(handler(event as never)).resolves.toMatchObject({ version: { status: 'in_review' } })
    expect(mocks.resolvePortalPageStudioSiteTenant).toHaveBeenCalledWith({ clientId, siteId, userId: 'portal-user' })
    expect(mocks.submitPageStudioVersion).toHaveBeenCalledWith({
      tenantId: 'tenant-alpha', clientId, siteId, versionId, portalUserId: 'portal-user'
    })
  })

  it('does not submit a valid site id from another portal client', async () => {
    mocks.resolvePortalPageStudioSiteTenant.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }))
    const { default: handler } = await import(
      '~~/server/api/portal/page-studio/sites/[siteId]/versions/[versionId]/submissions.post'
    )

    await expect(handler({ context: {}, params: { siteId, versionId } } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.submitPageStudioVersion).not.toHaveBeenCalled()
  })

  it('requires explicit agency approval permission and reviews the selected-tenant version', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/page-studio/sites/[siteId]/versions/[versionId]/reviews.post'
    )
    const event = {
      context: {}, params: { siteId, versionId }, body: { decision: 'approved', comment: 'Ready' }
    }

    await expect(handler(event as never)).resolves.toMatchObject({ review: { decision: 'approved' } })
    expect(mocks.requireAgencyPageStudioAccess).toHaveBeenCalledWith(event, 'PAGE_STUDIO_APPROVE')
    expect(mocks.resolveAgencyPageStudioSiteClient).toHaveBeenCalledWith('tenant-alpha', siteId)
    expect(mocks.reviewPageStudioVersion).toHaveBeenCalledWith({
      tenantId: 'tenant-alpha', siteId, versionId, reviewerId: 'agency-user',
      clientId: clientId, decision: 'approved', comment: 'Ready'
    })
  })
})
