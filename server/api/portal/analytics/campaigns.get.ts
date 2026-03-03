/**
 * Portal Analytics Campaigns — client-scoped
 * GET /api/portal/analytics/campaigns
 *
 * Query params: startDate, endDate, platform?, sortBy, sortDir, limit, offset, search?
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { computeMetrics, toNum, PLATFORM_LABELS, PLATFORM_COLORS } from '~~/server/utils/analyticsMetrics'

const ALLOWED_SORT = ['spend', 'impressions', 'clicks', 'conversions', 'revenue', 'campaign_name', 'platform'] as const

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
  const sortBy = ALLOWED_SORT.includes(q.sortBy as any) ? q.sortBy as string : 'spend'
  const sortDir = q.sortDir === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const search = q.search as string | undefined

  const conditions: string[] = ['ms.period >= $1', 'ms.period <= $2', 'ms.client_id = $3']
  const params: any[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientId]
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
    const countResult = await queryOne(`
      SELECT COUNT(DISTINCT ms.campaign_id) as count
      FROM media_spend ms
      WHERE ${where}
    `, params)
    const total = Number(countResult?.count || 0)

    params.push(limit)
    const limitIdx = idx
    idx++
    params.push(offset)
    const offsetIdx = idx

    const rows = await queryRows(`
      SELECT
        ms.campaign_id,
        ms.campaign_name,
        ms.platform,
        ms.campaign_type,
        ms.campaign_status,
        SUM(ms.actual_spend) as spend,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        SUM(ms.revenue) as revenue
      FROM media_spend ms
      WHERE ${where}
      GROUP BY ms.campaign_id, ms.campaign_name, ms.platform, ms.campaign_type, ms.campaign_status
      ORDER BY ${sortBy} ${sortDir}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params)

    const campaigns = rows.map(r => {
      const spend = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spend, impressions, clicks, conversions, revenue)

      return {
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        platform: r.platform,
        platformDisplayName: PLATFORM_LABELS[r.platform] || r.platform,
        platformColor: PLATFORM_COLORS[r.platform] || '#888888',
        campaignType: r.campaign_type,
        campaignStatus: r.campaign_status,
        spend,
        impressions,
        clicks,
        conversions,
        revenue,
        ...metrics,
      }
    })

    return { campaigns, total, limit, offset }
  } catch (error) {
    console.error('Portal analytics campaigns failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch campaigns' })
  }
})
