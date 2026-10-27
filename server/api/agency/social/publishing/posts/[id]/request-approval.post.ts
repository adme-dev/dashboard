import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { createBulkNotifications } from '~~/server/utils/notifications'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'
import { recordSocialNewsFeedback } from '~~/server/utils/socialNewsFeedback'

interface ApprovalRequestPost {
  id: string
  content: string | null
  client_id: string
  metadata: { source?: string, newsItemId?: string } | null
}

/**
 * POST /api/agency/social/publishing/posts/:id/request-approval
 * Mark a post as awaiting approval and notify MANAGEMENT-permission users.
 *
 * Delegated drafts and client-portal (news) drafts freeze an immutable revision here so the internal
 * and client decisions bind to the exact submitted content. A delegated submission also requires the
 * submitter's fresh social_draft grant and client assignment (they become the revision's requester).
 * Other legacy posts keep their existing request flow.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const existing = await requireSocialPostClientAccess(event, id)
  const delegated = existing.review_policy === 'delegated_marketing'
  const isNews = existing.metadata?.source === 'mcp_news'

  let post: ApprovalRequestPost | null
  let revisionId: string | null = null
  if (delegated || isNews) {
    if (delegated) {
      const { assertMarketingCapabilityAtBoundary } = await import('~~/server/utils/ai/marketing/reviewAuthority')
      await assertMarketingCapabilityAtBoundary(event, user.id, existing.client_id, 'social_draft')
    }
    const { submitSocialPostForReview } = await import('~~/server/utils/socialPublishing/revisions')
    const submitted = await transaction(async db => await submitSocialPostForReview(db, {
      event,
      postId: id,
      requesterId: user.id,
      clientIds: [existing.client_id]
    }))
    revisionId = submitted.revision.id
    post = {
      id: submitted.post.id,
      client_id: submitted.post.client_id,
      content: submitted.revision.snapshot.content,
      metadata: submitted.post.metadata as ApprovalRequestPost['metadata']
    }
  } else {
    post = await queryOne<ApprovalRequestPost>(
      `UPDATE social_posts
          SET approval_requested_at = NOW(), approval_requested_by = $2,
              client_approval_status = CASE
                WHEN metadata->>'source' = 'mcp_news' THEN 'pending'
                ELSE client_approval_status
              END,
              client_approval_responded_by = CASE WHEN metadata->>'source' = 'mcp_news' THEN NULL ELSE client_approval_responded_by END,
              client_approval_responded_at = NULL,
              client_approval_feedback = CASE WHEN metadata->>'source' = 'mcp_news' THEN NULL ELSE client_approval_feedback END,
              due_at = (
                SELECT CASE WHEN (v.commercial_scope->>'approvalSlaHours') ~ '^[0-9]+$'
                  THEN NOW() + ((v.commercial_scope->>'approvalSlaHours')::int * INTERVAL '1 hour')
                  ELSE NULL END
                  FROM social_content_package_assignments a
                  JOIN social_content_package_versions v ON v.id = a.package_version_id
                 WHERE a.id::text = social_posts.metadata->>'socialPackageAssignmentId'
              ), updated_at = NOW()
        WHERE id = $1 AND client_id = $3 RETURNING id, content, client_id, metadata`,
      [id, user.id, existing.client_id]
    )
  }
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'approval_requested',
    metadata: revisionId ? { revisionId } : undefined
  })
  if (post.metadata?.source === 'mcp_news' && post.metadata.newsItemId) {
    await recordSocialNewsFeedback({
      clientId: existing.client_id,
      newsItemId: post.metadata.newsItemId,
      postId: id,
      actorId: user.id,
      eventType: 'approval_requested',
      metadata: { source: 'agency' },
    })
  }

  // Notify reviewers (best-effort — never block the request on notification failure). Delegated
  // work is reviewed by owners/admins only, never by its own requester.
  try {
    const managers = await queryRows<{ id: string }>(
      `SELECT id FROM team_members WHERE role = ANY($1)`,
      [delegated ? PERMISSIONS.ADMIN : PERMISSIONS.MANAGEMENT]
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

  return revisionId ? { ok: true, revisionId } : { ok: true }
})
