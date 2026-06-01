import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { processDueReports } from '~~/server/utils/socialReporting/reportSend'
import { portalPeriodPostRows } from '~~/server/utils/socialReporting/portal'
import { buildOverview, rankBestContent } from '~~/server/utils/socialReporting/aggregate'
import { generateReportSummary } from '~~/server/utils/socialReporting/aiSummary'
import { renderReportPdf } from '~~/server/utils/socialReporting/pdf'
import { uploadFile } from '~~/server/utils/storage'
import { sendAnalyticsReportEmail } from '~~/server/utils/email'

/**
 * POST /api/cron/send-social-reports
 * Slice 3 / 3c — invoked by the `social-report-cron` companion Worker (Pages has no scheduled()).
 * Sends due scheduled reports as PDF emails. HARD-gated by SOCIAL_REPORTS_ENABLED (processDueReports
 * returns gated:true and does nothing until set). Per-schedule failures are recorded, never abort.
 */
export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const now = new Date()
  const result = await processDueReports({ queryRows, execute }, {
    now,
    async buildReportData(s: any) {
      const client = await queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [s.client_id])
      if (!client) return null
      const windowDays = s.window_days || 30
      const to = now
      const from = new Date(now.getTime() - windowDays * 86400_000)
      const priorFrom = new Date(from.getTime() - windowDays * 86400_000)
      const platform = s.platform || null
      const [cur, prior] = await Promise.all([
        portalPeriodPostRows({ queryRows }, s.client_id, from.toISOString(), to.toISOString(), platform),
        portalPeriodPostRows({ queryRows }, s.client_id, priorFrom.toISOString(), from.toISOString(), platform),
      ])
      const kpis = buildOverview(cur, prior)
      const bestContent = rankBestContent(cur, 5).map(r => ({
        content: (r.content || '').slice(0, 140), engagements: r.engagements, engagementRate: r.engagementRate,
      }))
      const periodLabel = `last ${windowDays} days`
      const aiSummary = await generateReportSummary(client.name, periodLabel, kpis)
      return { clientName: client.name, periodLabel, kpis, bestContent, aiSummary }
    },
    renderPdf: (html) => renderReportPdf(event, html),
    uploadPdf: async (key, pdf) => (await uploadFile(pdf, key, 'application/pdf')).url,
    async sendReportEmail({ recipients, data, pdfUrl, html }) {
      const r = await sendAnalyticsReportEmail({
        event, to: recipients, subject: `${data.clientName} — Social report (${data.periodLabel})`, html, reportUrl: pdfUrl,
      })
      if (!r.sent) throw new Error('email send failed (Resend not configured?)')
    },
  })
  return result
})
