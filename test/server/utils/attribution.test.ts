import { describe, it, expect } from 'vitest'
import {
  attributeCredit,
  attributeConversions,
  isAttributionModel,
  ATTRIBUTION_MODELS,
  type Touchpoint
} from '~~/server/utils/attribution'

const DAY = 86_400_000
const t = (channel: string, day: number): Touchpoint => ({ channel, timestamp: day * DAY })

// A 3-touch journey: Paid Social (day 0) → Organic Search (day 3) → Paid Search (day 6, conversion)
const journey3: Touchpoint[] = [t('Paid Social', 0), t('Organic Search', 3), t('Paid Search', 6)]

function sum(credit: Record<string, number>): number {
  return Object.values(credit).reduce((a, b) => a + b, 0)
}

describe('attributeCredit — credit always sums to 1', () => {
  for (const model of ATTRIBUTION_MODELS) {
    it(`${model} sums to 1 on a 3-touch journey`, () => {
      expect(sum(attributeCredit(journey3, model))).toBeCloseTo(1)
    })
  }
})

describe('attributeCredit — per-model behaviour', () => {
  it('last-click gives 100% to the converting (last) touch', () => {
    expect(attributeCredit(journey3, 'last')).toEqual({ 'Paid Search': 1 })
  })

  it('first-click gives 100% to the first touch', () => {
    expect(attributeCredit(journey3, 'first')).toEqual({ 'Paid Social': 1 })
  })

  it('linear splits evenly across touches', () => {
    const c = attributeCredit(journey3, 'linear')
    expect(c['Paid Social']).toBeCloseTo(1 / 3)
    expect(c['Organic Search']).toBeCloseTo(1 / 3)
    expect(c['Paid Search']).toBeCloseTo(1 / 3)
  })

  it('position-based gives 40/20/40 to first/middle/last', () => {
    const c = attributeCredit(journey3, 'position')
    expect(c['Paid Social']).toBeCloseTo(0.4)
    expect(c['Organic Search']).toBeCloseTo(0.2)
    expect(c['Paid Search']).toBeCloseTo(0.4)
  })

  it('position-based splits 50/50 for a two-touch journey', () => {
    const c = attributeCredit([t('A', 0), t('B', 1)], 'position')
    expect(c).toEqual({ A: 0.5, B: 0.5 })
  })

  it('time-decay weights touches nearer the conversion more heavily', () => {
    const c = attributeCredit(journey3, 'time_decay', { halfLifeDays: 7 })
    // last touch (conversion-day) > middle > first
    expect(c['Paid Search']).toBeGreaterThan(c['Organic Search'])
    expect(c['Organic Search']).toBeGreaterThan(c['Paid Social'])
    expect(sum(c)).toBeCloseTo(1)
  })

  it('different models re-weight channel credit on the SAME multi-touch journey', () => {
    const last = attributeCredit(journey3, 'last')
    const first = attributeCredit(journey3, 'first')
    const linear = attributeCredit(journey3, 'linear')
    expect(last).not.toEqual(first)
    expect(last).not.toEqual(linear)
  })
})

describe('attributeCredit — edge cases', () => {
  it('returns {} for an empty journey', () => {
    expect(attributeCredit([], 'linear')).toEqual({})
  })

  it('single-touch journey is 100% under every model (correct, not a bug)', () => {
    for (const model of ATTRIBUTION_MODELS) {
      expect(attributeCredit([t('Paid Search', 2)], model)).toEqual({ 'Paid Search': 1 })
    }
  })

  it('sorts touches by timestamp before applying the model', () => {
    // supplied out of order; last-click must still pick the latest timestamp
    expect(attributeCredit([t('Late', 9), t('Early', 1)], 'last')).toEqual({ Late: 1 })
    expect(attributeCredit([t('Late', 9), t('Early', 1)], 'first')).toEqual({ Early: 1 })
  })

  it('merges repeated channels within a journey', () => {
    const c = attributeCredit([t('Paid Search', 0), t('Paid Search', 1)], 'linear')
    expect(c).toEqual({ 'Paid Search': 1 })
  })
})

describe('attributeConversions', () => {
  it('aggregates credit across journeys (totals ≈ conversion count)', () => {
    const totals = attributeConversions([journey3, [t('Paid Search', 0)]], 'last')
    // journey3 last = Paid Search; second journey = Paid Search → 2.0
    expect(totals['Paid Search']).toBeCloseTo(2)
    expect(sum(totals)).toBeCloseTo(2)
  })
})

describe('isAttributionModel', () => {
  it('validates model strings', () => {
    expect(isAttributionModel('position')).toBe(true)
    expect(isAttributionModel('markov')).toBe(false)
    expect(isAttributionModel(42)).toBe(false)
  })
})
