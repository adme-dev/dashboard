// test/utils/ga4Funnel.test.ts
import { describe, it, expect } from 'vitest'
import { buildFunnel } from '~~/server/utils/ga4Funnel'

describe('buildFunnel', () => {
  it('merges spend, ga4 and leads by channel and computes cost ratios', () => {
    const out = buildFunnel({
      spendByChannel: { 'Paid Search': 1000, 'Paid Social': 500 },
      ga4ByChannel: {
        'Paid Search': { sessions: 2000, engagedSessions: 1500, keyEvents: 80 },
        'Paid Social': { sessions: 1000, engagedSessions: 600, keyEvents: 30 },
        'Organic Search': { sessions: 4000, engagedSessions: 3000, keyEvents: 50 }
      },
      leadsByChannel: { 'Paid Search': 40, 'Paid Social': 20 }
    })

    const ps = out.channels.find((c) => c.channel === 'Paid Search')!
    expect(ps.spend).toBe(1000)
    expect(ps.sessions).toBe(2000)
    expect(ps.keyEvents).toBe(80)
    expect(ps.leads).toBe(40)
    expect(ps.costPerSession).toBeCloseTo(0.5)
    expect(ps.costPerKeyEvent).toBeCloseTo(12.5)
    expect(ps.costPerLead).toBeCloseTo(25)
    expect(ps.sessionToLeadRate).toBeCloseTo(0.02)

    // Organic has sessions but no spend → cost ratios are null, not Infinity.
    const org = out.channels.find((c) => c.channel === 'Organic Search')!
    expect(org.spend).toBe(0)
    expect(org.costPerSession).toBeNull()

    // Totals sum across all channels.
    expect(out.totals.spend).toBe(1500)
    expect(out.totals.sessions).toBe(7000)
    expect(out.totals.leads).toBe(60)
  })

  it('sorts channels by spend desc then sessions desc', () => {
    const out = buildFunnel({
      spendByChannel: { 'Paid Social': 500, 'Paid Search': 1000 },
      ga4ByChannel: {
        'Direct': { sessions: 9000, engagedSessions: 5000, keyEvents: 10 },
        'Paid Search': { sessions: 2000, engagedSessions: 1500, keyEvents: 80 },
        'Paid Social': { sessions: 1000, engagedSessions: 600, keyEvents: 30 }
      },
      leadsByChannel: {}
    })
    expect(out.channels.map((c) => c.channel)).toEqual(['Paid Search', 'Paid Social', 'Direct'])
  })
})
