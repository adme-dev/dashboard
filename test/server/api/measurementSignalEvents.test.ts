import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const mockRequireClientAccess = vi.fn()
const mockList = vi.fn()
const mockCreateService = vi.fn(() => ({ list: mockList }))
const mockQuery = {
  platform: 'tiktok',
  eventName: 'web_conversion',
  state: 'accepted',
  limit: '25'
}

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementClientAccess: (...args: unknown[]) => mockRequireClientAccess(...args)
}))

vi.mock('~~/server/utils/measurement/eventLineage', () => ({
  createMeasurementEventLineageService: (...args: unknown[]) => mockCreateService(...args)
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

describe('agency measurement signal events endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAccess.mockResolvedValue({ id: 'staff-1', role: 'media_buyer' })
    mockList.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('passes bounded filters to the tenant-scoped lineage service', async () => {
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/signals/index.get'
    )).default

    await expect(handler({ context: {} } as never)).resolves.toEqual({
      items: [],
      nextCursor: null
    })
    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'view')
    expect(mockCreateService).toHaveBeenCalledOnce()
    expect(mockList).toHaveBeenCalledWith(CLIENT_ID, mockQuery)
  })

  it('does not construct or query lineage when tenant access is denied', async () => {
    mockRequireClientAccess.mockRejectedValue(Object.assign(new Error('Not found'), {
      statusCode: 404,
      statusMessage: 'Measurement profile not found'
    }))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/signals/index.get'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateService).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
  })
})
