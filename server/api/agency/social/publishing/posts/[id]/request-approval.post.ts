import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows } from '~~/server/utils/db'
import { createBulkNotifications } from '~~/server/utils/notifications'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

interface ApprovalRequestPost {
  id: string
  content: string | null
  client_id: string
}

/**
 * POST /api/agency/social/publishing/posts/:id/request-approval
 * Mark a post as awaiting approval and notify MANAGEMENT-permission users.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const existing = await requireSocialPostClientAccess(event, id)

  const post = await queryOne<ApprovalRequestPost>(
    `UPDATE social_posts
        SET approval_requested_at = NOW(), approval_requested_by = $2, updated_at = NOW()
      WHERE id = $1 AND client_id = $3 RETURNING id, content, client_id`,
    [id, user.id, existing.client_id]
  )
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'approval_requested'
  })

  // Notify managers (best-effort — never block the request on notification failure).
  try {
    const managers = await queryRows<{ id: string }>(
      `SELECT id FROM team_members WHERE role = ANY($1)`,
      [PERMISSIONS.MANAGEMENT]
    )
    await createBulkNotifications(
      managers.map(m => m.id).filter(uid => uid !== user.id),
      {
        type: 'approval_requested',
        title: 'Social post awaiting approval',
        message: (post.content || 'A social post').slice(0, 120),
        link: `/agency/social/publishing/approvals`,
        actorId: user.id,
        reason: 'direct'
      }
    )
  } catch (err) {
    console.error('[social] approval-request notification failed:', err)
  }

  return { ok: true }
})
