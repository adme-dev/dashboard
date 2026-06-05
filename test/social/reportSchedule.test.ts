import { describe, it, expect } from 'vitest'
import { isSocialReportDue, cadenceMinDays, type ReportScheduleRow } from '~~/server/utils/socialReporting/reportSchedule'
import { buildReportHtml, escapeReportHtml } from '~~/server/utils/socialReporting/reportHtml'

const sched = (o: Partial<ReportScheduleRow>): ReportScheduleRow => ({
  id: 's', client_id: 'c', cadence: 'monthly', enabled: true, last_sent_at: null, ...o,
})

describe('isSocialReportDue', () => {
  const now = new Date('2026-06-30T00:00:00Z')
  it('disabled schedules are never due', () => {
    expect(isSocialReportDue(sched({ enabled: false }), now)).toBe(false)
  })
  it('never-sent schedules are due', () => {
    expect(isSocialReportDue(sched({ last_sent_at: null }), now)).toBe(true)
  })
  it('monthly: due after 28d, not before', () => {
    expect(isSocialReportDue(sched({ cadence: 'monthly', last_sent_at: '2026-06-01T00:00:00Z' }), now)).toBe(true)  // 29d
    expect(isSocialReportDue(sched({ cadence: 'monthly', last_sent_at: '2026-06-20T00:00:00Z' }), now)).toBe(false) // 10d
  })
  it('weekly: due after 7d', () => {
    expect(isSocialReportDue(sched({ cadence: 'weekly', last_sent_at: '2026-06-22T00:00:00Z' }), now)).toBe(true)  // 8d
    expect(isSocialReportDue(sched({ cadence: 'weekly', last_sent_at: '2026-06-26T00:00:00Z' }), now)).toBe(false) // 4d
  })
  it('cadenceMinDays', () => {
    expect(cadenceMinDays('weekly')).toBe(7)
    expect(cadenceMinDays('monthly')).toBe(28)
  })
})

describe('buildReportHtml', () => {
  const data = {
    clientName: 'Acme', periodLabel: 'May 2026',
    kpis: {
      posts: { value: 12, deltaPct: 20 }, impressions: { value: 5400, deltaPct: 10 },
      reach: { value: 4000, deltaPct: -5 }, engagements: { value: 300, deltaPct: null },
      clicks: { value: 80, deltaPct: 3 }, engagementRate: { value: 7.5, deltaPct: 12 },
    },
    bestContent: [{ content: 'Great post', engagements: 50, engagementRate: 10 }],
    aiSummary: 'Engagement up.',
  }
  it('renders a self-contained HTML doc with the KPIs and summary', () => {
    const html = buildReportHtml(data)
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('Acme — Social Performance')
    expect(html).toContain('5.4k') // impressions formatted
    expect(html).toContain('7.5%')
    expect(html).toContain('Engagement up.')
    expect(html).toContain('Great post')
  })
  it('ESCAPES caller/platform content (XSS boundary into the PDF doc)', () => {
    const html = buildReportHtml({ ...data, clientName: '<script>x</script>', bestContent: [{ content: '<img src=x onerror=y>', engagements: 1, engagementRate: 1 }], aiSummary: '<b>hi</b>' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<img src=x onerror=y>')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<b>hi</b>')
  })
  it('escapeReportHtml handles all the dangerous chars', () => {
    expect(escapeReportHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})
