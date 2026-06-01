import { describe, it, expect } from 'vitest'
import {
  computeEngagement,
  computeIntent,
  computeFit,
  computeRecency,
  gradeFor,
  scoreTarget,
  type ScoreSignals,
} from '~~/server/utils/crm/scoring'

const NOW = new Date('2026-06-01T00:00:00.000Z')
function daysAgo(n: number) { return new Date(NOW.getTime() - n * 86400000).toISOString() }

const EMPTY: ScoreSignals = {
  activityCount: 0, openOpportunities: 0, lastActivityAt: null,
  hasEmail: false, hasPhone: false, companyLinked: false, hasJobTitle: false,
}

describe('computeEngagement', () => {
  it('scales with activity count and caps at 30', () => {
    expect(computeEngagement({ ...EMPTY, activityCount: 0 })).toBe(0)
    expect(computeEngagement({ ...EMPTY, activityCount: 3 })).toBe(15)
    expect(computeEngagement({ ...EMPTY, activityCount: 6 })).toBe(30)
    expect(computeEngagement({ ...EMPTY, activityCount: 50 })).toBe(30)
  })
})

describe('computeIntent', () => {
  it('rewards open opportunities and caps at 30', () => {
    expect(computeIntent({ ...EMPTY, openOpportunities: 0 })).toBe(0)
    expect(computeIntent({ ...EMPTY, openOpportunities: 1 })).toBe(15)
    expect(computeIntent({ ...EMPTY, openOpportunities: 2 })).toBe(30)
    expect(computeIntent({ ...EMPTY, openOpportunities: 5 })).toBe(30)
  })
})

describe('computeFit', () => {
  it('adds 5 per present fit signal, capped at 20', () => {
    expect(computeFit(EMPTY)).toBe(0)
    expect(computeFit({ ...EMPTY, hasEmail: true, hasPhone: true })).toBe(10)
    expect(computeFit({ ...EMPTY, hasEmail: true, hasPhone: true, companyLinked: true, hasJobTitle: true })).toBe(20)
  })
})

describe('computeRecency', () => {
  it('decays in steps by days since last activity', () => {
    expect(computeRecency(null, NOW)).toBe(0)
    expect(computeRecency(daysAgo(3), NOW)).toBe(20)
    expect(computeRecency(daysAgo(7), NOW)).toBe(20)
    expect(computeRecency(daysAgo(20), NOW)).toBe(14)
    expect(computeRecency(daysAgo(60), NOW)).toBe(7)
    expect(computeRecency(daysAgo(200), NOW)).toBe(2)
  })
})

describe('gradeFor', () => {
  it('maps totals to Hot/Warm/Cold at the boundaries', () => {
    expect(gradeFor(70)).toBe('Hot')
    expect(gradeFor(69)).toBe('Warm')
    expect(gradeFor(40)).toBe('Warm')
    expect(gradeFor(39)).toBe('Cold')
    expect(gradeFor(0)).toBe('Cold')
  })
})

describe('scoreTarget', () => {
  it('combines components into a total and grade', () => {
    const r = scoreTarget(
      { activityCount: 6, openOpportunities: 2, lastActivityAt: daysAgo(2),
        hasEmail: true, hasPhone: true, companyLinked: true, hasJobTitle: true },
      NOW,
    )
    expect(r).toMatchObject({ engagement: 30, intent: 30, fit: 20, recency: 20, total: 100, grade: 'Hot' })
  })

  it('an untouched contact scores 0 / Cold', () => {
    expect(scoreTarget(EMPTY, NOW)).toMatchObject({ total: 0, grade: 'Cold' })
  })
})
