import { queryOneFresh } from '~~/server/utils/db'
import { requireDepartmentBrowserReviewScope } from '~~/server/utils/ai/marketing/departmentReviewOperations'

/**
 * GET /api/agency/social/publishing/approvals/badge?clientId=
 * Count of posts awaiting approval (for the nav badge). clientId optional.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string | undefined
  const { user, departmentContext } = await requireDepartmentBrowserReviewScope(event, clientId)
  const params: any[] = []
  let sql = `SELECT COUNT(*)::int AS count FROM social_posts
              WHERE approval_requested_at IS NOT NULL AND approved_at IS NULL
                AND status NOT IN ('cancelled','published')`
  if (departmentContext) {
    params.push(user.id)
    sql += ` AND review_policy='delegated_marketing' AND created_by IS DISTINCT FROM $1
      AND EXISTS (SELECT 1 FROM agency_clients c WHERE c.id=social_posts.client_id AND c.is_active=TRUE)
      AND EXISTS (SELECT 1 FROM social_post_revisions r WHERE r.id=social_posts.current_revision_id
        AND r.post_id=social_posts.id AND r.client_id=social_posts.client_id AND r.requested_by<>$1)`
    if (departmentContext.assistantScope?.clientAccessMode !== 'all_active') {
      params.push(departmentContext.assistantScope?.assignedClientIds ?? [])
      sql += ` AND client_id=ANY($${params.length}::uuid[])`
    }
  }
  if (clientId) {
    params.push(clientId)
    sql += ` AND client_id = $${params.length}`
  }
  const row = await queryOneFresh<{ count: number }>(sql, params)
  return { count: row?.count ?? 0 }
})
