import { describe, expect, it, vi } from 'vitest'
import { adBreakdownTool, getAdBreakdown, type AdBreakdownDeps } from '~~/server/utils/ai/tools/adBreakdown'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any } as ToolContext

describe('get_ad_breakdown', () => {
  it('marks provider-authored policy text as untrusted', () => {
    expect(adBreakdownTool.returnsUntrusted).toBe(true)
  })

  it('returns ad fatigue metrics, lead outcomes, creative links and explicit partial coverage', async () => {
    const deps: AdBreakdownDeps = {
      now: () => new Date('2026-08-19T06:00:00Z'),
  loadCoverageDeltas: async () => null,
      fetch: vi.fn().mockResolvedValue({
        targetCount: 2,
        available: true,
        records: [
          { adId: 'ad1', adName: 'EOFY', campaignId: 'c1', campaignName: 'Campaign', clientName: 'Acme', platform: 'meta', creativeId: 'cr1', creativeName: 'EOFY tile', spend: 121.59, impressions: 48210, clicks: 1430, conversions: 12, leadCount: 9, reach: 13029, frequency: 3.7, firstServedDate: '2026-06-05', lastServedDate: '2026-08-18', lastSyncedAt: '2026-08-18T08:00:00Z' },
          { adId: 'ad2', adName: 'Search', campaignId: 'c2', campaignName: 'Search', clientName: 'Acme', platform: 'google', creativeId: null, creativeName: null, spend: 80, impressions: 1000, clicks: 50, conversions: 4, leadCount: 3, reach: null, frequency: null, firstServedDate: '2026-08-01', lastServedDate: '2026-08-18', lastSyncedAt: '2026-08-18T08:10:00Z' },
        ],
      }),
      leadAttribution: vi.fn().mockResolvedValue({ totalSubmissions: 12, adAttributed: 12 }),
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
      freshness: 'fresh',
    })
    expect(data.leadAttribution).toMatchObject({ coveragePct: 100, fatigueSignalPolicy: 'spend_without_leads_enabled' })
  })

  it('reports configured but empty ad data as partial instead of populated', async () => {
    const deps: AdBreakdownDeps = {
      now: () => new Date('2026-08-19T06:00:00Z'),
  loadCoverageDeltas: async () => null,
      fetch: vi.fn().mockResolvedValue({ targetCount: 1, available: true, records: [] }),
    }
    const data = (await getAdBreakdown({ campaignId: 'c1', sortBy: 'frequency' }, ctx, deps) as any).data
    expect(data.dataStatus).toBe('partial')
    expect(data.coverage).toEqual({ expected: 0, withData: 0 })
  })

  it('projects independent approval, learning, and Meta ad-set metric evidence', async () => {
    const deps: AdBreakdownDeps = {
      now: () => new Date('2026-08-24T12:00:00Z'),
      loadCoverageDeltas: async () => null,
      fetch: vi.fn().mockResolvedValue({
        targetCount: 1,
        available: true,
        records: [{
          adId: 'ad1', adName: 'Offer', campaignId: 'c1', campaignName: 'Campaign', clientName: 'Acme', platform: 'meta',
          creativeId: 'cr1', creativeName: 'Offer', spend: 100, impressions: 1000, clicks: 20, conversions: 1, leadCount: 2,
          reach: 400, frequency: 4.2, cpm: 100, firstServedDate: '2026-08-01', lastServedDate: '2026-08-24',
          lastSyncedAt: '2026-08-24T10:00:00Z', adSetId: 'set1', adSetName: 'Retargeting',
          adSetMetricsAsOf: '2026-08-24T09:00:00Z', adSetMetricsUnavailableReason: null,
          approvalStatus: 'DISAPPROVED', providerApprovalStatus: 'DISAPPROVED', approvalReviewStatus: null,
          policyIssues: [{ code: '1487007', topic: 'POLICY', summary: 'Vehicle pricing claim', message: null, type: 'POLICY', level: 'AD' }],
          approvalAsOf: '2026-08-24T08:00:00Z', approvalUnavailableReason: null,
          learningStage: 'LEARNING_LIMITED', providerLearningStage: 'LEARNING_LIMITED',
          learningStageAsOf: '2026-08-24T07:00:00Z', learningStageUnavailableReason: null,
        }],
      }),
      leadAttribution: vi.fn().mockResolvedValue({ totalSubmissions: 2, adAttributed: 2 }),
    }
    const data = (await getAdBreakdown({ campaignId: 'c1', sortBy: 'frequency' }, ctx, deps) as any).data
    expect(data.ads[0]).toMatchObject({
      approvalStatus: 'DISAPPROVED',
      approvalDataStatus: 'fresh',
      learningStage: 'LEARNING_LIMITED',
      learningStageDataStatus: 'fresh',
      frequency: 4.2,
      cpm: 100,
      adSetMetricsDataStatus: 'fresh',
      metricsAsOf: '2026-08-24T10:00:00Z',
    })
    expect(data.ads[0].policyIssues[0].summary).toBe('Vehicle pricing claim')
  })

  it('suppresses spend_without_leads while lead attribution coverage is unknown', async () => {
    const deps: AdBreakdownDeps = {
      now: () => new Date('2026-08-19T06:00:00Z'),
  loadCoverageDeltas: async () => null,
      fetch: vi.fn().mockResolvedValue({
        targetCount: 1,
        available: true,
        records: [{
          adId: 'ad1', adName: 'Lead ad', campaignId: 'c1', campaignName: 'Lead campaign', clientName: 'Acme',
          platform: 'meta', creativeId: 'cr1', creativeName: 'Lead creative', spend: 100, impressions: 1000,
          clicks: 30, conversions: 0, leadCount: 0, reach: 800, frequency: 1.25, firstServedDate: '2026-08-01',
          lastServedDate: '2026-08-18', lastSyncedAt: '2026-08-19T08:00:00Z',
        }],
      }),
      leadAttribution: vi.fn().mockResolvedValue({ totalSubmissions: 0, adAttributed: 0 }),
    }

    const data = (await getAdBreakdown({ campaignId: 'c1', sortBy: 'frequency' }, ctx, deps) as any).data
    expect(data.ads[0].fatigueSignals).not.toContain('spend_without_leads')
    expect(data.leadAttribution).toMatchObject({
      coveragePct: null,
      fatigueSignalPolicy: 'spend_without_leads_suppressed_until_attribution_coverage_exists',
    })
  })

  describe('P-02 halt', () => {
    it('halts with no figures before the newest sync reaches 24h old', async () => {
      const deps: AdBreakdownDeps = {
        now: () => new Date('2026-08-19T10:11:00Z'),
        loadCoverageDeltas: async () => null,
        fetch: vi.fn().mockResolvedValue({
          targetCount: 1,
          available: true,
          records: [
            { adId: 'ad1', adName: 'EOFY', campaignId: 'c1', campaignName: 'Campaign', clientName: 'Acme', platform: 'meta', creativeId: 'cr1', creativeName: 'EOFY tile', spend: 121.59, impressions: 48210, clicks: 1430, conversions: 12, leadCount: 9, reach: 13029, frequency: 3.7, firstServedDate: '2026-06-05', lastServedDate: '2026-08-18', lastSyncedAt: '2026-08-18T08:10:00Z' },
          ],
        }),
        leadAttribution: vi.fn().mockResolvedValue({ totalSubmissions: 0, adAttributed: 0 }),
      }
      const res = await getAdBreakdown({ sortBy: 'spend', refresh: false, comparePrevious: false, limit: 20, clientName: 'Acme' } as any, ctx, deps)
      expect(res.ok).toBe(true)
      const d = (res as any).data
      expect(d.halted).toBe(true)
      expect(d.haltReason).toBe('stale_sync')
      expect(d.ads).toEqual([])
      expect(JSON.stringify(d)).not.toContain('121.59')
    })
  })
})
