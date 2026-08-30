import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createPageStudioSite: vi.fn(),
  listAgencyPageStudioSites: vi.fn(),
  listPortalPageStudioSites: vi.fn(),
  requireAgencyPageStudioAccess: vi.fn(),
  requireClientAuth: vi.fn(),
  resolvePortalPageStudioTenant: vi.fn()
}))

vi.mock('~~/server/utils/pageStudio/access', () => ({
  requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.requireAgencyPageStudioAccess(...args)
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args)
}))

vi.mock('~~/server/utils/pageStudio/sites', () => ({
  createPageStudioSite: (...args: unknown[]) => mocks.createPageStudioSite(...args),
  listAgencyPageStudioSites: (...args: unknown[]) => mocks.listAgencyPageStudioSites(...args),
  listPortalPageStudioSites: (...args: unknown[]) => mocks.listPortalPageStudioSites(...args),
  resolvePortalPageStudioTenant: (...args: unknown[]) => mocks.resolvePortalPageStudioTenant(...args),
  PageStudioSiteError: class PageStudioSiteError extends Error {}
}))

type TestEvent = {
  body?: unknown
  context: Record<string, unknown>
  query?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, unknown>
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}

testGlobal.eventHandler = handler => handler
testGlobal.getQuery = event => event.query ?? {}
testGlobal.readBody = async event => event.body
testGlobal.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

const site = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  entitlementId: '33333333-3333-4333-8333-333333333333',
  name: 'Spring campaign',
  route: 'spring-campaign',
  starterVersion: 'automotive-campaign-v1',
  status: 'draft',
  createdAt: '2026-08-30T01:00:00.000Z',
  updatedAt: '2026-08-30T01:00:00.000Z'
}

const agencyEvent: TestEvent = { context: {}, query: {} }
const portalUser = {
  id: '44444444-4444-4444-8444-444444444444',
  clientId: site.clientId,
  role: 'manager',
  isPrimaryContact: false
}

describe('Page Studio site endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAgencyPageStudioAccess.mockResolvedValue({
      tenantId: 'tenant-alpha',
      user: { id: 'agency-user' }
    })
    mocks.requireClientAuth.mockResolvedValue(portalUser)
    mocks.resolvePortalPageStudioTenant.mockResolvedValue('tenant-alpha')
    mocks.createPageStudioSite.mockResolvedValue(site)
    mocks.listAgencyPageStudioSites.mockResolvedValue({ items: [site], total: 1 })
    mocks.listPortalPageStudioSites.mockResolvedValue({ items: [site], total: 1 })
  })

  it('lists only the selected agency tenant with Page Studio view permission', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/index.get')
    const event = { ...agencyEvent, query: { clientId: site.clientId, status: 'draft', page: '1' } }

    await expect(handler(event as never)).resolves.toEqual({ sites: [site], total: 1, page: 1, pageSize: 25 })
    expect(mocks.requireAgencyPageStudioAccess).toHaveBeenCalledWith(event, 'PAGE_STUDIO_VIEW')
    expect(mocks.listAgencyPageStudioSites).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-alpha',
      clientId: site.clientId,
      status: 'draft'
    }))
  })

  it('creates an agency site from validated input and the selected tenant', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/index.post')
    const event = {
      context: {},
      body: {
        clientId: site.clientId,
        name: site.name,
        route: site.route,
        starterVersion: site.starterVersion
      }
    }

    await expect(handler(event as never)).resolves.toEqual({ site })
    expect(mocks.requireAgencyPageStudioAccess).toHaveBeenCalledWith(event, 'PAGE_STUDIO_EDIT')
    expect(mocks.createPageStudioSite).toHaveBeenCalledWith({
      actorId: 'agency-user',
      actorRole: 'agency',
      clientId: site.clientId,
      name: site.name,
      route: site.route,
      starterVersion: site.starterVersion,
      tenantId: 'tenant-alpha'
    })
  })

  it('never reaches the site service when agency access is denied', async () => {
    mocks.requireAgencyPageStudioAccess.mockRejectedValue(
      Object.assign(new Error('denied'), { statusCode: 403 })
    )
    const { default: handler } = await import('~~/server/api/agency/page-studio/sites/index.post')

    await expect(handler({ context: {}, body: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.createPageStudioSite).not.toHaveBeenCalled()
  })

  it('lists portal sites by authenticated client and membership without accepting tenant scope', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/index.get')

    await expect(handler({ context: {}, query: {} } as never)).resolves.toEqual({
      sites: [site],
      total: 1,
      page: 1,
      pageSize: 25
    })
    expect(mocks.listPortalPageStudioSites).toHaveBeenCalledWith(expect.objectContaining({
      clientId: site.clientId,
      userId: portalUser.id
    }))
    expect(mocks.listPortalPageStudioSites).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: expect.anything() }))
  })

  it('allows a portal manager to create only inside the authenticated client scope', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/index.post')
    const event = {
      context: {},
      body: { name: site.name, route: site.route, starterVersion: site.starterVersion }
    }

    await expect(handler(event as never)).resolves.toEqual({ site })
    expect(mocks.resolvePortalPageStudioTenant).toHaveBeenCalledWith(site.clientId)
    expect(mocks.createPageStudioSite).toHaveBeenCalledWith(expect.objectContaining({
      actorId: portalUser.id,
      actorRole: 'client',
      clientId: site.clientId,
      portalUserId: portalUser.id,
      tenantId: 'tenant-alpha'
    }))
  })

  it('denies portal viewers before resolving an entitlement or creating a site', async () => {
    mocks.requireClientAuth.mockResolvedValue({ ...portalUser, role: 'viewer' })
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/index.post')

    await expect(handler({
      context: {},
      body: { name: site.name, route: site.route, starterVersion: site.starterVersion }
    } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.resolvePortalPageStudioTenant).not.toHaveBeenCalled()
    expect(mocks.createPageStudioSite).not.toHaveBeenCalled()
  })

  it('rejects malformed routes and arbitrary portal client IDs', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/sites/index.post')

    await expect(handler({
      context: {},
      body: {
        clientId: '99999999-9999-4999-8999-999999999999',
        name: site.name,
        route: '../other-client',
        starterVersion: site.starterVersion
      }
    } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.createPageStudioSite).not.toHaveBeenCalled()
  })
})
