/**
 * Submit a banner project for review
 * POST /api/agency/banner-studio/reviews/submit
 * Body: { projectId, reviewerIds: string[] }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_review'],
  changes_requested: ['in_review'],
  approved: ['in_review'], // Can re-submit after approval
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { projectId, reviewerIds } = body as {
    projectId: string
    reviewerIds: string[]
  }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  if (!reviewerIds?.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one reviewer is required' })
  }

  // Get current project status
  const project = await queryOne(
    'SELECT id, review_status AS "reviewStatus" FROM banner_projects WHERE id = $1',
    [projectId],
  )

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const currentStatus = (project as any).reviewStatus || 'draft'
  const allowedNext = VALID_TRANSITIONS[currentStatus]

  if (!allowedNext?.includes('in_review')) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot submit for review from status "${currentStatus}"`,
    })
  }

  const updated = await queryOne(`
    UPDATE banner_projects
    SET review_status = 'in_review',
        reviewers = $2,
        updated_at = now()
    WHERE id = $1
    RETURNING
      id, review_status AS "reviewStatus", reviewers,
      updated_at AS "updatedAt"
  `, [projectId, reviewerIds])

  return updated
})
