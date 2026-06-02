import { describe, it, expect } from 'vitest'
import {
  engagementHealth,
  supportHealth,
  relationshipHealth,
  contractHealth,
  gradeForHealth,
  scoreHealth,
  type HealthSignals,
} from '~~/server/utils/crm/healthScoring'

const now = new Date('2026-06-02T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()
const daysAhead = (d: number) => new Date(now.getTime() + d * 86400000).toISOString()

describe('engagementHealth (0–35, recency of any touch)', () => {
  it('full marks within two weeks', () => expect(engagementHealth(daysAgo(5), now)).toBe(35))
  it('steps down over time', () => {
    expect(engagementHealth(daysAgo(20), now)).toBe(25)
    expect(engagementHealth(daysAgo(45), now)).toBe(15)
    expect(engagementHealth(daysAgo(80), now)).toBe(8)
    expect(engagementHealth(daysAgo(200), now)).toBe(0)
  })
  it('is zero with no engagement on record', () => expect(engagementHealth(null, now)).toBe(0))
})

describe('supportHealth (0–20, open overdue tasks drag it down)', () => {
  it('full when nothing is overdue', () => expect(supportHealth(0)).toBe(20))
  it('drops 5 per overdue task, floored at 0', () => {
    expect(supportHealth(1)).toBe(15)
    expect(supportHealth(4)).toBe(0)
    expect(supportHealth(10)).toBe(0)
  })
})

describe('relationshipHealth (0–20, recent two-way comms)', () => {
  it('5 per comm in the window, saturating at 4', () => {
    expect(relationshipHealth(0)).toBe(0)
    expect(relationshipHealth(2)).toBe(10)
    expect(relationshipHealth(4)).toBe(20)
    expect(relationshipHealth(9)).toBe(20)
  })
})

describe('contractHealth (0–25, renewal proximity risk)', () => {
  it('neutral when no contract is on file', () => expect(contractHealth(null)).toBe(15))
  it('healthy when renewal is far off', () => expect(contractHealth(120)).toBe(25))
  it('declines as expiry approaches', () => {
    expect(contractHealth(60)).toBe(18)
    expect(contractHealth(20)).toBe(8)
    expect(contractHealth(3)).toBe(0)
  })
  it('expired contract scores zero', () => expect(contractHealth(-10)).toBe(0))
})

describe('gradeForHealth', () => {
  it('maps score bands to the shared grade column', () => {
    expect(gradeForHealth(85)).toBe('Hot')   // Healthy
    expect(gradeForHealth(55)).toBe('Warm')   // At risk
    expect(gradeForHealth(20)).toBe('Cold')   // Critical
  })
})

describe('scoreHealth', () => {
  it('a healthy customer scores high', () => {
    const s: HealthSignals = { lastEngagementAt: daysAgo(3), openOverdueTasks: 0, commsLast30: 5, contractDaysToExpiry: 200 }
    const r = scoreHealth(s, now)
    expect(r.total).toBe(100)
    expect(r.grade).toBe('Hot')
  })
  it('declining engagement + an expiring contract → low health / churn risk', () => {
    const s: HealthSignals = { lastEngagementAt: daysAgo(120), openOverdueTasks: 3, commsLast30: 0, contractDaysToExpiry: 5 }
    const r = scoreHealth(s, now)
    expect(r.total).toBeLessThan(40)
    expect(r.grade).toBe('Cold')
  })
  it('exposes each component and never exceeds 100', () => {
    const s: HealthSignals = { lastEngagementAt: daysAgo(1), openOverdueTasks: 0, commsLast30: 10, contractDaysToExpiry: 365 }
    const r = scoreHealth(s, now)
    expect(r.engagement + r.support + r.relationship + r.contract).toBe(r.total)
    expect(r.total).toBeLessThanOrEqual(100)
  })
})
