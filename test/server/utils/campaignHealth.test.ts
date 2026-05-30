import { describe, it, expect } from 'vitest'
import { scoreCampaignHealth, type HealthInput } from '~~/server/utils/campaignHealth'

const base: HealthInput = {
  platform: 'meta', costPerResult: 20, resultCount: 50, spend: 1000,
  ctr: null, frequency: null, qualityRanking: null, engagementRateRanking: null,
  conversionRateRanking: null, impressionShare: null,
  target: { targetCostPerResult: 25, targetCtr: null, maxFrequency: null },
}

describe('scoreCampaignHealth', () => {
  it('returns no-target when the client has no matching target', () => {
    const r = scoreCampaignHealth({ ...base, target: null })
    expect(r.verdict).toBe('no-target')
    expect(r.score).toBeNull()
  })
  it('cuts a campaign burning spend with zero results', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: null, resultCount: 0, spend: 200 })
    expect(r.verdict).toBe('cut')
    expect(r.reasons[0]).toMatch(/zero results/i)
  })
  it('flags insufficient data under 8 results', () => {
    const r = scoreCampaignHealth({ ...base, resultCount: 4, costPerResult: 20, spend: 80 })
    expect(r.verdict).toBe('insufficient')
    expect(r.score).toBeNull()
  })
  it('scales an efficient, healthy, high-volume campaign', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 15, resultCount: 60, frequency: 1.8 })
    expect(r.verdict).toBe('scale')
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.reasons[0]).toMatch(/cost\/result/i)
  })
  it('cuts an over-target, fatigued campaign', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 60, resultCount: 40, frequency: 5, engagementRateRanking: 'BELOW_AVERAGE_35' })
    expect(r.verdict).toBe('cut')
    expect(r.score).toBeLessThanOrEqual(35)
  })
  it('holds a near-target campaign', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 27, resultCount: 40 })
    expect(r.verdict).toBe('hold')
  })
  it('never upgrades to scale on medium confidence', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 12, resultCount: 10, frequency: 1.5 })
    expect(r.verdict).toBe('hold') // would be scale at high confidence
  })
})
