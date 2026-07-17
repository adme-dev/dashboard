import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const mockRequireClientAccess = vi.fn()
const mockListAudit = vi.fn()
const mockGetReadiness = vi.fn()
const mockRuntime = vi.fn((..._args: unknown[]) => ({
  listAudit: mockListAudit,
  getReadiness: mockGetReadiness
}))
let mockQuery: Record<string, string> = {}

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementClientAccess: (...args: unknown[]) => mockRequireClientAccess(...args)
}))

vi.mock('~~/server/utils/measurement/runtime', () => ({
  createMeasurementReadRuntime: (...args: unknown[]) => mockRuntime(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => CLIENT_ID,
  getQuery: () => mockQuery,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('agency Measurement read endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = {}
    mockRequireClientAccess.mockResolvedValue({ id: 'staff-1', role: 'media_buyer' })
    mockListAudit.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }
    })
    mockGetReadiness.mockResolvedValue({
      clientId: CLIENT_ID,
      status: 'onboarding',
      liveEligible: false,
      blockers: []
    })
  })

  it('returns paginated audit metadata only after scoped view access', async () => {
    mockQuery = { page: '2', pageSize: '10', entityType: 'destination' }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/audit.get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'view')
    expect(mockListAudit).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      page: '2',
      pageSize: '10',
      entityType: 'destination'
    })
    expect(result).toEqual(expect.objectContaining({ items: [] }))
  })

  it('returns computed readiness only after scoped view access', async () => {
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/readiness.get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'view')
    expect(mockGetReadiness).toHaveBeenCalledWith(CLIENT_ID)
    expect(result).toMatchObject({ status: 'onboarding', liveEligible: false })
  })

  it('does not construct the read service when tenant access is denied', async () => {
    mockRequireClientAccess.mockRejectedValue(Object.assign(new Error('Not found'), {
      statusCode: 404,
      statusMessage: 'Measurement profile not found'
    }))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/readiness.get'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockRuntime).not.toHaveBeenCalled()
    expect(mockGetReadiness).not.toHaveBeenCalled()
  })
})
