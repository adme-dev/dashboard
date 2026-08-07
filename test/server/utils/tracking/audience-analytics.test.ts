import { describe, expect, it } from 'vitest'
import {
  buildAudienceGrounding,
  deriveAudienceOpportunities,
  deriveAudienceSiteStatus,
  parseAudienceRange,
  periodDelta,
  safeRate,
  zeroFillAudienceSeries
} from '../../../../server/utils/tracking/audience-analytics'
import type {
  AudienceBreakdownRow,
  AudienceKpis,
  AudienceOpportunity,
  AudienceRange
} from '../../../../app/types/audience-analytics'

const fixedNow = () => new Date('2026-08-01T12:00:00.000Z')

const range: AudienceRange = {
  fromDate: '2026-07-30',
  toDate: '2026-08-01',
  previousFromDate: '2026-07-27',
  previousToDate: '2026-07-29',
  days: 3
}

const kpis: AudienceKpis = {
  visitors: 100,
  sessions: 120,
  pageViews: 250,
  engagedSessions: 72,
  engagementRate: 60,
  repeatVisitors: 20,
  leadActions: 12,
  confirmedLeads: 8,
  visitorToLeadRate: 8,
  attributionCoverage: 75
}

describe('parseAudienceRange', () => {
  it('defaults to thirty inclusive days and derives the equal preceding period', () => {
    expect(parseAudienceRange({}, fixedNow)).toEqual({
      fromDate: '2026-07-03',
      toDate: '2026-08-01',
      previousFromDate: '2026-06-03',
      previousToDate: '2026-07-02',
      days: 30
    })
  })

  it('preserves a valid explicit inclusive range', () => {
    expect(parseAudienceRange({ from: '2026-07-26', to: '2026-08-01' }, fixedNow)).toEqual({
      fromDate: '2026-07-26',
      toDate: '2026-08-01',
      previousFromDate: '2026-07-19',
      previousToDate: '2026-07-25',
      days: 7
    })
  })

  it('rejects invalid, reversed, and longer-than-ninety-day ranges', () => {
    expect(() => parseAudienceRange({ from: 'not-a-date', to: '2026-08-01' }, fixedNow))
      .toThrowError('Invalid from/to date')
    expect(() => parseAudienceRange({ from: '2026-08-02', to: '2026-08-01' }, fixedNow))
      .toThrowError('from must be <= to')
    expect(() => parseAudienceRange({ from: '2026-05-03', to: '2026-08-01' }, fixedNow))
      .toThrowError('Range too large (max 90 days)')
  })
})

describe('deriveAudienceSiteStatus', () => {
  it('classifies receiving, stale, silent, never-received, and inactive sites', () => {
    expect(deriveAudienceSiteStatus(true, '2026-08-01T01:00:00.000Z', fixedNow)).toBe('receiving')
    expect(deriveAudienceSiteStatus(true, '2026-07-30T12:00:00.000Z', fixedNow)).toBe('stale')
    expect(deriveAudienceSiteStatus(true, '2026-07-24T11:59:59.000Z', fixedNow)).toBe('no_recent_data')
    expect(deriveAudienceSiteStatus(true, null, fixedNow)).toBe('never_received')
    expect(deriveAudienceSiteStatus(false, '2026-08-01T11:00:00.000Z', fixedNow)).toBe('inactive')
  })
})

describe('audience rate helpers', () => {
  it('calculates one-decimal rates without allowing invalid denominators', () => {
    expect(safeRate(1, 3)).toBe(33.3)
    expect(safeRate(3, 0)).toBe(0)
    expect(safeRate(-1, 10)).toBe(0)
  })

  it('returns a percentage delta only when the previous value is meaningful', () => {
    expect(periodDelta(120, 100)).toBe(20)
    expect(periodDelta(80, 100)).toBe(-20)
    expect(periodDelta(0, 0)).toBe(0)
    expect(periodDelta(4, 0)).toBeNull()
  })
})

describe('zeroFillAudienceSeries', () => {
  it('fills missing days with zeros and stable day indexes', () => {
    expect(zeroFillAudienceSeries([
      {
        day: '2026-07-30',
        visitors: 4,
        sessions: 5,
        engagedSessions: 3,
        leadActions: 1,
        confirmedLeads: 1
      },
      {
        day: '2026-08-01',
        visitors: 8,
        sessions: 10,
        engagedSessions: 7,
        leadActions: 2,
        confirmedLeads: 1
      }
    ], '2026-07-30', '2026-08-01')).toEqual([
      {
        day: '2026-07-30',
        dayIndex: 0,
        visitors: 4,
        sessions: 5,
        engagedSessions: 3,
        leadActions: 1,
        confirmedLeads: 1
      },
      {
        day: '2026-07-31',
        dayIndex: 1,
        visitors: 0,
        sessions: 0,
        engagedSessions: 0,
        leadActions: 0,
        confirmedLeads: 0
      },
      {
        day: '2026-08-01',
        dayIndex: 2,
        visitors: 8,
        sessions: 10,
        engagedSessions: 7,
        leadActions: 2,
        confirmedLeads: 1
      }
    ])
  })
})

describe('deriveAudienceOpportunities', () => {
  it('publishes opportunities when evidence clears the declared sample gates', () => {
    const opportunities = deriveAudienceOpportunities({
      sessions: 100,
      highIntentNonConverters: 14,
      repeatNonConverters: 9,
      multiInterestVisitors: 7,
      paidSessions: 40,
      paidEngagementRate: 30,
      baselineEngagementRate: 52,
      organicSessions: 30,
      organicEngagementRate: 68,
      organicBaselineEngagementRate: 50,
      strongOrganicPages: 2,
      leadActions: 10,
      previousLeadActions: 5,
      confirmedLeads: 2,
      previousConfirmedLeads: 4,
      divergentClients: 1
    })

    expect(opportunities).toHaveLength(6)
    expect(opportunities.map(item => item.status)).toEqual([
      'opportunity',
      'opportunity',
      'opportunity',
      'opportunity',
      'opportunity',
      'opportunity'
    ])
    expect(opportunities.find(item => item.code === 'weak_paid_engagement')?.evidence)
      .toMatchObject({ paidSessions: 40, engagementGapPoints: 22 })
    expect(opportunities.find(item => item.code === 'intent_outcome_divergence')?.count).toBe(1)
  })

  it('returns explanatory insufficient-data cards instead of weak recommendations', () => {
    const opportunities = deriveAudienceOpportunities({
      sessions: 10,
      highIntentNonConverters: 2,
      repeatNonConverters: 1,
      multiInterestVisitors: 1,
      paidSessions: 10,
      paidEngagementRate: 20,
      baselineEngagementRate: 60,
      organicSessions: 10,
      organicEngagementRate: 80,
      organicBaselineEngagementRate: 40,
      strongOrganicPages: 1,
      leadActions: 3,
      previousLeadActions: 1,
      confirmedLeads: 0,
      previousConfirmedLeads: 1,
      divergentClients: 1
    })

    expect(opportunities).toHaveLength(6)
    expect(opportunities.every(item => item.status === 'insufficient_data')).toBe(true)
    expect(opportunities.every(item => Object.keys(item.thresholds).length > 0)).toBe(true)
  })
})

describe('buildAudienceGrounding', () => {
  it('constructs an allowlisted aggregate payload and drops sensitive extra keys', () => {
    const opportunity: AudienceOpportunity = {
      code: 'high_intent_non_converters',
      title: 'High-intent visitors have not converted',
      description: 'Strong on-site intent without a lead action.',
      status: 'opportunity',
      count: 14,
      thresholds: { minimumSessions: 20 },
      evidence: { sessions: 100 }
    }
    const breakdown: AudienceBreakdownRow & Record<string, unknown> = {
      key: 'google',
      visitors: 40,
      sessions: 50,
      engagementRate: 62,
      leadActions: 8,
      confirmedLeads: 5,
      confirmedLeadRate: 10,
      gclid: 'must-not-leak',
      session_id: 'must-not-leak'
    }
    const unsafeInput = {
      window: range,
      scope: 'agency' as const,
      kpis: { ...kpis, anon_id: 'must-not-leak', phone: '0400000000' },
      previousKpis: { ...kpis, email: 'person@example.com' },
      opportunities: [{ ...opportunity, fingerprint: 'must-not-leak' }],
      breakdowns: { source: [breakdown] },
      rawEvents: [{ session_id: 'must-not-leak' }]
    }

    const grounding = buildAudienceGrounding(unsafeInput)
    const serialized = JSON.stringify(grounding)

    expect(grounding).toEqual({
      window: range,
      scope: 'agency',
      kpis,
      previousKpis: kpis,
      opportunities: [opportunity],
      breakdowns: {
        source: [{
          key: 'google',
          visitors: 40,
          sessions: 50,
          engagementRate: 62,
          leadActions: 8,
          confirmedLeads: 5,
          confirmedLeadRate: 10
        }]
      }
    })
    expect(serialized).not.toMatch(/anon|session_id|gclid|fingerprint|email|phone|rawEvents/i)
  })
})
