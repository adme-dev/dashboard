import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

interface RejectedPost {
  id: string
  content: string | null
  approval_requested_by: string | null
}

/**
 * POST /api/agency/social/publishing/posts/:id/reject   body: { reason, revisionId? }
 * Reject a post back to draft (MANAGEMENT) with a reason, and notify the requester.
 *
 * Delegated posts require the exact pending `revisionId` and the same independent owner/admin reviewer
 * rule as approval; the rejected snapshot is preserved for audit. Legacy posts keep their existing
 * rejection, also closing any pending submitted revision.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const b = await readBody(event)
  const existing = await requireSocialPostClientAccess(event, id)

  let post: RejectedPost | null
  let revisionId: string | null = null
  if (existing.review_policy === 'delegated_marketing') {
    const requestedRevisionId = typeof b?.revisionId === 'string' && b.revisionId ? b.revisionId : null
    if (!requestedRevisionId) throw createError({ statusCode: 400, statusMessage: 'revisionId required' })
    const [{ requireIndependentMarketingReviewer }, { reviewSocialPostRevision }, { transaction }] = await Promise.all([
      import('~~/server/utils/ai/marketing/reviewAuthority'),
      import('~~/server/utils/socialPublishing/revisions'),
      import('~~/server/utils/db')
    ])
    const revision = await queryOne<{ requested_by: string }>(
      'SELECT requested_by FROM social_post_revisions WHERE id = $1 AND post_id = $2 AND client_id = $3',
      [requestedRevisionId, id, existing.client_id]
    )
    if (!revision) throw createError({ statusCode: 409, statusMessage: 'This revision is no longer current.' })
    for (const requesterId of [revision.requested_by, existing.created_by].filter((value): value is string => !!value)) {
      await requireIndependentMarketingReviewer(event, { requesterId, clientId: existing.client_id, reviewerId: user.id })
    }
    const reviewed = await transaction(async db => await reviewSocialPostRevision(db, {
      event,
      postId: id,
      revisionId: requestedRevisionId,
      decision: 'rejected',
      reason: typeof b?.reason === 'string' ? b.reason : null,
      reviewerId: user.id
    }))
    revisionId = reviewed.revision?.id ?? null
    post = { id, content: reviewed.post.content, approval_requested_by: reviewed.post.approval_requested_by }
  } else {
    post = await queryOne<RejectedPost>(
      `WITH existing AS (
          SELECT id, content, approval_requested_by, current_revision_id
            FROM social_posts
           WHERE id = $1 AND client_id = $3
        ), closed AS (
          UPDATE social_post_revisions r
             SET review_status = 'rejected', reviewed_by = $4, reviewed_at = NOW(), review_reason = $2
            FROM existing
           WHERE r.id = existing.current_revision_id AND r.post_id = existing.id
             AND r.client_id = $3 AND r.review_status = 'pending'
          RETURNING r.id
        )
        UPDATE social_posts p
           SET status = 'draft',
               rejection_reason = $2,
               approved_by = NULL,
               approved_at = NULL,
               approved_revision_id = NULL,
               approval_requested_at = NULL,
               approval_requested_by = NULL,
               updated_at = NOW()
          FROM existing
         WHERE p.id = existing.id AND p.client_id = $3
           AND p.review_policy IS DISTINCT FROM 'delegated_marketing'
        RETURNING p.id, p.content, existing.approval_requested_by`,
      [id, b.reason ?? null, existing.client_id, user.id]
    )
  }
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'post_rejected',
    metadata: { hasReason: Boolean(b?.reason), ...(revisionId ? { revisionId } : {}) }
  })

  if (post.approval_requested_by) {
    try {
      await createNotification({
        userId: post.approval_requested_by,
        type: 'approval_response',
        title: 'Social post needs changes',
        message: b?.reason ? String(b.reason).slice(0, 120) : 'Your social post was rejected',
        link: `/agency/social/publishing/compose?edit=${id}`,
        actorId: user.id,
        reason: 'direct'
      })
    } catch (err) {
      console.error('[social] reject notification failed:', err)
    }
  }

  return { ok: true }
})
