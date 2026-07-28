/**
 * Portal Analytics Export (CSV) — client-scoped
 * GET /api/portal/analytics/export
 *
 * Query params: startDate, endDate, platform?, search?
 */
import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, ANALYTICS_PLATFORM_LABELS, buildClientCondition } from '~~/server/utils/analyticsMetrics'
import {
  PORTAL_LEAD_STATUS_SELECT,
  PORTAL_VISIBLE_LEADS_EXISTS,
  leadSourceForPlatformSql
} from '~~/server/utils/leads/portalAnalytics'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const clientId = clientUser.clientId
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  const platforms = q.platform ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean) : null
  const search = q.search as string | undefined

  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
  const params: unknown[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
  let idx = 4

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
    params.push(startDate)
    const leadStartIdx = idx
    idx++
    params.push(endDate)
    const leadEndIdx = idx

    const rows = await queryRows(`
      WITH campaigns AS (
        SELECT
          ms.campaign_name,
          ms.platform,
          ms.campaign_id,
          SUM(ms.actual_spend) as spend,
          SUM(ms.impressions) as impressions,
          SUM(ms.clicks) as clicks,
          SUM(ms.conversions) as conversions,
          COALESCE(SUM(ms.revenue), 0) as revenue
        FROM media_spend ms
        WHERE ${where}
        GROUP BY ms.campaign_name, ms.platform, ms.campaign_id
      )
      SELECT
        c.*,
        COALESCE(la.lead_count, 0) AS lead_count,
        COALESCE(la.lead_new_count, 0) AS lead_new_count,
        COALESCE(la.lead_contacted_count, 0) AS lead_contacted_count,
        COALESCE(la.lead_qualified_count, 0) AS lead_qualified_count,
        COALESCE(la.lead_won_count, 0) AS lead_won_count,
        COALESCE(la.lead_lost_count, 0) AS lead_lost_count
      FROM campaigns c
      LEFT JOIN LATERAL (
        SELECT ${PORTAL_LEAD_STATUS_SELECT}
        FROM leads l
        WHERE l.client_id = $3
          AND l.deleted_at IS NULL
          AND l.submitted_at >= $${leadStartIdx}::date
          AND l.submitted_at < ($${leadEndIdx}::date + INTERVAL '1 day')
          AND l.source = ${leadSourceForPlatformSql('c')}
          AND (
            (c.campaign_id IS NOT NULL AND l.campaign_id = c.campaign_id)
            OR (c.campaign_id IS NULL AND c.campaign_name IS NOT NULL AND l.campaign_name = c.campaign_name)
          )
          AND ${PORTAL_VISIBLE_LEADS_EXISTS}
      ) la ON TRUE
      ORDER BY c.spend DESC
    `, params)

    const headers = [
      'Platform',
      'Campaign',
      'Spend',
      'Impressions',
      'Clicks',
      'Leads',
      'New Leads',
      'Contacted Leads',
      'Qualified Leads',
      'Won Leads',
      'Lost Leads',
      'Cost Per Lead',
      'Conversions',
      'Revenue',
      'CPC',
      'CPM',
      'CTR',
      'ROAS'
    ]

    const csvRows = rows.map((r) => {
      const spend = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const leadCount = Number(r.lead_count || 0)
      const m = computeMetrics(spend, impressions, clicks, conversions, revenue)

      return [
        ANALYTICS_PLATFORM_LABELS[r.platform] || r.platform,
        escapeCsv(r.campaign_name || ''),
        spend.toFixed(2),
        impressions,
        clicks,
        leadCount,
        Number(r.lead_new_count || 0),
        Number(r.lead_contacted_count || 0),
        Number(r.lead_qualified_count || 0),
        Number(r.lead_won_count || 0),
        Number(r.lead_lost_count || 0),
        leadCount > 0 ? (spend / leadCount).toFixed(2) : '',
        conversions,
        revenue.toFixed(2),
        m.cpc !== null ? m.cpc.toFixed(2) : '',
        m.cpm !== null ? m.cpm.toFixed(2) : '',
        m.ctr !== null ? m.ctr.toFixed(2) : '',
        m.roas !== null ? m.roas.toFixed(2) : ''
      ].join(',')
    })

    const csv = [headers.join(','), ...csvRows].join('\n')

    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="portal-analytics-${startDate}-${endDate}.csv"`)

    return csv
  } catch (error) {
    console.error('Portal analytics export failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to export analytics data' })
  }
})

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}
