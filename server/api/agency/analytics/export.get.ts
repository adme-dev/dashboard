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

  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2']
  const params: any[] = [startDate.slice(0, 7), endDate.slice(0, 7)]
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

  const where = conditions.join(' AND ')

  try {
    const rows = await queryRows(`
      SELECT
        ms.campaign_name,
        ms.platform,
        ms.campaign_id,
        ms.client_id,
        c.name as client_name,
        SUM(ms.actual_spend) as spend,
        SUM(ms.budget_allocated) as budget,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        COALESCE(SUM(ms.revenue), 0) as revenue,
        (array_agg(ms.id ORDER BY ms.synced_at DESC NULLS LAST))[1] as media_spend_id
      FROM media_spend ms
      LEFT JOIN agency_clients c ON ms.client_id = c.id
      WHERE ${where}
      GROUP BY ms.campaign_name, ms.platform, ms.campaign_id, ms.client_id, c.name
      ORDER BY SUM(ms.actual_spend) DESC
    `, params)

    // Campaign-level CSV
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
              cpc !== null ? cpc.toFixed(2) : '',
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
