import { describe, it, expect } from 'vitest'
import { buildFunnel, previousWindow, pctDelta, buildComparison } from '../../../server/utils/ga4Funnel'
import { adPlatformToChannel, leadSourceToChannel } from '../../../server/utils/channelMap'

describe('buildFunnel', () => {
  it('merges spend, ga4 and leads by channel and totals them', () => {
    const out = buildFunnel({
      spendByChannel: { 'Paid Search': 100, 'Paid Social': 50 },
      ga4ByChannel: {
        'Paid Search': {
          sessions: 200, engagedSessions: 120, keyEvents: 20,
          totalUsers: 150, newUsers: 90,
          engagementRateWeighted: 0.6 * 200, // 60% engagement over 200 sessions
          durationWeighted: 45 * 200 // 45s avg over 200 sessions
        }
      },
      leadsByChannel: { 'Paid Search': 10, 'Organic Search': 4 }
    })
    const ps = out.channels.find(c => c.channel === 'Paid Search')!
    expect(ps.costPerLead).toBe(10) // 100 / 10
    expect(ps.sessionToLeadRate).toBeCloseTo(0.05) // 10 / 200
    expect(ps.totalUsers).toBe(150)
    expect(ps.newUsers).toBe(90)
    expect(ps.engagementRate).toBeCloseTo(0.6) // session-weighted average
    expect(ps.avgSessionDuration).toBeCloseTo(45)
    expect(out.totals.spend).toBe(150)
    expect(out.totals.leads).toBe(14)
    expect(out.totals.totalUsers).toBe(150)
    expect(out.totals.engagementRate).toBeCloseTo(0.6) // weighted across all sessions
    // Organic Search has leads but no spend → costPerLead is null, not Infinity
    expect(out.channels.find(c => c.channel === 'Organic Search')!.costPerLead).toBeNull()
  })

  it('sorts channels by spend then sessions', () => {
    const out = buildFunnel({
      spendByChannel: { A: 10, B: 30 },
      ga4ByChannel: {},
      leadsByChannel: {}
    })
    expect(out.channels.map(c => c.channel)).toEqual(['B', 'A'])
  })
})

describe('previousWindow', () => {
  it('returns the equal-length window ending the day before start', () => {
    expect(previousWindow('2026-05-08', '2026-05-14')).toEqual({
      prevStart: '2026-05-01',
      prevEnd: '2026-05-07'
    })
  })
})

describe('pctDelta / buildComparison', () => {
  it('computes fractional change and returns null when previous is 0', () => {
    expect(pctDelta(150, 100)).toBeCloseTo(0.5)
    expect(pctDelta(80, 100)).toBeCloseTo(-0.2)
    expect(pctDelta(10, 0)).toBeNull()
  })

  it('builds the comparison block from current + previous totals', () => {
    const cur = buildFunnel({
      spendByChannel: { 'Paid Search': 120 }, ga4ByChannel: {}, leadsByChannel: { 'Paid Search': 12 }
    })
    const prev = buildFunnel({
      spendByChannel: { 'Paid Search': 100 }, ga4ByChannel: {}, leadsByChannel: { 'Paid Search': 10 }
    })
    const cmp = buildComparison(cur.totals, prev.totals)
    expect(cmp.totals.spend).toBe(100)
    expect(cmp.deltaPct.spend).toBeCloseTo(0.2)
    expect(cmp.deltaPct.leads).toBeCloseTo(0.2)
    expect(cmp.deltaPct.sessions).toBeNull() // prev sessions = 0
  })
})

describe('channelMap', () => {
  it('maps ad platforms onto GA4 channel groups (mirrors the old inline CASE)', () => {
    expect(adPlatformToChannel('google_ads')).toBe('Paid Search')
    expect(adPlatformToChannel('google')).toBe('Paid Search')
    expect(adPlatformToChannel('meta')).toBe('Paid Social')
    expect(adPlatformToChannel('meta_ads')).toBe('Paid Social')
    expect(adPlatformToChannel('tiktok')).toBe('Paid Social')
    expect(adPlatformToChannel('unknown')).toBeNull() // → 'Other' bucket at the call site
  })

  it('maps lead sources onto GA4 channel groups', () => {
    expect(leadSourceToChannel('google')).toBe('Paid Search')
    expect(leadSourceToChannel('meta')).toBe('Paid Social')
    expect(leadSourceToChannel('webhook')).toBeNull()
  })
})
