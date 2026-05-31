/**
 * Analytics Export (CSV)
 * GET /api/agency/analytics/export
 *
 * Query params: same as campaigns (startDate, endDate, clientId?, platform?, search?)
 * Optional: includeBreakdowns=true to append breakdown rows
 * Returns CSV file.
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum, PLATFORM_LABELS, buildClientCondition } from '~~/server/utils/analyticsMetrics'
import {
  PORTAL_LEAD_STATUS_SELECT,
  leadSourceForPlatformSql
} from '~~/server/utils/leads/portalAnalytics'

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
  const includeBreakdowns = q.includeBreakdowns === 'true'

  // $1,$2 = ISO start/end dates consumed by the daily_spend window CTE (day-accurate).
  // Other filters start at $3; the lead LATERAL reuses $1/$2 for its date window.
  const params: unknown[] = [startDate, endDate]
  const conditions: string[] = []
  let idx = 3

  if (clientId) {
    conditions.push(buildClientCondition(idx))
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

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

  try {
    const leadStartIdx = 1
    const leadEndIdx = 2

    const rows = await queryRows(`
      WITH daily AS (
        SELECT ds.media_spend_id,
               SUM(ds.spend) as spend,
               SUM(ds.impressions) as impressions,
               SUM(ds.clicks) as clicks,
               SUM(ds.conversions) as conversions,
               SUM(ds.revenue) as revenue
        FROM daily_spend ds
        WHERE ds.spend_date BETWEEN $1 AND $2
        GROUP BY ds.media_spend_id
      ),
      campaigns AS (
        SELECT
          ms.campaign_name,
          ms.platform,
          ms.campaign_id,
          ms.client_id,
          c.name as client_name,
          SUM(d.spend) as spend,
          SUM(ms.budget_allocated) as budget,
          SUM(d.impressions) as impressions,
          SUM(d.clicks) as clicks,
          SUM(d.conversions) as conversions,
          COALESCE(SUM(d.revenue), 0) as revenue,
          (array_agg(ms.id ORDER BY ms.synced_at DESC NULLS LAST))[1] as media_spend_id
        FROM media_spend ms
        JOIN daily d ON d.media_spend_id = ms.id
        LEFT JOIN agency_clients c ON ms.client_id = c.id
        ${where}
        GROUP BY ms.campaign_name, ms.platform, ms.campaign_id, ms.client_id, c.name
      )
      SELECT
        c.*,
        COALESCE(la.lead_count, 0) AS lead_count,
        COALESCE(la.lead_new_count, 0) AS lead_new_count,
        COALESCE(la.lead_contacted_count, 0) AS lead_contacted_count,
        COALESCE(la.lead_qualified_count, 0) AS lead_qualified_count,
        COALESCE(la.lead_won_count, 0) AS lead_won_count,
        COALESCE(la.lead_lost_count, 0) AS lead_lost_count,
        CASE WHEN COALESCE(la.lead_count, 0) > 0 THEN c.spend / la.lead_count ELSE NULL END AS cost_per_lead
      FROM campaigns c
      LEFT JOIN LATERAL (
        SELECT ${PORTAL_LEAD_STATUS_SELECT}
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.submitted_at >= $${leadStartIdx}::date
          AND l.submitted_at < ($${leadEndIdx}::date + INTERVAL '1 day')
          AND l.source = ${leadSourceForPlatformSql('c')}
          AND (c.client_id IS NULL OR l.client_id = c.client_id)
          AND (
            (c.campaign_id IS NOT NULL AND l.campaign_id = c.campaign_id)
            OR (c.campaign_id IS NULL AND c.campaign_name IS NOT NULL AND l.campaign_name = c.campaign_name)
          )
      ) la ON TRUE
      ORDER BY c.spend DESC
    `, params)

    // Campaign-level CSV
    const headers = [
      'Platform',
      'Campaign',
      'Client',
      'Spend',
      'Budget',
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
      const budget = toNum(r.budget)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const leadCount = Number(r.lead_count || 0)
      const m = computeMetrics(spend, impressions, clicks, conversions, revenue)

      return [
        PLATFORM_LABELS[r.platform] || r.platform,
        escapeCsv(r.campaign_name || ''),
        escapeCsv(r.client_name || 'Unknown'),
        spend.toFixed(2),
        budget.toFixed(2),
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

    const sections = [headers.join(','), ...csvRows]

    // Breakdown data (optional)
    if (includeBreakdowns) {
      const spendIds = rows.map(r => r.media_spend_id).filter(Boolean)
      if (spendIds.length > 0) {
        const breakdownRows = await queryRows(`
          SELECT
            sb.media_spend_id,
            sb.dimension_type,
            sb.dimension_value,
            sb.spend,
            sb.impressions,
            sb.clicks,
            sb.conversions,
            sb.revenue
          FROM spend_breakdowns sb
          WHERE sb.media_spend_id = ANY($1)
          ORDER BY sb.media_spend_id, sb.dimension_type, sb.spend DESC
        `, [spendIds])

        if (breakdownRows.length > 0) {
          // Build lookup: media_spend_id → campaign name + platform
          const spendLookup = new Map(rows.map(r => [r.media_spend_id, { name: r.campaign_name, platform: r.platform }]))

          sections.push('')
          sections.push('--- Demographic & Device Breakdowns ---')
          sections.push('Platform,Campaign,Dimension,Value,Spend,Impressions,Clicks,Conversions,Revenue,CTR,CPC')

          for (const b of breakdownRows) {
            const campaign = spendLookup.get(b.media_spend_id)
            const spend = toNum(b.spend)
            const impressions = toNum(b.impressions)
            const clicks = toNum(b.clicks)
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : null
            const cpc = clicks > 0 ? spend / clicks : null

            sections.push([
              PLATFORM_LABELS[campaign?.platform || ''] || campaign?.platform || '',
              escapeCsv(campaign?.name || ''),
              b.dimension_type,
              escapeCsv(b.dimension_value),
              spend.toFixed(2),
              impressions,
              clicks,
              toNum(b.conversions),
              toNum(b.revenue).toFixed(2),
              ctr !== null ? ctr.toFixed(2) : '',
              cpc !== null ? cpc.toFixed(2) : ''
            ].join(','))
          }
        }
      }
    }

    const csv = sections.join('\n')

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
