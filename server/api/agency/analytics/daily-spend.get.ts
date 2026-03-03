/**
 * Analytics Daily Spend
 * GET /api/agency/analytics/daily-spend
 *
 * Query params: startDate, endDate, clientId?, platform? (comma-separated)
 * Returns array of daily aggregates across all matching platforms.
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { toNum, buildClientCondition } from '~~/server/utils/analyticsMetrics'

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

  const conditions: string[] = ['ds.spend_date >= $1', 'ds.spend_date <= $2']
  const params: any[] = [startDate, endDate]
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

  const where = conditions.join(' AND ')

  try {
    const rows = await queryRows(`
      SELECT
        ds.spend_date as date,
        SUM(ds.spend) as spend,
        SUM(ds.impressions) as impressions,
        SUM(ds.clicks) as clicks,
        SUM(ds.conversions) as conversions,
        0 as revenue
      FROM daily_spend ds
      JOIN media_spend ms ON ds.media_spend_id = ms.id
      WHERE ${where}
      GROUP BY ds.spend_date
      ORDER BY ds.spend_date
    `, params)

    return rows.map(r => ({
      date: String(r.date).slice(0, 10),
      spend: toNum(r.spend),
      impressions: toNum(r.impressions),
      clicks: toNum(r.clicks),
      conversions: toNum(r.conversions),
      revenue: toNum(r.revenue),
    }))
  } catch (error) {
    console.error('Analytics daily spend failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch daily spend data' })
  }
})
