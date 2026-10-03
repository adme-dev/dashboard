import { socialReviewVersionSql } from '~~/server/utils/socialPublishing/reviewVersion'
import { queryRowsFresh } from '~~/server/utils/db'
import { requireSocialClientScope } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/approvals?clientId=
 * Posts awaiting approval (requested, not yet approved). clientId optional.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string | undefined
  await requireSocialClientScope(event, clientId)
  const params: unknown[] = []
  let sql = `SELECT *, ${socialReviewVersionSql()} AS review_version FROM social_posts
              WHERE approval_requested_at IS NOT NULL AND approved_at IS NULL
                AND status = 'draft'`
  if (clientId) {
    params.push(clientId)
    sql += ` AND client_id = $${params.length}`
  }
  sql += ` ORDER BY approval_requested_at ASC`
  return await queryRowsFresh(sql, params)
})
