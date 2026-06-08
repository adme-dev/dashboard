import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { publishPost, type PublishableAccount, type PublishablePost } from '~~/server/utils/socialPublishing'

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
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const post = await queryOne<SocialPostRow>('SELECT * FROM social_posts WHERE id = $1', [id])
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

  // Guard: terminal / in-flight states can't be re-published.
  if (['published', 'publishing', 'cancelled'].includes(post.status)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot publish a ${post.status} post` })
  }
  // Require approval before publishing.
  if (post.status !== 'approved' && !post.approved_at) {
    throw createError({ statusCode: 400, statusMessage: 'Post must be approved before publishing' })
  }

  const accounts = await queryRows<PublishableAccount>(
    `SELECT id, platform, platform_account_id, access_token, refresh_token, token_expires_at, account_name, metadata
       FROM social_accounts
      WHERE id = ANY($1) AND client_id = $2 AND is_active = TRUE`,
    [post.account_ids ?? [], post.client_id]
  )

  await execute(
    `UPDATE social_posts SET status='publishing', last_attempt_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [id]
  )

  const outcome = await publishPost({ ...post, accounts })

  await execute(
    `UPDATE social_posts SET status=$2, platform_results=$3::jsonb,
       publish_attempts=publish_attempts+1,
       published_at=CASE WHEN $2 IN ('published','partially_published') THEN COALESCE(published_at, NOW()) ELSE published_at END,
       updated_at=NOW()
     WHERE id=$1`,
    [id, outcome.status, JSON.stringify(outcome.platformResults)]
  )

  return outcome
})
