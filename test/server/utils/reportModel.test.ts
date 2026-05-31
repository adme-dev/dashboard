import { describe, it, expect } from 'vitest'
import {
  composeReportModel,
  renderReportHtml,
  isReportDue,
  cadenceWindowDays
} from '~~/server/utils/reports/reportModel'
import type { CanonicalFactRow } from '~~/server/utils/canonicalFact'

const fact: CanonicalFactRow[] = [
  { date: '2026-05-01', channel: 'Paid Search', spend: 600, leads: 30, conversions: 40, revenue: 0, sessions: 500 },
  { date: '2026-05-02', channel: 'Paid Search', spend: 400, leads: 10, conversions: 20, revenue: 0, sessions: 300 },
  { date: '2026-05-01', channel: 'Paid Social', spend: 200, leads: 10, conversions: 5, revenue: 0, sessions: 100 }
]

describe('composeReportModel', () => {
  const model = composeReportModel('Acme Motors', { startDate: '2026-05-01', endDate: '2026-05-07' }, fact)

  it('aggregates totals across the window', () => {
    expect(model.totals.spend).toBe(1200)
    expect(model.totals.leads).toBe(50)
    expect(model.totals.cpl).toBeCloseTo(24) // 1200 / 50
    expect(model.totals.sessions).toBe(900)
  })

  it('rolls up per channel and sorts by spend', () => {
    expect(model.channels[0].channel).toBe('Paid Search')
    expect(model.channels[0].spend).toBe(1000)
    expect(model.channels[0].cpl).toBeCloseTo(25) // 1000 / 40
    expect(model.channels[1].channel).toBe('Paid Social')
  })
})

describe('renderReportHtml', () => {
  const model = composeReportModel('Acme Motors', { startDate: '2026-05-01', endDate: '2026-05-07' }, fact)

  it('embeds client name, branding, and totals; escapes HTML', () => {
    const html = renderReportHtml(model, { agencyName: 'XeroFlow & Co', accentColor: '#ff0000' })
    expect(html).toContain('Acme Motors')
    expect(html).toContain('XeroFlow &amp; Co') // escaped
    expect(html).toContain('#ff0000')           // accent applied
    expect(html).toContain('Paid Search')
  })

  it('ignores a non-https logo and a bad accent colour (no injection)', () => {
    const html = renderReportHtml(model, { logoUrl: 'javascript:alert(1)', accentColor: 'red; }<script>' })
    expect(html).not.toContain('javascript:alert')
    expect(html).not.toContain('<script>')
    expect(html).toContain('#4f46e5') // falls back to default accent
  })
})

describe('isReportDue / cadenceWindowDays', () => {
  const now = new Date('2026-05-31T08:00:00Z')

  it('is due when never run', () => {
    expect(isReportDue('weekly', null, now)).toBe(true)
  })
  it('weekly is due after 7 days, not before', () => {
    expect(isReportDue('weekly', '2026-05-23T08:00:00Z', now)).toBe(true)  // 8 days
    expect(isReportDue('weekly', '2026-05-26T08:00:00Z', now)).toBe(false) // 5 days
  })
  it('monthly is due after 30 days', () => {
    expect(isReportDue('monthly', '2026-04-20T08:00:00Z', now)).toBe(true)  // 41 days
    expect(isReportDue('monthly', '2026-05-10T08:00:00Z', now)).toBe(false) // 21 days
  })
  it('window days per cadence', () => {
    expect(cadenceWindowDays('weekly')).toBe(7)
    expect(cadenceWindowDays('monthly')).toBe(30)
  })
})
