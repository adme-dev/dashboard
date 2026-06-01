import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'

/**
 * POST /api/agency/social/publishing/posts/:id/approve
 * Approve a post (MANAGEMENT) and notify the requester.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const post = await queryOne<any>(
    `UPDATE social_posts
        SET status = 'approved', approved_by = $2, approved_at = NOW(),
            rejection_reason = NULL, updated_at = NOW()
      WHERE id = $1 RETURNING id, content, approval_requested_by`,
    [id, user.id],
  )
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

  if (post.approval_requested_by) {
    try {
      await createNotification({
        userId: post.approval_requested_by,
        type: 'approval_response',
        title: 'Social post approved',
        message: (post.content || 'Your social post').slice(0, 120),
        link: `/agency/social/compose?edit=${id}`,
        actorId: user.id,
        reason: 'approval',
      })
    } catch (err) {
      console.error('[social] approve notification failed:', err)
    }
  }

  return { ok: true }
})
