import { describe, expect, it, vi } from 'vitest'
import {
  syncSearchConsoleClient,
  syncSearchConsoleProperty
} from '~~/server/utils/searchAuthority/sync'

const map = {
  clientId: '11111111-1111-4111-8111-111111111111',
  propertyMapId: '22222222-2222-4222-8222-222222222222',
  connectionId: '33333333-3333-4333-8333-333333333333',
  propertyUri: 'sc-domain:example.com'
}
const credential = {
  connectionId: map.connectionId,
  clientId: map.clientId,
  googleSub: 'subject',
  email: 'search@example.com',
  scopes: [],
  accessToken: 'token',
  refreshToken: 'refresh',
  tokenExpiresAt: '2026-07-31T00:00:00.000Z',
  profileId: '44444444-4444-4444-8444-444444444444'
}

describe('Search Console sync orchestration', () => {
  it('refreshes once and stores three independent projections for each date', async () => {
    const queryAnalytics = vi.fn(async (
      _token: string,
      _property: string,
      request: { dimensions: string[] }
    ) => ({
      rows: [{
        keys: request.dimensions,
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 5
      }],
      firstIncompleteDate: '2026-07-31',
      responseAggregationType: null,
      truncated: false
    }))
    const refreshCredential = vi.fn(async () => ({
      ...credential,
      accessToken: 'refreshed',
      tokenExpiresAt: '2026-08-01T12:00:00.000Z'
    }))
    const replaceProperty = vi.fn()
    const replacePage = vi.fn()
    const replaceQueryPage = vi.fn()
    const updateRun = vi.fn()

    const result = await syncSearchConsoleProperty({
      map,
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      triggerType: 'manual'
    }, {
      now: () => new Date('2026-08-01T00:00:00.000Z'),
      resolveCredential: vi.fn(async () => credential),
      refreshCredential,
      queryAnalytics,
      replacePropertyDate: replaceProperty,
      replacePageDate: replacePage,
      replaceQueryPageDate: replaceQueryPage,
      createRun: vi.fn(async () => 'run-1'),
      updateRun
    })

    expect(refreshCredential).toHaveBeenCalledOnce()
    expect(queryAnalytics.mock.calls.map(call => call[2].dimensions)).toEqual([
      [],
      ['page'],
      ['query', 'page']
    ])
    expect(replaceProperty).toHaveBeenCalledOnce()
    expect(replacePage).toHaveBeenCalledOnce()
    expect(replaceQueryPage).toHaveBeenCalledOnce()
    expect(replaceProperty.mock.calls[0]?.[0]).toMatchObject({
      metricDate: '2026-07-31',
      firstIncompleteDate: '2026-07-31'
    })
    expect(updateRun).toHaveBeenLastCalledWith('run-1', expect.objectContaining({
      status: 'succeeded',
      datesSucceeded: 1,
      datesFailed: 0
    }))
    expect(result.status).toBe('succeeded')
  })

  it('retries transient provider failures and preserves successful projections on partial failure', async () => {
    const attempts: Record<string, number> = {}
    const queryAnalytics = vi.fn(async (
      _token: string,
      _property: string,
      request: { dimensions: string[] }
    ) => {
      const key = request.dimensions.join(',')
      attempts[key] = (attempts[key] || 0) + 1
      if (key === 'page') throw Object.assign(new Error('provider unavailable'), { statusCode: 503 })
      if (key === 'query,page' && attempts[key] < 3) {
        throw Object.assign(new Error('rate limited'), { statusCode: 429 })
      }
      return {
        rows: [],
        firstIncompleteDate: null,
        responseAggregationType: null,
        truncated: false
      }
    })
    const replaceProperty = vi.fn()
    const replacePage = vi.fn()
    const replaceQueryPage = vi.fn()
    const updateRun = vi.fn()

    const result = await syncSearchConsoleProperty({
      map,
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      triggerType: 'manual',
      credential: { ...credential, tokenExpiresAt: '2026-08-02T00:00:00.000Z' }
    }, {
      now: () => new Date('2026-08-01T00:00:00.000Z'),
      queryAnalytics,
      replacePropertyDate: replaceProperty,
      replacePageDate: replacePage,
      replaceQueryPageDate: replaceQueryPage,
      createRun: vi.fn(async () => 'run-2'),
      updateRun,
      sleep: vi.fn(async () => {})
    })

    expect(attempts.page).toBe(3)
    expect(attempts['query,page']).toBe(3)
    expect(replaceProperty).toHaveBeenCalledOnce()
    expect(replacePage).not.toHaveBeenCalled()
    expect(replaceQueryPage).toHaveBeenCalledOnce()
    expect(updateRun).toHaveBeenLastCalledWith('run-2', expect.objectContaining({
      status: 'partial',
      datesSucceeded: 0,
      datesFailed: 1
    }))
    expect(result.status).toBe('partial')
  })

  it('resolves and refreshes a shared connection only once for multiple property maps', async () => {
    const resolveCredential = vi.fn(async () => credential)
    const refreshCredential = vi.fn(async () => ({
      ...credential,
      accessToken: 'refreshed'
    }))
    const syncProperty = vi.fn(async () => ({ status: 'succeeded' as const }))
    const maps = [
      map,
      { ...map, propertyMapId: '55555555-5555-4555-8555-555555555555', propertyUri: 'https://example.com/' }
    ]

    await syncSearchConsoleClient({
      clientId: map.clientId,
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      triggerType: 'manual'
    }, {
      now: () => new Date('2026-08-01T00:00:00.000Z'),
      listMaps: vi.fn(async () => maps),
      resolveCredential,
      refreshCredential,
      syncProperty
    })

    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(refreshCredential).toHaveBeenCalledOnce()
    expect(syncProperty).toHaveBeenCalledTimes(2)
    expect(syncProperty.mock.calls.every(call => (
      call[0].credential.accessToken === 'refreshed'
    ))).toBe(true)
  })

  it('uses a 90-day initial window and then refreshes only the trailing three days', async () => {
    const syncProperty = vi.fn(async () => ({ status: 'succeeded' as const }))
    await syncSearchConsoleClient({
      clientId: map.clientId,
      triggerType: 'scheduled'
    }, {
      now: () => new Date('2026-08-01T08:00:00.000Z'),
      listMaps: vi.fn(async () => [
        { ...map, hasSuccessfulSync: false },
        {
          ...map,
          propertyMapId: '55555555-5555-4555-8555-555555555555',
          hasSuccessfulSync: true
        }
      ]),
      resolveCredential: vi.fn(async () => ({
        ...credential,
        tokenExpiresAt: '2026-08-02T00:00:00.000Z'
      })),
      syncProperty
    })

    expect(syncProperty.mock.calls[0]?.[0]).toMatchObject({
      startDate: '2026-05-04',
      endDate: '2026-08-01'
    })
    expect(syncProperty.mock.calls[1]?.[0]).toMatchObject({
      startDate: '2026-07-30',
      endDate: '2026-08-01'
    })
  })
})
