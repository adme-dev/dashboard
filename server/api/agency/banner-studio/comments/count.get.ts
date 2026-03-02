/**
 * Get comment counts per project (for project listing badges)
 * GET /api/agency/banner-studio/comments/count?projectIds=id1,id2,...
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { projectIds } = getQuery(event) as { projectIds?: string }

  if (!projectIds) {
    throw createError({ statusCode: 400, statusMessage: 'projectIds is required' })
  }

  const ids = projectIds.split(',').filter(Boolean).slice(0, 50)
  if (ids.length === 0) return {}

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')

  const rows = await queryRows(`
    SELECT project_id AS "projectId", COUNT(*)::int AS count
    FROM banner_comments
    WHERE project_id IN (${placeholders})
      AND parent_id IS NULL
    GROUP BY project_id
  `, ids)

  const result: Record<string, number> = {}
  for (const row of rows) {
    result[(row as any).projectId] = (row as any).count
  }

  return result
})
