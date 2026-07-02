import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { claimAndPublishSocialPost } from '~~/server/utils/socialPublishing/dispatch'

interface SocialPostRow {
  id: string
  status: string
  approved_at: string | null
  client_id: string
}

/**
 * POST /api/agency/social/publishing/posts/:id/publish
 * Publish an approved post immediately across its platforms.
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

  const dispatch = await claimAndPublishSocialPost({
    postId: id,
    clientId: post.client_id,
    claimStatuses: ['approved'],
    source: 'manual',
    actorId: user.id,
    auditAction: 'post_published'
  })
  if (dispatch.skipped) {
    throw createError({ statusCode: 409, statusMessage: 'Post is already being published or changed state' })
  }

  return {
    status: dispatch.status,
    platformResults: dispatch.platformResults
  }
})
