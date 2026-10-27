import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { claimAndPublishSocialPost } from '~~/server/utils/socialPublishing/dispatch'
import { recordSocialNewsFeedback } from '~~/server/utils/socialNewsFeedback'

interface SocialPostRow {
  id: string
  status: string
  approved_at: string | null
  client_id: string
  created_by?: string | null
  review_policy?: string | null
  approved_revision_id?: string | null
}

/**
 * POST /api/agency/social/publishing/posts/:id/publish
 * Publish an approved post immediately across its platforms.
 *
 * Delegated (staff/MCP) posts publish only their approved, unexpired, unclaimed revision, and only when
 * triggered by a freshly authorized owner/admin other than the requester — a staff member cannot
 * self-trigger dispatch. There is no MCP route to this endpoint.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const post = await queryOne<SocialPostRow>('SELECT * FROM social_posts WHERE id = $1', [id])
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  await requireSocialClientAccess(event, post.client_id)

  // Guard: terminal / in-flight states can't be re-published.
  if (['published', 'publishing', 'cancelled'].includes(post.status)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot publish a ${post.status} post` })
  }
  // Require approval before publishing.
  if (post.status !== 'approved') {
    throw createError({ statusCode: 400, statusMessage: 'Post must be approved before publishing' })
  }

  let revisionId: string | null = null
  if (post.review_policy === 'delegated_marketing') {
    revisionId = post.approved_revision_id ?? null
    if (!revisionId) throw createError({ statusCode: 409, statusMessage: 'Post has no approved revision' })
    const { requireIndependentMarketingReviewer } = await import('~~/server/utils/ai/marketing/reviewAuthority')
    const revision = await queryOne<{ requested_by: string }>(
      'SELECT requested_by FROM social_post_revisions WHERE id = $1 AND post_id = $2 AND client_id = $3',
      [revisionId, id, post.client_id]
    )
    if (!revision) throw createError({ statusCode: 409, statusMessage: 'Post has no approved revision' })
    for (const requesterId of [revision.requested_by, post.created_by].filter((value): value is string => !!value)) {
      await requireIndependentMarketingReviewer(event, { requesterId, clientId: post.client_id, reviewerId: user.id })
    }
  }

  const dispatch = await claimAndPublishSocialPost({
    postId: id,
    clientId: post.client_id,
    claimStatuses: ['approved'],
    source: 'manual',
    actorId: user.id,
    auditAction: 'post_published',
    event,
    revisionId
  })
  if (dispatch.skipped) {
    throw createError({ statusCode: 409, statusMessage: 'Post is already being published or changed state' })
  }
  const metadata = (post as SocialPostRow & { metadata?: { newsItemId?: string } }).metadata
  if (metadata?.newsItemId) {
    await recordSocialNewsFeedback({
      clientId: post.client_id,
      newsItemId: metadata.newsItemId,
      postId: id,
      actorId: user.id,
      eventType: dispatch.status === 'published' ? 'published' : 'failed',
      metadata: { platformResults: dispatch.platformResults },
    })
  }

  return {
    status: dispatch.status,
    platformResults: dispatch.platformResults
  }
})
