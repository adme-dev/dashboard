/**
 * Get time-series analytics for a project's published banners.
 * GET /api/agency/banner-studio/analytics?projectId=xxx&from=2024-01-01&to=2024-01-31
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { projectId, from, to } = getQuery(event) as {
    projectId?: string
    from?: string
    to?: string
  }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  // Default to last 30 days
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const toDate = to || new Date().toISOString().slice(0, 10)

  const rows = await queryRows(`
    SELECT
      a.date::text AS "date",
      SUM(a.impressions) AS "impressions",
      SUM(a.clicks) AS "clicks"
    FROM banner_analytics a
    JOIN banner_published p ON p.id = a.published_id
    WHERE p.project_id = $1
      AND a.date >= $2::date
      AND a.date <= $3::date
    GROUP BY a.date
    ORDER BY a.date ASC
  `, [projectId, fromDate, toDate])

  // Also get totals
  const totals = rows.reduce(
    (acc, r: any) => ({
      impressions: acc.impressions + Number(r.impressions || 0),
      clicks: acc.clicks + Number(r.clicks || 0),
    }),
    { impressions: 0, clicks: 0 },
  )

  return {
    series: rows,
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions * 100).toFixed(2) : '0.00',
    },
    from: fromDate,
    to: toDate,
  }
})
