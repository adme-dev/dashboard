import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { portalPeriodPostRows } from '~~/server/utils/socialReporting/portal'
import { buildOverview, rankBestContent } from '~~/server/utils/socialReporting/aggregate'
import { generateReportSummary } from '~~/server/utils/socialReporting/aiSummary'
import { buildReportHtml } from '~~/server/utils/socialReporting/reportHtml'

/**
 * GET /api/agency/social/reporting/preview?clientId=&days=&platform=&summary=1
 * Renders the report HTML for a client window and returns it as text/html — the ungated
 * "preview/download now" path (human-initiated, no email, no gate). Useful to eyeball/print the
 * exact document the scheduled cron would PDF + email.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365)
  const platform = q.platform && q.platform !== 'all' ? String(q.platform) : null

  const client = await queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [clientId])
  if (!client) throw createError({ statusCode: 404, statusMessage: 'client not found' })

  const to = new Date()
  const from = new Date(to.getTime() - days * 86400_000)
  const priorFrom = new Date(from.getTime() - days * 86400_000)
  const [cur, prior] = await Promise.all([
    portalPeriodPostRows({ queryRows }, clientId, from.toISOString(), to.toISOString(), platform),
    portalPeriodPostRows({ queryRows }, clientId, priorFrom.toISOString(), from.toISOString(), platform),
  ])
  const kpis = buildOverview(cur, prior)
  const bestContent = rankBestContent(cur, 5).map(r => ({
    content: (r.content || '').slice(0, 140), engagements: r.engagements, engagementRate: r.engagementRate,
  }))
  const periodLabel = `last ${days} days`
  const aiSummary = q.summary === '1' ? await generateReportSummary(client.name, periodLabel, kpis) : null

  const html = buildReportHtml({ clientName: client.name, periodLabel, kpis, bestContent, aiSummary })
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return html
})
