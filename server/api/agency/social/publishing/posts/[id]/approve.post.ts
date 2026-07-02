import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

interface ApprovedPost {
  id: string
  content: string | null
  approval_requested_by: string | null
}

/**
 * POST /api/agency/social/publishing/posts/:id/approve
 * Approve a post (MANAGEMENT) and notify the requester.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const existing = await requireSocialPostClientAccess(event, id)

  const post = await queryOne<ApprovedPost>(
    `UPDATE social_posts
        SET status = CASE
              WHEN scheduled_at IS NOT NULL AND scheduled_at > NOW() THEN 'scheduled'
              ELSE 'approved'
            END,
            approved_by = $2,
            approved_at = NOW(),
            rejection_reason = NULL, updated_at = NOW()
      WHERE id = $1 AND client_id = $3 RETURNING id, content, approval_requested_by`,
    [id, user.id, existing.client_id]
  )
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'post_approved'
  })

  if (post.approval_requested_by) {
    try {
      await createNotification({
        userId: post.approval_requested_by,
        type: 'approval_response',
        title: 'Social post approved',
        message: (post.content || 'Your social post').slice(0, 120),
        link: `/agency/social/publishing/compose?edit=${id}`,
        actorId: user.id,
        reason: 'direct'
      })
    } catch (err) {
      console.error('[social] approve notification failed:', err)
    }
  }

  return { ok: true }
})
