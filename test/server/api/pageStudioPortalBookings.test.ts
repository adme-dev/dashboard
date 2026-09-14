import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageStudioBookingsError } from '~~/server/utils/pageStudio/bookingsBinding'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), list: vi.fn() }))
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth: mocks.auth }))
vi.mock('~~/server/utils/pageStudio/portalBookings', () => ({ createPortalPageStudioBooking: mocks.create, listPortalPageStudioBookings: mocks.list }))
interface Event { query: Record<string, unknown>, body?: unknown, context: { cloudflare?: { env: Record<string, unknown> } } }
const globals = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  getQuery: (event: Event) => Record<string, unknown>
  readBody: (event: Event) => Promise<unknown>
  setHeader: (event: Event, name: string, value: string) => void
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
globals.eventHandler = handler => handler
globals.getQuery = event => event.query
globals.readBody = async event => event.body
globals.setHeader = vi.fn()
globals.createError = input => Object.assign(new Error(String(input.statusMessage)), input)
const siteId = '50000000-0000-4000-8000-000000000001'
const user = { id: 'portal-user', clientId: 'selected-client', role: 'manager' }
const event = (): Event => ({ query: { siteId }, body: { requestKey: 'synthetic-fixture' }, context: { cloudflare: { env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' } } } })
const { default: get } = await import('~~/server/api/portal/page-studio/bookings.get')
const { default: post } = await import('~~/server/api/portal/page-studio/bookings.post')
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue(user)
  mocks.list.mockResolvedValue({ bookings: [], canCreate: true })
  mocks.create.mockResolvedValue({ booking: { id: 'saved' }, replayed: false })
})
describe('portal booking endpoint boundaries', () => {
  it.each([get, post])('requires authenticated portal access before invoking the booking service', async (handler) => {
    mocks.auth.mockRejectedValue(globals.createError({ statusCode: 401, statusMessage: 'Not authenticated' }))
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('derives create actor from the authenticated user and keeps success private', async () => {
    const input = event()
    await expect(post(input as never)).resolves.toEqual({ booking: { id: 'saved' }, replayed: false })
    expect(mocks.create).toHaveBeenCalledWith({ actor: { userId: user.id, clientId: user.clientId, role: user.role }, siteId, env: input.context.cloudflare!.env }, input.body)
    expect(globals.setHeader).toHaveBeenCalledWith(input, 'cache-control', 'private, no-store')
  })
  it('derives read scope from the selected client and validates filters', async () => {
    const input = event()
    input.query = { siteId, status: 'approved', limit: '10' }
    await expect(get(input as never)).resolves.toEqual({ siteId, bookings: [], canCreate: true })
    expect(mocks.list).toHaveBeenCalledWith({ actor: { userId: user.id, clientId: user.clientId, role: user.role }, siteId, env: input.context.cloudflare!.env }, { status: 'approved', limit: 10 })
  })
  it.each([get, post])('rejects caller-supplied tenant/client filters', async (handler) => {
    const input = event()
    input.query.clientId = 'foreign'
    input.query.tenantId = 'foreign'
    await expect(handler(input as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('projects the stable conflict without hiding its retry meaning', async () => {
    mocks.create.mockRejectedValue(new PageStudioBookingsError('BOOKING_REQUEST_CONFLICT', 'This request was already used for a different booking enquiry', 409))
    await expect(post(event() as never)).rejects.toMatchObject({ statusCode: 409, data: { error: { code: 'BOOKING_REQUEST_CONFLICT' } } })
  })
  it('does not disclose an unexpected provider exception', async () => {
    mocks.create.mockRejectedValue(new Error('provider host/password details'))
    await expect(post(event() as never)).rejects.toMatchObject({ statusCode: 500, statusMessage: 'Page Studio request failed' })
  })
})
