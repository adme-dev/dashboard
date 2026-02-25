import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

/**
 * GET /api/agency/social/daily-spend?platform=meta|google&month=X&year=Y
 * Returns aggregated daily spend across all active connections for a platform,
 * with a prorated daily budget line.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const platform = query.platform as string
  if (!platform || !['meta', 'google'].includes(platform)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid platform' })
  }

  const now = new Date()
  const month = Number(query.month) || now.getMonth() + 1
  const year = Number(query.year) || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`

  // Map platform param to media_spend.platform value
  const dbPlatform = platform === 'google' ? 'google_ads' : 'meta'

  // Get aggregated daily spend (cast date to text to avoid timezone conversion)
  const dailyRows = await queryRows<{
    spend_date: string
    total_spend: string
    total_impressions: string
    total_clicks: string
  }>(
    `SELECT ds.spend_date::text as spend_date,
            SUM(ds.spend) as total_spend,
            SUM(ds.impressions) as total_impressions,
            SUM(ds.clicks) as total_clicks
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'
     GROUP BY ds.spend_date
     ORDER BY ds.spend_date`,
    [dbPlatform, period]
  )

  // Get total monthly budget (sum across all campaigns for this platform/period)
  const budgetRow = await queryOne<{ total_budget: string }>(
    `SELECT COALESCE(SUM(ms.budget_allocated), 0) as total_budget
     FROM media_spend ms
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.platform = $1 AND ms.period = $2 AND sc.status = 'active'`,
    [dbPlatform, period]
  )

  const totalBudget = parseFloat(budgetRow?.total_budget || '0')
  const daysInMonth = new Date(year, month, 0).getDate()
  const dailyBudget = totalBudget > 0 ? totalBudget / daysInMonth : 0

  return dailyRows.map(row => ({
    date: row.spend_date,
    spend: parseFloat(row.total_spend),
    budget: Math.round(dailyBudget * 100) / 100,
    impressions: parseInt(row.total_impressions, 10),
    clicks: parseInt(row.total_clicks, 10),
  }))
})
