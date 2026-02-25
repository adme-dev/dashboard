import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/spend/:id/history
 * Returns budget change history for a media_spend row (last 20 entries)
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const rows = await queryRows<{
    id: string
    previous_budget: string
    new_budget: string
    changed_by: string
    changed_by_name: string
    changed_by_avatar: string | null
    changed_at: string
    note: string | null
  }>(
    `SELECT bal.id,
            bal.previous_budget::text,
            bal.new_budget::text,
            bal.changed_by,
            tm.name as changed_by_name,
            tm.avatar_url as changed_by_avatar,
            bal.changed_at::text,
            bal.note
     FROM budget_audit_log bal
     JOIN team_members tm ON tm.id = bal.changed_by
     WHERE bal.media_spend_id = $1
     ORDER BY bal.changed_at DESC
     LIMIT 20`,
    [id]
  )

  return rows.map(r => ({
    id: r.id,
    previousBudget: parseFloat(r.previous_budget),
    newBudget: parseFloat(r.new_budget),
    changedBy: r.changed_by,
    changedByName: r.changed_by_name,
    changedByAvatar: r.changed_by_avatar,
    changedAt: r.changed_at,
    note: r.note,
  }))
})
