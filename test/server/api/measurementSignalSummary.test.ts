import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const mockRequireClientAccess = vi.fn()
const mockGetSummary = vi.fn()
const mockCreateService = vi.fn(() => ({ get: mockGetSummary }))

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementClientAccess: (...args: unknown[]) => mockRequireClientAccess(...args)
}))

vi.mock('~~/server/utils/measurement/signalSummary', () => ({
  createMeasurementSignalSummaryService: (...args: unknown[]) => mockCreateService(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => CLIENT_ID,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('agency measurement signal summary endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAccess.mockResolvedValue({ id: 'staff-1', role: 'media_buyer' })
    mockGetSummary.mockResolvedValue({
      captured: 100,
      confirmed: 4,
      consentGranted: 60,
      policySkipped: 40,
      delivered: 3,
      retrying: 1,
      failed: 2,
      identifierCoverage: { ttclid: 12, ttp: 10 },
      freshnessAt: '2026-09-04T01:02:03.000Z'
    })
  })

  it('returns aggregate-only signal health after tenant-scoped view access', async () => {
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/signals/summary.get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'view')
    expect(mockCreateService).toHaveBeenCalledOnce()
    expect(mockGetSummary).toHaveBeenCalledWith(CLIENT_ID)
    expect(result).toMatchObject({ captured: 100, confirmed: 4 })
    expect(JSON.stringify(result)).not.toMatch(/ttclid-raw|ttp-raw|access.?token|credential/i)
  })

  it('does not construct or query the summary service when tenant access is denied', async () => {
    mockRequireClientAccess.mockRejectedValue(Object.assign(new Error('Not found'), {
      statusCode: 404,
      statusMessage: 'Measurement profile not found'
    }))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/signals/summary.get'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateService).not.toHaveBeenCalled()
    expect(mockGetSummary).not.toHaveBeenCalled()
  })
})
