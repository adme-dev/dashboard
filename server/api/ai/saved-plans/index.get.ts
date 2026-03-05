import { getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

export default eventHandler(async (event) => {
  const user = requireAuth(event)
  const tenantId = getSelectedTenant(event)
  const { status } = getQuery(event)

  const statusFilter = status && status !== 'all' ? String(status) : null

  const rows = await queryRows(
    `SELECT id, source_type, source_title, source_description, source_severity, source_category,
            plan_data, note, status, created_at, updated_at
     FROM saved_action_plans
     WHERE user_id = $1
       AND ($2 IS NULL OR tenant_id = $2::uuid)
       AND ($3 IS NULL OR status = $3)
     ORDER BY
       CASE status WHEN 'active' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT 50`,
    [user.id, tenantId || null, statusFilter]
  )

  return rows
})
