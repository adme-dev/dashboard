import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: any) => Record<string, unknown>
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mockRequireScope = vi.fn()
const mockGetOverview = vi.fn()
const mockGetTimeseries = vi.fn()
const mockGetBreakdowns = vi.fn()

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  requireTrackingAudienceScope: (...args: unknown[]) => mockRequireScope(...args)
}))

vi.mock('~~/server/utils/tracking/audience-repository', () => ({
  getAudienceOverview: (...args: unknown[]) => mockGetOverview(...args),
  getAudienceTimeseries: (...args: unknown[]) => mockGetTimeseries(...args),
  getAudienceBreakdowns: (...args: unknown[]) => mockGetBreakdowns(...args)
}))

const { default: overviewHandler } = await import(
  '../../../../server/api/agency/tracking/audiences/overview.get'
)
const { default: timeseriesHandler } = await import(
  '../../../../server/api/agency/tracking/audiences/timeseries.get'
)
const { default: breakdownsHandler } = await import(
  '../../../../server/api/agency/tracking/audiences/breakdowns.get'
)

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function event(query: Record<string, unknown> = {}) {
  return { query } as any
}

beforeEach(() => {
  mockRequireScope.mockReset().mockResolvedValue({
    user: { id: USER_ID, role: 'owner' },
    accessibleClientIds: null,
    clientIds: null
  })
  mockGetOverview.mockReset().mockResolvedValue({ kind: 'overview' })
  mockGetTimeseries.mockReset().mockResolvedValue({ kind: 'timeseries' })
  mockGetBreakdowns.mockReset().mockResolvedValue({ kind: 'breakdowns' })
})

describe('tracking audience analytics routes', () => {
  it('passes validated dates and both client scopes to the overview repository', async () => {
    mockRequireScope.mockResolvedValue({
      user: { id: USER_ID, role: 'media_buyer' },
      accessibleClientIds: [CLIENT_A],
      clientIds: [CLIENT_A]
    })

    await expect(overviewHandler(event({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: CLIENT_A
    }))).resolves.toEqual({ kind: 'overview' })

    expect(mockRequireScope).toHaveBeenCalledWith(expect.anything(), CLIENT_A)
    expect(mockGetOverview).toHaveBeenCalledWith({
      range: {
        fromDate: '2026-07-03',
        toDate: '2026-08-01',
        previousFromDate: '2026-06-03',
        previousToDate: '2026-07-02',
        days: 30
      },
      accessibleClientIds: [CLIENT_A],
      clientIds: [CLIENT_A]
    })
  })

  it('defaults the trend metric to visitors and accepts each allowlisted selector', async () => {
    await timeseriesHandler(event({ from: '2026-07-26', to: '2026-08-01' }))
    expect(mockGetTimeseries).toHaveBeenLastCalledWith(expect.objectContaining({ metric: 'visitors' }))

    for (const metric of ['visitors', 'sessions', 'engagedSessions', 'leadActions', 'confirmedLeads']) {
      await timeseriesHandler(event({ from: '2026-07-26', to: '2026-08-01', metric }))
      expect(mockGetTimeseries).toHaveBeenLastCalledWith(expect.objectContaining({ metric }))
    }
  })

  it('rejects an unknown trend metric before repository access', async () => {
    await expect(timeseriesHandler(event({ metric: 'revenue' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Unknown audience metric'
    })
    expect(mockGetTimeseries).not.toHaveBeenCalled()
  })

  it('accepts fixed breakdown dimensions and rejects arbitrary SQL-like input', async () => {
    for (const dimension of ['source', 'campaign', 'page', 'paid_organic', 'device', 'interest']) {
      await breakdownsHandler(event({ from: '2026-07-26', to: '2026-08-01', dimension }))
      expect(mockGetBreakdowns).toHaveBeenLastCalledWith(expect.objectContaining({ dimension }))
    }

    mockGetBreakdowns.mockClear()
    await expect(breakdownsHandler(event({ dimension: 'source; DROP TABLE tracking_events' })))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Unknown audience dimension' })
    expect(mockGetBreakdowns).not.toHaveBeenCalled()
  })

  it('rejects a range over ninety inclusive days before querying analytics', async () => {
    await expect(overviewHandler(event({ from: '2026-05-03', to: '2026-08-01' })))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'Range too large (max 90 days)' })
    expect(mockRequireScope).not.toHaveBeenCalled()
    expect(mockGetOverview).not.toHaveBeenCalled()
  })

  it('returns the repository empty contract for a user with no assigned clients', async () => {
    mockRequireScope.mockResolvedValue({
      user: { id: USER_ID, role: 'media_buyer' },
      accessibleClientIds: [],
      clientIds: []
    })
    mockGetOverview.mockResolvedValue({ coverage: { total: 0 }, clients: [] })

    await expect(overviewHandler(event({ from: '2026-07-03', to: '2026-08-01' })))
      .resolves.toEqual({ coverage: { total: 0 }, clients: [] })
    expect(mockGetOverview).toHaveBeenCalledWith(expect.objectContaining({
      accessibleClientIds: [],
      clientIds: []
    }))
  })
})
