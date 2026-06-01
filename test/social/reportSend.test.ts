import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { processDueReports, isSocialReportsEnabled, type ReportSendDeps } from '~~/server/utils/socialReporting/reportSend'

const NOW = new Date('2026-06-30T00:00:00Z')
const kpis = {
  posts: { value: 1, deltaPct: null }, impressions: { value: 1, deltaPct: null }, reach: { value: 1, deltaPct: null },
  engagements: { value: 1, deltaPct: null }, clicks: { value: 1, deltaPct: null }, engagementRate: { value: 1, deltaPct: null },
}
function deps(over: Partial<ReportSendDeps> = {}): ReportSendDeps {
  return {
    now: NOW,
    buildReportData: vi.fn(async () => ({ clientName: 'C', periodLabel: 'P', kpis })),
    renderPdf: vi.fn(async () => Buffer.from('pdf')),
    uploadPdf: vi.fn(async () => 'https://r2/report.pdf'),
    sendReportEmail: vi.fn(async () => {}),
    ...over,
  }
}
function db(rows: any[]) {
  const execCalls: { sql: string; params: any[] }[] = []
  return {
    execCalls,
    queryRows: vi.fn(async () => rows),
    execute: vi.fn(async (sql: string, params: any[] = []) => { execCalls.push({ sql, params }); return 1 }),
  }
}
const sched = (o: any = {}) => ({ id: 's1', client_id: 'c1', cadence: 'monthly', enabled: true, last_sent_at: null, recipients: ['a@b.com'], ...o })

beforeEach(() => { process.env.SOCIAL_REPORTS_ENABLED = 'true' })
afterEach(() => { delete process.env.SOCIAL_REPORTS_ENABLED; vi.restoreAllMocks() })

describe('isSocialReportsEnabled', () => {
  it('only true for the exact string "true"', () => {
    process.env.SOCIAL_REPORTS_ENABLED = 'true'; expect(isSocialReportsEnabled()).toBe(true)
    process.env.SOCIAL_REPORTS_ENABLED = '1'; expect(isSocialReportsEnabled()).toBe(false)
  })
})

describe('processDueReports — HARD GATE', () => {
  it('sends NOTHING when the gate is off (no DB read, no email)', async () => {
    delete process.env.SOCIAL_REPORTS_ENABLED
    const d = db([sched()]); const dp = deps()
    const r = await processDueReports(d as any, dp)
    expect(r).toEqual({ gated: true, sent: 0, skipped: 0, failed: 0 })
    expect(d.queryRows).not.toHaveBeenCalled()
    expect(dp.sendReportEmail).not.toHaveBeenCalled()
  })
})

describe('processDueReports — gate on', () => {
  it('sends a due schedule and stamps last_sent_at', async () => {
    const d = db([sched({ last_sent_at: null })]); const dp = deps()
    const r = await processDueReports(d as any, dp)
    expect(r.sent).toBe(1)
    expect(dp.sendReportEmail).toHaveBeenCalledOnce()
    expect(d.execCalls[0].sql).toMatch(/last_sent_at = NOW\(\)/)
  })
  it('skips a not-yet-due schedule (no email)', async () => {
    const d = db([sched({ cadence: 'monthly', last_sent_at: '2026-06-25T00:00:00Z' })]); const dp = deps() // 5d ago
    const r = await processDueReports(d as any, dp)
    expect(r.skipped).toBe(1); expect(r.sent).toBe(0)
    expect(dp.sendReportEmail).not.toHaveBeenCalled()
  })
  it('skips a schedule with no recipients', async () => {
    const d = db([sched({ recipients: [] })]); const dp = deps()
    const r = await processDueReports(d as any, dp)
    expect(r.skipped).toBe(1); expect(dp.sendReportEmail).not.toHaveBeenCalled()
  })
  it('records last_error and counts failed when send throws (does not abort the run)', async () => {
    const d = db([sched({ id: 'x' }), sched({ id: 'y' })])
    const dp = deps({ sendReportEmail: vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined) })
    const r = await processDueReports(d as any, dp)
    expect(r.failed).toBe(1); expect(r.sent).toBe(1)
    expect(d.execCalls.some(c => /last_error = \$2/.test(c.sql))).toBe(true)
  })
  it('still delivers (pdfUrl null) when PDF render is unavailable', async () => {
    const d = db([sched()]); const dp = deps({ renderPdf: vi.fn(async () => null), uploadPdf: vi.fn() })
    const r = await processDueReports(d as any, dp)
    expect(r.sent).toBe(1)
    expect(dp.uploadPdf).not.toHaveBeenCalled()
    expect((dp.sendReportEmail as any).mock.calls[0][0].pdfUrl).toBeNull()
  })
})
