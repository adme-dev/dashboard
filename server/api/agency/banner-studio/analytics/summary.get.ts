/**
 * Get analytics summary for multiple projects (for listing page badges).
 * GET /api/agency/banner-studio/analytics/summary?projectIds=id1,id2,id3
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { projectIds } = getQuery(event) as { projectIds?: string }

  if (!projectIds) {
    throw createError({ statusCode: 400, statusMessage: 'projectIds is required' })
  }

  const ids = projectIds.split(',').filter(Boolean).slice(0, 50) // limit to 50
  if (!ids.length) return []

  // Build parameterized query for IN clause
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')

  return queryRows(`
    SELECT
      p.project_id AS "projectId",
      COALESCE(SUM(a.impressions), 0)::int AS "impressions",
      COALESCE(SUM(a.clicks), 0)::int AS "clicks"
    FROM banner_published p
    LEFT JOIN banner_analytics a ON a.published_id = p.id
    WHERE p.project_id IN (${placeholders})
    GROUP BY p.project_id
  `, ids)
})
