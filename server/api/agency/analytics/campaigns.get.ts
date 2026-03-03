/**
 * Analytics Campaigns
 * GET /api/agency/analytics/campaigns
 *
 * Query params: startDate, endDate, clientId?, platform? (comma-separated),
 *               sortBy, sortDir, limit (default 50), offset (default 0), search?
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { computeMetrics, toNum, PLATFORM_LABELS, PLATFORM_COLORS } from '~~/server/utils/analyticsMetrics'

const ALLOWED_SORT = ['spend', 'impressions', 'clicks', 'conversions', 'revenue', 'campaign_name', 'platform'] as const

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
  const sortBy = ALLOWED_SORT.includes(q.sortBy as any) ? q.sortBy as string : 'spend'
  const sortDir = q.sortDir === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
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
    // Count total
    const countResult = await queryOne(`
      SELECT COUNT(DISTINCT ms.campaign_id) as count
      FROM media_spend ms
      WHERE ${where}
    `, params)
    const total = Number(countResult?.count || 0)

    // Fetch campaigns
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
        ms.client_id,
        c.name as client_name,
        SUM(ms.actual_spend) as spend,
        SUM(ms.budget_allocated) as budget,
        SUM(ms.impressions) as impressions,
        SUM(ms.clicks) as clicks,
        SUM(ms.conversions) as conversions,
        SUM(ms.revenue) as revenue,
        MAX(ms.synced_at) as last_synced
      FROM media_spend ms
      LEFT JOIN agency_clients c ON ms.client_id = c.id
      WHERE ${where}
      GROUP BY ms.campaign_id, ms.campaign_name, ms.platform, ms.campaign_type, ms.campaign_status, ms.client_id, c.name
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
        clientId: r.client_id,
        clientName: r.client_name || 'Unknown',
        spend,
        budget: toNum(r.budget),
        impressions,
        clicks,
        conversions,
        revenue,
        ...metrics,
        lastSynced: r.last_synced,
      }
    })

    return { campaigns, total, limit, offset }
  } catch (error) {
    console.error('Analytics campaigns failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch campaigns' })
  }
})
