/**
 * Get review status and history for a banner project
 * GET /api/agency/banner-studio/reviews/:projectId
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const projectId = getRouterParam(event, 'projectId')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const project = await queryOne(`
    SELECT
      id, review_status AS "reviewStatus", reviewers,
      updated_at AS "updatedAt"
    FROM banner_projects WHERE id = $1
  `, [projectId])

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Get review comments (format_key = '__review__')
  const reviewComments = await queryRows(`
    SELECT
      c.id, c.text, c.user_id AS "userId",
      c.created_at AS "createdAt",
      u.name AS "userName"
    FROM banner_comments c
    LEFT JOIN team_members u ON u.id = c.user_id
    WHERE c.project_id = $1 AND c.format_key = '__review__'
    ORDER BY c.created_at DESC
  `, [projectId])

  // Get reviewer details
  const reviewerIds = (project as any).reviewers || []
  let reviewers: any[] = []
  if (reviewerIds.length > 0) {
    const placeholders = reviewerIds.map((_: any, i: number) => `$${i + 1}`).join(', ')
    reviewers = await queryRows(
      `SELECT id, name, email, avatar_url AS "avatarUrl" FROM team_members WHERE id IN (${placeholders})`,
      reviewerIds,
    )
  }

  return {
    ...(project as any),
    reviewers,
    reviewComments,
  }
})
