import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireRole = vi.fn()
const listEmailEndpoints = vi.fn()

vi.mock('~~/server/utils/auth', () => ({ requireRole: (...args: unknown[]) => requireRole(...args) }))
vi.mock('~~/server/utils/leads/emailEndpoint', () => ({ listEmailEndpoints: (...args: unknown[]) => listEmailEndpoints(...args) }))

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: { query?: unknown }) => unknown
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number }
}
globals.defineEventHandler = handler => handler
globals.getQuery = event => event.query ?? {}
globals.createError = input => Object.assign(new Error(input.statusMessage), input)

describe('GET /api/leads/email-endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' })
    listEmailEndpoints.mockResolvedValue([])
  })

  it('returns 403 for a portal session without calling staff authorization or enumeration', async () => {
    const handler = (await import('~~/server/api/leads/email-endpoints/index.get')).default
    await expect(handler({ context: { clientPortalUser: { id: 'portal-user' } }, query: { client_id: '11111111-1111-4111-8111-111111111111' } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(requireRole).not.toHaveBeenCalled()
    expect(listEmailEndpoints).not.toHaveBeenCalled()
  })

  it('requires the MEDIA_BUYING role before listing only the requested authorized client', async () => {
    const handler = (await import('~~/server/api/leads/email-endpoints/index.get')).default
    await handler({ context: {}, query: { client_id: '11111111-1111-4111-8111-111111111111' } } as never)
    expect(requireRole).toHaveBeenCalledOnce()
    expect(listEmailEndpoints).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
  })
})
