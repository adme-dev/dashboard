// server/utils/socialReporting/reportSend.ts
// Scheduled-report send orchestration (3c). All side effects are injected so the gate / due-selection
// / per-schedule send / stamping logic is unit-testable with fakes. The actual aggregation, PDF
// render, R2 upload, and Resend email are wired in by the cron endpoint.
//
// HARD GATE: nothing sends unless SOCIAL_REPORTS_ENABLED === 'true' (mirrors EMAIL_SENDING_ENABLED /
// SOCIAL_AUTOMATION_ENABLED). Off by default → the whole pipeline is dormant.
import { isSocialReportDue, type ReportScheduleRow } from './reportSchedule'
import { buildReportHtml, type ReportHtmlData } from './reportHtml'

export function isSocialReportsEnabled(): boolean {
  return process.env.SOCIAL_REPORTS_ENABLED === 'true'
}

export interface ReportSendDb {
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

export interface ReportSendDeps {
  now: Date
  /** Aggregate the report payload for a schedule (null → skip, e.g. no data). */
  buildReportData(schedule: any): Promise<ReportHtmlData | null>
  /** Render HTML → PDF buffer (null → email falls back to an inline HTML link/body). */
  renderPdf(html: string): Promise<Buffer | null>
  /** Persist the PDF and return a URL (only called when a PDF was produced). */
  uploadPdf(key: string, pdf: Buffer): Promise<string>
  /** Deliver the report. Throws on failure (recorded as last_error). */
  sendReportEmail(args: { recipients: string[]; data: ReportHtmlData; pdfUrl: string | null; html: string }): Promise<void>
}

export interface ReportSendResult { gated: boolean; sent: number; skipped: number; failed: number }

/** Process all enabled schedules that are due. Idempotent-ish: last_sent_at gates re-sends per cadence. */
export async function processDueReports(db: ReportSendDb, deps: ReportSendDeps): Promise<ReportSendResult> {
  if (!isSocialReportsEnabled()) return { gated: true, sent: 0, skipped: 0, failed: 0 }

  const schedules = await db.queryRows<ReportScheduleRow & Record<string, any>>(
    `SELECT * FROM social_report_schedules WHERE enabled = TRUE`,
  )
  let sent = 0, skipped = 0, failed = 0

  // Re-send protection is last_sent_at + cadence (isSocialReportDue). This assumes a SINGLE daily trigger
  // (the social-report-cron worker) — there is no manual trigger, so two concurrent runs reading the
  // same last_sent_at (a TOCTOU double-send) can't occur in practice. If a manual trigger is ever
  // added, claim each schedule atomically (e.g. UPDATE ... WHERE last_sent_at IS DISTINCT FROM …) first.
  for (const s of schedules) {
    if (!isSocialReportDue(s, deps.now)) { skipped++; continue }
    // Skip schedules with no recipients — nothing to deliver to.
    if (!Array.isArray(s.recipients) || s.recipients.length === 0) { skipped++; continue }
    try {
      const data = await deps.buildReportData(s)
      if (!data) { skipped++; continue }
      const html = buildReportHtml(data)
      const pdf = await deps.renderPdf(html)
      const pdfUrl = pdf ? await deps.uploadPdf(`social-reports/${s.client_id}/${s.id}-${deps.now.getTime()}.pdf`, pdf) : null
      await deps.sendReportEmail({ recipients: s.recipients, data, pdfUrl, html })
      await db.execute(
        `UPDATE social_report_schedules SET last_sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`, [s.id])
      sent++
    } catch (e: any) {
      await db.execute(
        `UPDATE social_report_schedules SET last_error = $2, updated_at = NOW() WHERE id = $1`,
        [s.id, String(e?.message ?? e).slice(0, 500)])
      failed++
    }
  }
  return { gated: false, sent, skipped, failed }
}
