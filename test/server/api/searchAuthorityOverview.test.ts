import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  requireAccess: vi.fn(),
  queryOne: vi.fn()
}))

vi.mock('h3', () => ({
  getQuery: () => mocks.query
}))
vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne
}))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)

describe('Search Authority overview API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.query = {
      clientId: CLIENT_ID,
      startDate: '2026-07-04',
      endDate: '2026-07-31'
    }
  })

  it('returns provider caveats, literal search metrics and opportunity counts', async () => {
    mocks.queryOne
      .mockResolvedValueOnce({
        property_map_id: '22222222-2222-4222-8222-222222222222',
        site_status: 'active',
        connection_status: 'degraded',
        last_success_at: '2026-07-30T01:00:00.000Z',
        last_error_message: 'Google quota retry pending',
        last_sync_status: 'partial',
        data_through_date: '2026-07-30',
        provisional_from_date: '2026-07-29'
      })
      .mockResolvedValueOnce({
        current_clicks: '120',
        current_impressions: '4000',
        current_ctr: '0.03',
        current_position: '8.5',
        previous_clicks: '100',
        previous_impressions: '5000',
        coverage_days: '28',
        previous_coverage_days: '28',
        provisional: true
      })
      .mockResolvedValueOnce({
        total: '6',
        new_count: '3',
        under_review_count: '1',
        accepted_count: '1',
        task_created_count: '1'
      })

    const handler = (await import(
      '~~/server/api/agency/search-authority/overview.get'
    )).default
    const result = await handler({} as never)

    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(result).toMatchObject({
      window: {
        startDate: '2026-07-04',
        endDate: '2026-07-31'
      },
      provider: {
        connectionStatus: 'degraded',
        dataThroughDate: '2026-07-30',
        provisionalFromDate: '2026-07-29',
        stale: true
      },
      metrics: {
        clicks: 120,
        impressions: 4000,
        ctr: 0.03,
        position: 8.5,
        clickChangePercent: 20,
        impressionChangePercent: -20
      },
      opportunities: {
        total: 6,
        new: 3,
        underReview: 1,
        accepted: 1,
        taskCreated: 1
      }
    })
    expect(result.provider.caveats).toEqual(expect.arrayContaining([
      expect.stringMatching(/degraded/i),
      expect.stringMatching(/provisional/i),
      expect.stringMatching(/through 30 Jul(?:y)? 2026/i)
    ]))
    expect(result).not.toHaveProperty('aiVisibilityScore')
    expect(mocks.queryOne.mock.calls[1]?.[1]).toContain(
      '22222222-2222-4222-8222-222222222222'
    )
  })

  it('rejects windows longer than 90 days', async () => {
    mocks.query = {
      clientId: CLIENT_ID,
      startDate: '2026-01-01',
      endDate: '2026-07-31'
    }
    const handler = (await import(
      '~~/server/api/agency/search-authority/overview.get'
    )).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400
    })
    expect(mocks.requireAccess).not.toHaveBeenCalled()
  })

  it('does not invent growth when the comparison window is incomplete', async () => {
    mocks.queryOne
      .mockResolvedValueOnce({
        property_map_id: '22222222-2222-4222-8222-222222222222',
        site_status: 'active',
        connection_status: 'active',
        last_success_at: '2026-07-31T01:00:00.000Z',
        last_error_message: null,
        last_sync_status: 'succeeded',
        data_through_date: '2026-07-31',
        provisional_from_date: null
      })
      .mockResolvedValueOnce({
        current_clicks: '120',
        current_impressions: '4000',
        current_ctr: '0.03',
        current_position: '8.5',
        previous_clicks: '0',
        previous_impressions: '0',
        coverage_days: '28',
        previous_coverage_days: '0',
        provisional: false
      })
      .mockResolvedValueOnce({
        total: '0',
        new_count: '0',
        under_review_count: '0',
        accepted_count: '0',
        task_created_count: '0'
      })
    const handler = (await import(
      '~~/server/api/agency/search-authority/overview.get'
    )).default
    const result = await handler({} as never)

    expect(result.metrics.clickChangePercent).toBeNull()
    expect(result.metrics.impressionChangePercent).toBeNull()
    expect(result.provider.caveats).toEqual(expect.arrayContaining([
      expect.stringMatching(/preceding comparison window is incomplete/i)
    ]))
  })

  it('returns unavailable metrics instead of invented zeroes for incomplete evidence', async () => {
    mocks.queryOne
      .mockResolvedValueOnce({
        property_map_id: '22222222-2222-4222-8222-222222222222',
        site_status: 'active',
        connection_status: 'degraded',
        last_sync_status: 'failed',
        last_success_at: null,
        last_error_message: null,
        data_through_date: null,
        provisional_from_date: null
      })
      .mockResolvedValueOnce({
        current_clicks: '0',
        current_impressions: '0',
        current_ctr: '0',
        current_position: '0',
        previous_clicks: '0',
        previous_impressions: '0',
        coverage_days: '0',
        previous_coverage_days: '0',
        provisional: false
      })
      .mockResolvedValueOnce({
        total: '0',
        new_count: '0',
        under_review_count: '0',
        accepted_count: '0',
        task_created_count: '0'
      })
    const handler = (await import(
      '~~/server/api/agency/search-authority/overview.get'
    )).default

    const result = await handler({} as never)
    expect(result.metrics).toBeNull()
    expect(result.provider.caveats).toEqual(expect.arrayContaining([
      expect.stringMatching(/did not complete/i),
      expect.stringMatching(/incomplete/i)
    ]))
  })
})
