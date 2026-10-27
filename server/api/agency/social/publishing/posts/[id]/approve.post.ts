import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'
import { startSocialPublishingWorkflow } from '~~/server/utils/agencyWorkflows/client'
import { recordSocialNewsFeedback } from '~~/server/utils/socialNewsFeedback'

interface ApprovedPost {
  id: string
  content: string | null
  approval_requested_by: string | null
  status: string | null
  scheduled_at: string | null
  approved_revision_id?: string | null
}

/**
 * POST /api/agency/social/publishing/posts/:id/approve   body: { revisionId? }
 * Approve a post (MANAGEMENT) and notify the requester.
 *
 * Delegated (staff/MCP) posts require `revisionId`, a freshly authorized owner/admin who is neither the
 * requester nor the draft creator, and an exact match between the current post and the submitted
 * revision (content hash, reviewed media bytes, unexpired, still pending). Legacy posts keep the
 * existing MANAGEMENT approval; a client-portal draft additionally needs the client decision on the
 * current revision.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const existing = await requireSocialPostClientAccess(event, id)
  const requestedRevisionId = await optionalRevisionId(event)

  let post: ApprovedPost | null
  let revisionId: string | null = null
  if (existing.review_policy === 'delegated_marketing') {
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
      decision: 'approved',
      reviewerId: user.id
    }))
    revisionId = reviewed.revision?.id ?? null
    post = { ...reviewed.post, approved_revision_id: revisionId }
  } else {
    if (existing.status !== 'draft') {
      throw createError({ statusCode: 409, statusMessage: 'Only draft posts can be approved' })
    }
    if (requestedRevisionId && requestedRevisionId !== existing.current_revision_id) {
      throw createError({ statusCode: 409, statusMessage: 'This revision is no longer current.' })
    }
    if (existing.metadata?.source === 'mcp_news' && existing.client_approval_status !== 'approved') {
      throw createError({ statusCode: 409, statusMessage: 'Client approval is required before internal approval' })
    }
    if (existing.metadata?.source === 'mcp_news' && existing.current_revision_id
      && existing.client_approval_revision_id !== existing.current_revision_id) {
      throw createError({ statusCode: 409, statusMessage: 'Client approval covers a different revision. Request client approval again.' })
    }

    // One statement: the post approval and (when submitted) its pending revision decision commit together.
    post = await queryOne<ApprovedPost>(
      `WITH approved AS (
         UPDATE social_posts
            SET status = CASE
                  WHEN scheduled_at IS NOT NULL AND scheduled_at > NOW() THEN 'scheduled'
                  ELSE 'approved'
                END,
                approved_by = $2,
                approved_at = NOW(),
                approved_revision_id = CASE
                  WHEN EXISTS (SELECT 1 FROM social_post_revisions r WHERE r.id = social_posts.current_revision_id AND r.review_status = 'pending')
                  THEN current_revision_id ELSE NULL END,
                rejection_reason = NULL, updated_at = NOW()
          WHERE id = $1 AND client_id = $3 AND status = 'draft'
            AND review_policy IS DISTINCT FROM 'delegated_marketing'
            AND ($4::uuid IS NULL OR current_revision_id = $4::uuid)
            AND (metadata->>'source' IS DISTINCT FROM 'mcp_news' OR current_revision_id IS NULL
                 OR client_approval_revision_id = current_revision_id)
          RETURNING id, content, approval_requested_by, status, scheduled_at, approved_revision_id, client_id
       ), decided AS (
         UPDATE social_post_revisions r
            SET review_status = 'approved', reviewed_by = $2, reviewed_at = NOW()
           FROM approved
          WHERE r.id = approved.approved_revision_id AND r.post_id = approved.id
            AND r.client_id = approved.client_id AND r.review_status = 'pending'
          RETURNING r.id
       )
       SELECT approved.id, approved.content, approved.approval_requested_by, approved.status,
              approved.scheduled_at, approved.approved_revision_id
         FROM approved`,
      [id, user.id, existing.client_id, requestedRevisionId]
    )
    revisionId = post?.approved_revision_id ?? null
  }
  if (!post) throw createError({ statusCode: 409, statusMessage: 'Post changed state before approval' })
  await recordSocialPublishingAudit({
    clientId: existing.client_id,
    postId: id,
    actorId: user.id,
    action: 'post_approved',
    metadata: revisionId ? { revisionId } : undefined
  })
  const newsItemId = (existing as { metadata?: { newsItemId?: string } }).metadata?.newsItemId
  if (newsItemId) {
    await recordSocialNewsFeedback({ clientId: existing.client_id, newsItemId, postId: id, actorId: user.id, eventType: 'approved', metadata: { status: post.status } })
  }

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

  if (post.status === 'scheduled' && post.scheduled_at) {
    await startSocialPublishingWorkflow(event, {
      postId: id,
      clientId: existing.client_id,
      scheduledAt: post.scheduled_at,
      trigger: 'schedule',
      requestedBy: user.id,
      ...(revisionId ? { revisionId } : {})
    })
  }

  return revisionId ? { ok: true, revisionId } : { ok: true }
})

async function optionalRevisionId(event: Parameters<typeof getRouterParam>[0]): Promise<string | null> {
  let body: { revisionId?: unknown } | null = null
  try {
    body = await readBody(event)
  } catch {
    body = null
  }
  return typeof body?.revisionId === 'string' && body.revisionId ? body.revisionId : null
}
