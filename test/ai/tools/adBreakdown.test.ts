import { describe, expect, it, vi } from 'vitest'
import { getAdBreakdown, type AdBreakdownDeps } from '~~/server/utils/ai/tools/adBreakdown'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as ToolContext

describe('get_ad_breakdown', () => {
  it('returns ad fatigue metrics, lead outcomes, creative links and explicit partial coverage', async () => {
    const deps: AdBreakdownDeps = {
      now: () => new Date('2026-08-19T12:00:00Z'),
      fetch: vi.fn().mockResolvedValue({
        targetCount: 2,
        available: true,
        records: [
          { adId: 'ad1', adName: 'EOFY', campaignId: 'c1', campaignName: 'Campaign', clientName: 'Acme', platform: 'meta', creativeId: 'cr1', creativeName: 'EOFY tile', spend: 121.59, impressions: 48210, clicks: 1430, conversions: 12, leadCount: 9, reach: 13029, frequency: 3.7, firstServedDate: '2026-06-05', lastServedDate: '2026-08-18', lastSyncedAt: '2026-08-18T08:00:00Z' },
          { adId: 'ad2', adName: 'Search', campaignId: 'c2', campaignName: 'Search', clientName: 'Acme', platform: 'google', creativeId: null, creativeName: null, spend: 80, impressions: 1000, clicks: 50, conversions: 4, leadCount: 3, reach: null, frequency: null, firstServedDate: '2026-08-01', lastServedDate: '2026-08-18', lastSyncedAt: '2026-08-18T08:10:00Z' },
        ],
      }),
    }
    const data = (await getAdBreakdown({ campaignId: 'c1', sortBy: 'frequency' }, ctx, deps) as any).data
    expect(data.ads[0]).toMatchObject({ adId: 'ad1', frequency: 3.7, leadCount: 9, creativeId: 'cr1', cpc: 0.09, conversions: null })
    expect(data.ads[0].fatigueSignals).toContain('high_frequency')
    expect(data.dataStatus).toBe('partial')
    expect(data.coverage).toEqual({ expected: 2, withData: 1 })
    expect(data.conversionMetric).toMatchObject({ dataStatus: 'unavailable', definition: 'suppressed_pending_historical_resync' })
    expect(data).toMatchObject({
      lastSyncedAt: '2026-08-18T08:10:00Z',
      oldestSyncedAt: '2026-08-18T08:00:00Z',
      staleRowCount: 0,
      stalenessThresholdHours: 48,
    })
  })

  it('reports configured but empty ad data as partial instead of populated', async () => {
    const deps: AdBreakdownDeps = {
      now: () => new Date('2026-08-19T12:00:00Z'),
      fetch: vi.fn().mockResolvedValue({ targetCount: 1, available: true, records: [] }),
    }
    const data = (await getAdBreakdown({ campaignId: 'c1', sortBy: 'frequency' }, ctx, deps) as any).data
    expect(data.dataStatus).toBe('partial')
    expect(data.coverage).toEqual({ expected: 0, withData: 0 })
  })
})
