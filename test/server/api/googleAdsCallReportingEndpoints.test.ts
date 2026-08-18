import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()
const mockSyncGoogleAdsCalls = vi.fn()
const mockRequireClientAuth = vi.fn()
const runtimeConfig = {
  googleClientId: 'runtime-client',
  googleClientSecret: 'runtime-secret',
  googleDeveloperToken: 'runtime-developer-token',
  googleAdsLoginCustomerId: '9998887777'
}
const mockResolveGoogleAdsRuntimeConfig = vi.fn(() => runtimeConfig)

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getHeader: (event: { headers?: Record<string, string> }, name: string) => event.headers?.[name],
  getQuery: (event: { query?: Record<string, string> }) => event.query || {},
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/permissions', () => ({
  PERMISSIONS: { CLIENTS: ['owner'], MEDIA_BUYING: ['admin'] }
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/googleAdsCallReporting', () => ({
  syncGoogleAdsCalls: (...args: unknown[]) => mockSyncGoogleAdsCalls(...args)
}))

vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: (...args: unknown[]) => mockResolveGoogleAdsRuntimeConfig(...args)
}))

const { default: readHandler } = await import('~~/server/api/agency/analytics/google-calls.get')
const { default: cronHandler } = await import('~~/server/api/cron/google-ads-call-reporting.post')
const { default: portalHandler } = await import('~~/server/api/portal/analytics/google-calls.get')

describe('Google Ads call reporting endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret'
    mockRequireRole.mockResolvedValue({ id: 'user-1' })
    mockRequireClientAuth.mockResolvedValue({
      clientId: '22222222-2222-4222-8222-222222222222',
      permissions: { canViewAnalytics: true }
    })
  })

  it('returns safe numeric summary fields and preserves unavailable duration as null', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{
        total_calls: '4',
        answered_calls: '2',
        missed_calls: '1',
        unknown_calls: '1',
        duration_available_calls: '0',
        total_duration_seconds: null,
        average_duration_seconds: null,
        longest_duration_seconds: null,
        last_synced_at: '2026-08-17T04:00:00.000Z'
      }])
      .mockResolvedValueOnce([{
        campaign_id: '1001',
        campaign_name: 'Brand',
        total_calls: '4',
        answered_calls: '2',
        missed_calls: '1',
        duration_available_calls: '0',
        average_duration_seconds: null
      }])

    const response = await readHandler({
      query: { startDate: '2026-08-01', endDate: '2026-08-17', clientId: '11111111-1111-4111-8111-111111111111' }
    } as never)

    expect(mockRequireRole).toHaveBeenCalled()
    expect(response.summary).toEqual({
      totalCalls: 4,
      answeredCalls: 2,
      missedCalls: 1,
      unknownCalls: 1,
      durationAvailableCalls: 0,
      totalDurationSeconds: null,
      averageDurationSeconds: null,
      longestDurationSeconds: null,
      lastSyncedAt: '2026-08-17T04:00:00.000Z'
    })
    expect(response.byCampaign[0]).toMatchObject({
      campaignId: '1001',
      totalCalls: 4,
      averageDurationSeconds: null
    })
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual(['11111111-1111-4111-8111-111111111111', '2026-08-01', '2026-08-17'])
  })

  it('rejects malformed or reversed read ranges before querying', async () => {
    await expect(readHandler({ query: { startDate: '01-08-2026', endDate: '2026-08-17' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(readHandler({ query: { startDate: '2026-08-18', endDate: '2026-08-17' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(readHandler({
      query: { startDate: '2026-08-01', endDate: '2026-08-17', clientId: 'not-a-uuid' }
    } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('passes a bounded explicit window from the cron route to the sync service', async () => {
    mockSyncGoogleAdsCalls.mockResolvedValue({ connectionsSynced: 2, callsUpserted: 7, errors: [] })

    const response = await cronHandler({
      query: { startDate: '2026-08-01', endDate: '2026-08-17' },
      headers: { 'x-cron-secret': 'cron-secret' }
    } as never)

    expect(mockSyncGoogleAdsCalls).toHaveBeenCalledWith({
      startDate: '2026-08-01',
      endDate: '2026-08-17',
      lookbackDays: undefined,
      runtimeConfig
    })
    expect(response).toEqual({
      ok: true,
      connectionsSynced: 2,
      callsUpserted: 7,
      errors: []
    })
  })

  it('forces portal reporting to the authenticated client and requires analytics permission', async () => {
    mockQueryRows.mockResolvedValue([])
    const response = await portalHandler({
      query: {
        startDate: '2026-08-01',
        endDate: '2026-08-17',
        clientId: '11111111-1111-4111-8111-111111111111'
      }
    } as never)

    expect(response.clientId).toBe('22222222-2222-4222-8222-222222222222')
    expect(mockQueryRows.mock.calls[0]?.[1]?.[0]).toBe('22222222-2222-4222-8222-222222222222')

    mockRequireClientAuth.mockResolvedValueOnce({
      clientId: '22222222-2222-4222-8222-222222222222',
      permissions: { canViewAnalytics: false }
    })
    await expect(portalHandler({
      query: { startDate: '2026-08-01', endDate: '2026-08-17' }
    } as never)).rejects.toMatchObject({ statusCode: 403 })
  })
})
