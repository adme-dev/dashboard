import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregate, fixture, installBookingHttpGlobals, scope, siteId, siteRow } from '../../fixtures/pageStudioBookings'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), enabled: vi.fn(), verify: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: (...args: unknown[]) => mocks.query(...args) }))
vi.mock('~~/server/utils/pageStudio/access', () => ({ requireAgencyPageStudioAccess: (...args: unknown[]) => mocks.auth(...args) }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: (...args: unknown[]) => mocks.auth(...args) }))
vi.mock('~~/server/utils/turnstile', () => ({ isTurnstileEnabled: () => mocks.enabled(), verifyTurnstile: (...args: unknown[]) => mocks.verify(...args) }))
installBookingHttpGlobals()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ tenantId: scope.tenantId, user: { id: 'operator-1' }, id: 'user-1', clientId: scope.clientId })
  mocks.query.mockResolvedValue(siteRow)
  mocks.enabled.mockReturnValue(true)
  mocks.verify.mockResolvedValue(true)
})

describe('agency booking queue through scoped adapter', () => {
  it('derives scope and returns normalized bookings with private cache headers', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings.get')
    const { event, service } = fixture()
    service.listScopedBookings.mockResolvedValue([aggregate('quoted')])
    await expect(handler({ ...event, query: { siteId, status: 'quoted', limit: '10' } } as never)).resolves.toEqual({ tenantId: scope.tenantId, siteId, bookings: [expect.objectContaining({ id: 'booking-1', customerName: 'Alex', status: 'quoted', version: 0 })] })
    expect(service.listScopedBookings).toHaveBeenCalledWith(scope, { status: 'quoted', limit: 10 })
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'PAGE_STUDIO_VIEW')
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('xero_org_connection'), [scope.tenantId, siteId])
    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'cache-control', 'private, no-store')
  })
  it('rejects missing site selection before database or Worker access', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings.get')
    const { event, service } = fixture()
    await expect(handler({ ...event, query: {} } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.query).not.toHaveBeenCalled()
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
  it('does not fall back to the legacy global Worker binding', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings.get')
    const { service } = fixture()
    await expect(handler({ query: { siteId }, context: { cloudflare: { env: { PAGE_STUDIO_BOOKINGS: service } } } } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
  it('denies a site outside the authenticated organization', async () => {
    const { default: handler } = await import('~~/server/api/agency/page-studio/bookings.get')
    const { event, service } = fixture()
    mocks.query.mockResolvedValue(null)
    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(service.listScopedBookings).not.toHaveBeenCalled()
  })
})
