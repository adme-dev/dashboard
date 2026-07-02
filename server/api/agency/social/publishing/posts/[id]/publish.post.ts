import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { publishPost, type PublishableAccount, type PublishablePost } from '~~/server/utils/socialPublishing'
import { recordSocialPublishingAudit } from '~~/server/utils/socialPublishing/audit'

interface SocialPostRow extends PublishablePost {
  status: string
  approved_at: string | null
  client_id: string
  account_ids: string[] | null
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

  const claimed = await queryOne<SocialPostRow>(
    `UPDATE social_posts
        SET status='publishing', last_attempt_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND client_id=$2 AND status = 'approved'
      RETURNING *`,
    [id, post.client_id]
  )
  if (!claimed) {
    throw createError({ statusCode: 409, statusMessage: 'Post is already being published or changed state' })
  }

  const accounts = await queryRows<PublishableAccount>(
    `SELECT id, platform, platform_account_id, access_token, refresh_token, token_expires_at, account_name, last_error, metadata
       FROM social_accounts
      WHERE id = ANY($1) AND client_id = $2 AND is_active = TRUE`,
    [claimed.account_ids ?? [], claimed.client_id]
  )

  const outcome = await publishPost({ ...claimed, accounts })

  await execute(
    `UPDATE social_posts SET status=$2, platform_results=$3::jsonb,
       publish_attempts=publish_attempts+1,
       published_at=CASE WHEN $2 IN ('published','partially_published') THEN COALESCE(published_at, NOW()) ELSE published_at END,
       updated_at=NOW()
     WHERE id=$1 AND client_id=$4`,
    [id, outcome.status, JSON.stringify(outcome.platformResults), claimed.client_id]
  )
  await recordSocialPublishingAudit({
    clientId: claimed.client_id,
    postId: id,
    actorId: user.id,
    action: 'post_published',
    metadata: {
      status: outcome.status,
      targets: Object.keys(outcome.platformResults)
    }
  })

  return outcome
})
