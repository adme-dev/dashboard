import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deriveGoogleAdsCallSyncHealth,
  getGoogleAdsCallAnalytics
} from '~~/server/utils/googleAdsCallAnalytics'

const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryRows }))

describe('Google Ads call analytics health', () => {
  beforeEach(() => queryRows.mockReset())
  afterEach(() => vi.useRealTimers())

  it('distinguishes a valid empty provider response from verified call tracking', () => {
    expect(deriveGoogleAdsCallSyncHealth({
      lastAttemptAt: '2026-09-02T04:00:00.000Z',
      lastSuccessAt: '2026-09-02T04:00:00.000Z',
      lastRowCount: 0,
      lastError: null,
      now: new Date('2026-09-02T05:00:00.000Z')
    })).toEqual({
      status: 'success_empty',
      outcome: 'sync successful; no calls returned',
      verifiedCallTracking: false
    })
  })

  it.each([
    [{ lastAttemptAt: null, lastSuccessAt: null, lastRowCount: 0, lastError: null }, 'dormant'],
    [{ lastAttemptAt: '2026-09-02T04:30:00.000Z', lastSuccessAt: null, lastRowCount: 0, lastError: null }, 'pending'],
    [{ lastAttemptAt: '2026-09-02T04:30:00.000Z', lastSuccessAt: '2026-09-02T04:30:00.000Z', lastRowCount: 2, lastError: null }, 'healthy'],
    [{ lastAttemptAt: '2026-09-02T04:30:00.000Z', lastSuccessAt: '2026-09-02T04:00:00.000Z', lastRowCount: 2, lastError: 'provider failed' }, 'error'],
    [{ lastAttemptAt: '2026-08-30T04:30:00.000Z', lastSuccessAt: '2026-08-30T04:30:00.000Z', lastRowCount: 2, lastError: null }, 'stale']
  ] as const)('derives the %s state without inferring calls', (row, status) => {
    expect(deriveGoogleAdsCallSyncHealth({
      ...row,
      now: new Date('2026-09-02T05:00:00.000Z')
    }).status).toBe(status)
  })

  it.each([
    ['2026-09-02T05:00:00.000Z', 'healthy', true],
    ['2026-09-04T04:00:00.001Z', 'stale', false]
  ] as const)('reports telephone layers separately with %s sync freshness', async (now, status, verifiedCallTracking) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
    queryRows
      .mockResolvedValueOnce([{
        total_calls: '5', answered_calls: '3', missed_calls: '2', unknown_calls: '0',
        duration_available_calls: '3', total_duration_seconds: '180',
        average_duration_seconds: '60', longest_duration_seconds: '100',
        last_synced_at: '2026-09-02T04:00:00.000Z'
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        last_attempt_at: '2026-09-02T04:00:00.000Z',
        last_success_at: '2026-09-02T04:00:00.000Z',
        last_row_count: '5', last_error: null,
        requested_start_date: '2026-09-01', requested_end_date: '2026-09-02',
        covered_start_date: '2026-09-01', covered_end_date: '2026-09-02',
        current_job_state: 'completed'
      }])
      .mockResolvedValueOnce([{
        website_phone_clicks: '12', qualified_calls: '2',
        last_website_evidence_at: '2026-09-02T03:30:00.000Z'
      }])

    const result = await getGoogleAdsCallAnalytics({
      clientId: 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0',
      startDate: '2026-09-01',
      endDate: '2026-09-02'
    })

    expect(result.layers).toEqual(expect.objectContaining({
      websitePhoneClicks: 12,
      googleHostedCallInteractions: 5,
      connectedCalls: 3,
      qualifiedCalls: 2
    }))
    expect(result.health).toMatchObject({
      status, verifiedCallTracking,
      requestedRange: { startDate: '2026-09-01', endDate: '2026-09-02' }
    })
  })
})
