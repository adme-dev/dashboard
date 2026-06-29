import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

/**
 * POST /api/agency/social/publishing/posts/:id/reject
 * Reject a post back to draft (MANAGEMENT) with a reason, and notify the requester.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)

  const post = await queryOne<any>(
    `WITH existing AS (
        SELECT id, content, approval_requested_by
          FROM social_posts
         WHERE id = $1
      )
      UPDATE social_posts p
         SET status = 'draft',
             rejection_reason = $2,
             approved_by = NULL,
             approved_at = NULL,
             approval_requested_at = NULL,
             approval_requested_by = NULL,
             updated_at = NOW()
        FROM existing
       WHERE p.id = existing.id
      RETURNING p.id, p.content, existing.approval_requested_by`,
    [id, b.reason ?? null],
  )
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

  if (post.approval_requested_by) {
    try {
      await createNotification({
        userId: post.approval_requested_by,
        type: 'approval_response',
        title: 'Social post needs changes',
        message: b.reason ? String(b.reason).slice(0, 120) : 'Your social post was rejected',
        link: `/agency/social/publishing/compose?edit=${id}`,
        actorId: user.id,
        reason: 'direct',
      })
    } catch (err) {
      console.error('[social] reject notification failed:', err)
    }
  }

  return { ok: true }
})
