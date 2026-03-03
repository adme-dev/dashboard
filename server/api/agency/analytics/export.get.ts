/**
 * Analytics Export (CSV)
 * GET /api/agency/analytics/export
 *
 * Query params: same as campaigns (startDate, endDate, clientId?, platform?, search?)
 * Returns CSV file.
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum, PLATFORM_LABELS } from '~~/server/utils/analyticsMetrics'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  const clientId = q.clientId as string | undefined
  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null
  const search = q.search as string | undefined

  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2']
  const params: any[] = [startDate.slice(0, 7), endDate.slice(0, 7)]
  let idx = 3

  if (clientId) {
    conditions.push(`ms.client_id = $${idx}`)
    params.push(clientId)
    idx++
  }
  if (platforms && platforms.length > 0) {
    conditions.push(`ms.platform = ANY($${idx})`)
    params.push(platforms)
    idx++
  }
  if (search) {
    const escaped = String(search).replace(/%/g, '\\%').replace(/_/g, '\\_')
    conditions.push(`ms.campaign_name ILIKE $${idx}`)
    params.push(`%${escaped}%`)
    idx++
  }

  const where = conditions.join(' AND ')

  try {
    const rows = await queryRows(`
      SELECT
        ms.campaign_name,
        ms.platform,
        ms.client_id,
        c.name as client_name,
        SUM(ms.actual_spend) as spend,
        SUM(ms.budget_allocated) as budget,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        0 as revenue
      FROM media_spend ms
      LEFT JOIN agency_clients c ON ms.client_id = c.id
      WHERE ${where}
      GROUP BY ms.campaign_name, ms.platform, ms.client_id, c.name
      ORDER BY SUM(ms.actual_spend) DESC
    `, params)

    const headers = ['Platform', 'Campaign', 'Client', 'Spend', 'Budget', 'Impressions', 'Clicks', 'Conversions', 'Revenue', 'CPC', 'CPM', 'CTR', 'ROAS']

    const csvRows = rows.map(r => {
      const spend = toNum(r.spend)
      const budget = toNum(r.budget)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const m = computeMetrics(spend, impressions, clicks, conversions, revenue)

      return [
        PLATFORM_LABELS[r.platform] || r.platform,
        escapeCsv(r.campaign_name || ''),
        escapeCsv(r.client_name || 'Unknown'),
        spend.toFixed(2),
        budget.toFixed(2),
        impressions,
        clicks,
        conversions,
        revenue.toFixed(2),
        m.cpc !== null ? m.cpc.toFixed(2) : '',
        m.cpm !== null ? m.cpm.toFixed(2) : '',
        m.ctr !== null ? m.ctr.toFixed(2) : '',
        m.roas !== null ? m.roas.toFixed(2) : '',
      ].join(',')
    })

    const csv = [headers.join(','), ...csvRows].join('\n')

    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="analytics-export-${startDate}-${endDate}.csv"`)

    return csv
  } catch (error) {
    console.error('Analytics export failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to export analytics data' })
  }
})

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}
