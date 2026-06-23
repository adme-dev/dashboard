// server/utils/adReporting/send.ts
import type { AdReportModel } from '~~/server/utils/adReporting/model'
import { buildAdReportHtml } from '~~/server/utils/adReporting/html'

export function isAdReportsEnabled(): boolean {
  return process.env.AD_REPORTS_ENABLED === 'true'
}

export interface AdReportScheduleRow {
  id: string
  client_id: string
  cadence: string
  enabled: boolean
  recipients: string[]
  last_sent_at: string | null
  [k: string]: any
}

// Monthly cadence: due if never sent or last send was >= 28 days ago.
export function isAdReportDue(s: AdReportScheduleRow, now: Date): boolean {
  if (!s.enabled) return false
  if (!s.last_sent_at) return true
  const last = new Date(s.last_sent_at)
  if (Number.isNaN(last.getTime())) return true
  const elapsedDays = (now.getTime() - last.getTime()) / 86400_000
  return elapsedDays >= 28
}

export interface AdReportSendDb {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  execute: (sql: string, params?: any[]) => Promise<number>
}

export interface AdReportSendDeps {
  now: Date
  buildModel: (s: AdReportScheduleRow) => Promise<AdReportModel | null>
  renderPdf: (html: string) => Promise<Buffer | null>
  uploadPdf: (key: string, pdf: Buffer) => Promise<string>
  sendEmail: (args: { recipients: string[], model: AdReportModel, pdfUrl: string | null, html: string }) => Promise<void>
}

export async function processDueAdReports(db: AdReportSendDb, deps: AdReportSendDeps): Promise<{ gated: boolean, sent: number, skipped: number, failed: number }> {
  if (!isAdReportsEnabled()) return { gated: true, sent: 0, skipped: 0, failed: 0 }

  const schedules = await db.queryRows<AdReportScheduleRow>(`SELECT * FROM ad_report_schedules WHERE enabled = TRUE`)
  let sent = 0, skipped = 0, failed = 0

  for (const s of schedules) {
    if (!isAdReportDue(s, deps.now)) { skipped++; continue }
    if (!Array.isArray(s.recipients) || s.recipients.length === 0) { skipped++; continue }
    try {
      const model = await deps.buildModel(s)
      if (!model) { skipped++; continue }
      const html = buildAdReportHtml(model)
      const pdf = await deps.renderPdf(html)
      const pdfUrl = pdf ? await deps.uploadPdf(`ad-reports/${s.client_id}/${s.id}-${deps.now.getTime()}.pdf`, pdf) : null
      await deps.sendEmail({ recipients: s.recipients, model, pdfUrl, html })
      await db.execute(`UPDATE ad_report_schedules SET last_sent_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`, [s.id])
      sent++
    } catch (e: any) {
      await db.execute(`UPDATE ad_report_schedules SET last_error = $2, updated_at = NOW() WHERE id = $1`, [s.id, String(e?.message ?? e).slice(0, 500)])
      failed++
    }
  }
  return { gated: false, sent, skipped, failed }
}
