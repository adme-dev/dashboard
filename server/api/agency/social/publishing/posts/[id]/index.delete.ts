import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute, queryOneFresh } from '~~/server/utils/db'
import { requireSocialPostClientAccess } from '~~/server/utils/socialPublishing/guards'

/**
 * Reviewed (delegated) posts whose dispatch is in flight, held as unknown/accepted, or took effect keep
 * their post, revision and attempt evidence for read-back. The predicate is part of the DELETE itself,
 * so it is evaluated against the locked current row: a concurrent dispatch claim either commits first
 * (the row is then `publishing` and is kept) or finds the row already gone. Legacy posts keep their
 * existing delete behaviour.
 */
const RETAINED_EVIDENCE_PREDICATE = `
  AND (review_policy IS DISTINCT FROM 'delegated_marketing' OR (
    status NOT IN ('publishing', 'accepted', 'unknown', 'published', 'partially_published')
    AND NOT EXISTS (
      SELECT 1 FROM social_post_revisions r
       WHERE r.post_id = social_posts.id
         AND ((r.dispatch_claimed_at IS NOT NULL AND r.dispatch_outcome IS NULL)
              OR r.dispatch_outcome IN ('accepted', 'unknown', 'published', 'partially_published'))
    )
  ))`

/**
 * DELETE /api/agency/social/publishing/posts/:id
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const post = await requireSocialPostClientAccess(event, id)
  const deleted = await execute(
    `DELETE FROM social_posts WHERE id = $1 AND client_id = $2${RETAINED_EVIDENCE_PREDICATE}`,
    [id, post.client_id]
  )
  if (!deleted) {
    const remaining = await queryOneFresh<{ id: string }>(
      'SELECT id FROM social_posts WHERE id = $1 AND client_id = $2',
      [id, post.client_id]
    )
    if (remaining) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This reviewed post has a publishing attempt on record and is kept for read-back. It cannot be deleted.'
      })
    }
  }
  return { ok: true }
})
