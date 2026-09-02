import { describe, expect, it } from 'vitest'
import {
  deriveMeasurementFreshness,
  missingDateRanges
} from '~~/server/utils/measurement/freshness'

describe('measurement stream freshness', () => {
  it('reports two missing sides of a partially covered historical range', () => {
    expect(missingDateRanges(
      { startDate: '2026-08-01', endDate: '2026-08-31' },
      { startDate: '2026-08-05', endDate: '2026-08-25' }
    )).toEqual([
      { startDate: '2026-08-01', endDate: '2026-08-04' },
      { startDate: '2026-08-26', endDate: '2026-08-31' }
    ])
  })

  it('makes historical metrics unavailable while a resync is incomplete', () => {
    expect(deriveMeasurementFreshness({
      stream: 'campaign_conversions',
      lastAttemptAt: '2026-09-02T04:00:00.000Z',
      lastSuccessAt: '2026-09-02T03:00:00.000Z',
      requestedRange: { startDate: '2026-08-01', endDate: '2026-08-31' },
      coveredRange: { startDate: '2026-08-05', endDate: '2026-08-25' },
      currentJobState: 'running',
      unavailableReasonCode: 'historical_resync_pending',
      now: new Date('2026-09-02T05:00:00.000Z')
    })).toMatchObject({
      status: 'syncing',
      metricsAvailable: false,
      reason: 'Conversion totals unavailable while historical resync is pending.'
    })
  })

  it.each([
    [null, null, 'idle', 'unavailable'],
    ['2026-09-02T04:00:00.000Z', '2026-09-02T04:00:00.000Z', 'completed', 'fresh'],
    ['2026-08-29T04:00:00.000Z', '2026-08-29T04:00:00.000Z', 'completed', 'stale'],
    ['2026-09-02T04:00:00.000Z', null, 'failed', 'failed']
  ] as const)('derives independent %s freshness', (lastAttemptAt, lastSuccessAt, currentJobState, status) => {
    expect(deriveMeasurementFreshness({
      stream: 'spend',
      lastAttemptAt,
      lastSuccessAt,
      requestedRange: null,
      coveredRange: null,
      currentJobState,
      unavailableReasonCode: null,
      now: new Date('2026-09-02T05:00:00.000Z')
    }).status).toBe(status)
  })
})
