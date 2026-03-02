/**
 * Get per-format analytics breakdown for a project.
 * GET /api/agency/banner-studio/analytics/formats?projectId=xxx
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { projectId } = getQuery(event) as { projectId?: string }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  return queryRows(`
    SELECT
      p.format_key AS "formatKey",
      p.width, p.height,
      p.is_live AS "isLive",
      COALESCE(SUM(a.impressions), 0)::int AS "impressions",
      COALESCE(SUM(a.clicks), 0)::int AS "clicks",
      CASE
        WHEN COALESCE(SUM(a.impressions), 0) > 0
        THEN ROUND(SUM(a.clicks)::numeric / SUM(a.impressions) * 100, 2)
        ELSE 0
      END AS "ctr"
    FROM banner_published p
    LEFT JOIN banner_analytics a ON a.published_id = p.id
    WHERE p.project_id = $1
    GROUP BY p.id, p.format_key, p.width, p.height, p.is_live
    ORDER BY COALESCE(SUM(a.impressions), 0) DESC
  `, [projectId])
})
