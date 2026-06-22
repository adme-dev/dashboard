// server/api/cron/send-ad-reports.post.ts
// Monthly client ad-performance reports. Reads media_spend → PDF → R2 → email.
// No ad-platform writes. Gated by AD_REPORTS_ENABLED. Mirrors send-social-reports.
import { defineEventHandler, createError, getHeader } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { processDueAdReports, type AdReportScheduleRow } from '~~/server/utils/adReporting/send'
import { buildAdReportModel, type AdSpendRow } from '~~/server/utils/adReporting/model'
import { renderReportPdf } from '~~/server/utils/socialReporting/pdf'
import { uploadFile } from '~~/server/utils/storage'
import { sendAnalyticsReportEmail } from '~~/server/utils/email'

// 'YYYY-MM' for the month `offset` months before `now` (offset 1 = previous month).
function periodMonthsAgo(now: Date, offset: number): { period: string, label: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
  const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { period, label }
}

async function spendRows(clientId: string, period: string, platform: string | null): Promise<AdSpendRow[]> {
  const params: any[] = [clientId, period]
  let sql = `SELECT platform, campaign_name, budget_allocated, actual_spend, impressions, clicks, conversions
             FROM media_spend WHERE client_id = $1 AND period = $2`
  if (platform) { sql += ` AND platform = $3`; params.push(platform) }
  return await queryRows<AdSpendRow>(sql, params)
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const now = new Date()
  const cur = periodMonthsAgo(now, 1)   // previous complete month
  const prev = periodMonthsAgo(now, 2)  // month before that

  const result = await processDueAdReports({ queryRows, execute }, {
    now,
    async buildModel(s: AdReportScheduleRow) {
      const client = await queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [s.client_id])
      if (!client) return null
      const platform = s.platform || null
      const [current, prior] = await Promise.all([
        spendRows(s.client_id, cur.period, platform),
        spendRows(s.client_id, prev.period, platform),
      ])
      if (current.length === 0) return null // nothing to report this period
      return buildAdReportModel({ clientName: client.name, periodLabel: cur.label, current, prior })
    },
    renderPdf: html => renderReportPdf(event, html),
    uploadPdf: async (key, pdf) => (await uploadFile(pdf, key, 'application/pdf')).url,
    async sendEmail({ recipients, model, pdfUrl, html }) {
      const r = await sendAnalyticsReportEmail({
        event, to: recipients, subject: `${model.clientName} — Ad report (${model.periodLabel})`, html, reportUrl: pdfUrl,
      })
      if (!r.sent) throw new Error('email send failed (Resend not configured?)')
    },
  })
  return { ok: true, period: cur.period, ...result }
})
