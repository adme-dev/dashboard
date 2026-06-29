import { describe, it, expect } from 'vitest'
import { rollupSpendByClient, canonicalPlatform, paceStatus } from '~/utils/spendRollup'

describe('canonicalPlatform', () => {
  it('maps known platform strings', () => {
    expect(canonicalPlatform('meta')).toBe('meta')
    expect(canonicalPlatform('facebook')).toBe('meta')
    expect(canonicalPlatform('google_ads')).toBe('google')
    expect(canonicalPlatform('TikTok')).toBe('tiktok')
    expect(canonicalPlatform(null)).toBe('other')
  })
})

describe('rollupSpendByClient', () => {
  it('rolls a client\'s platforms into one row, summing spend/budget, sorted by spend desc', () => {
    const rows = rollupSpendByClient([
      { clientName: 'Geelong Kia', platform: 'meta', spend: 4000, budget: 5000, owner: { id: 'u1', name: 'Alicia' } },
      { clientName: 'Geelong Kia', platform: 'google_ads', spend: 2000, budget: 2000, owner: null },
      { clientName: 'Ballarat Toyota', platform: 'google_ads', spend: 1000, budget: 4000, owner: null },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].client).toBe('Geelong Kia') // higher spend first
    expect(rows[0].spend).toBe(6000)
    expect(rows[0].budget).toBe(7000)
    expect(rows[0].platforms).toEqual(['meta', 'google'])
    expect(rows[0].owner).toEqual({ id: 'u1', name: 'Alicia' })
    expect(rows[0].pct).toBeCloseTo(85.7, 1)
    expect(rows[1].client).toBe('Ballarat Toyota')
  })

  it('labels missing client names and tolerates empty input', () => {
    expect(rollupSpendByClient([])).toEqual([])
    expect(rollupSpendByClient(null)).toEqual([])
    expect(rollupSpendByClient([{ platform: 'meta', spend: 10 }])[0].client).toBe('Unattributed')
  })

  it('pct is 0 when there is no budget', () => {
    const [r] = rollupSpendByClient([{ clientName: 'X', platform: 'meta', spend: 100, budget: 0 }])
    expect(r.pct).toBe(0)
  })
})

describe('paceStatus', () => {
  it('classifies on-track / over / under against linear pace', () => {
    // half the month gone, spent half the budget → ~100% pace → on track
    expect(paceStatus(500, 1000, 0.5).status).toBe('on_track')
    // spent nearly all budget at half month → way over
    expect(paceStatus(950, 1000, 0.5).status).toBe('over')
    // spent very little at half month → under
    expect(paceStatus(100, 1000, 0.5).status).toBe('under')
    // no budget → no_budget, never NaN
    expect(paceStatus(100, 0, 0.5)).toEqual({ status: 'no_budget', pacing: 0 })
  })
})
