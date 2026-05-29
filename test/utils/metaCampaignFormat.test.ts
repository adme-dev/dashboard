import { describe, it, expect } from 'vitest'
import { metaBidStrategyLabel, budgetTypeLabel, endDateInfo } from '~/app/utils/metaCampaignFormat'

describe('metaBidStrategyLabel', () => {
  it('maps known Meta enums to friendly labels', () => {
    expect(metaBidStrategyLabel('LOWEST_COST_WITHOUT_CAP')).toBe('Highest volume')
    expect(metaBidStrategyLabel('COST_CAP')).toBe('Cost cap')
    expect(metaBidStrategyLabel('LOWEST_COST_WITH_BID_CAP')).toBe('Bid cap')
    expect(metaBidStrategyLabel('LOWEST_COST_WITH_MIN_ROAS')).toBe('Min ROAS')
  })
  it('title-cases unknown enums and handles null', () => {
    expect(metaBidStrategyLabel('SOME_NEW_THING')).toBe('Some New Thing')
    expect(metaBidStrategyLabel(null)).toBe('-')
  })
})

describe('budgetTypeLabel', () => {
  it('labels daily/lifetime and falls back to dash', () => {
    expect(budgetTypeLabel('daily')).toBe('Daily')
    expect(budgetTypeLabel('lifetime')).toBe('Lifetime')
    expect(budgetTypeLabel(null)).toBe('-')
  })
})

describe('endDateInfo', () => {
  const today = new Date('2026-05-29T00:00:00Z')
  it('returns null state for missing date', () => {
    expect(endDateInfo(null, today)).toEqual({ label: '-', hint: null, tone: 'muted' })
  })
  it('flags imminent end with a warning hint', () => {
    const r = endDateInfo('2026-05-31', today)
    expect(r.hint).toBe('2d left')
    expect(r.tone).toBe('warning')
  })
  it('marks past dates as ended', () => {
    const r = endDateInfo('2026-05-20', today)
    expect(r.hint).toBe('Ended')
    expect(r.tone).toBe('error')
  })
  it('no hint for far-future end dates', () => {
    const r = endDateInfo('2026-12-31', today)
    expect(r.hint).toBeNull()
    expect(r.tone).toBe('muted')
  })
})
