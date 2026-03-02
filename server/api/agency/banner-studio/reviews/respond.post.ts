/**
 * Reviewer responds to a banner review
 * POST /api/agency/banner-studio/reviews/respond
 * Body: { projectId, action: 'approve' | 'request_changes', comment?: string }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const body = await readBody(event)
  const { projectId, action, comment } = body as {
    projectId: string
    action: 'approve' | 'request_changes'
    comment?: string
  }

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  if (!['approve', 'request_changes'].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: 'action must be "approve" or "request_changes"' })
  }

  // Verify project is in_review
  const project = await queryOne(
    'SELECT id, review_status AS "reviewStatus", reviewers FROM banner_projects WHERE id = $1',
    [projectId],
  )

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  if ((project as any).reviewStatus !== 'in_review') {
    throw createError({ statusCode: 400, statusMessage: 'Project is not in review' })
  }

  const newStatus = action === 'approve' ? 'approved' : 'changes_requested'

  const updated = await queryOne(`
    UPDATE banner_projects
    SET review_status = $2,
        updated_at = now()
    WHERE id = $1
    RETURNING
      id, review_status AS "reviewStatus", reviewers,
      updated_at AS "updatedAt"
  `, [projectId, newStatus])

  // If there's a comment, add it as a banner_comment (global, not pinned)
  if (comment?.trim()) {
    await queryOne(`
      INSERT INTO banner_comments (project_id, format_key, x, y, text, user_id)
      VALUES ($1, '__review__', 0, 0, $2, $3)
      RETURNING id
    `, [projectId, `[${action === 'approve' ? 'Approved' : 'Changes Requested'}] ${comment.trim()}`, user.id])
  }

  return updated
})
