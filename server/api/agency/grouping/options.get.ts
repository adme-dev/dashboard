/**
 * Get Board Grouping Options
 * GET /api/agency/grouping/options
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined

  const params: any[] = []
  let sql = `
    SELECT
      bgo.id,
      bgo.department_id,
      d.name as department_name,
      bgo.group_by,
      bgo.display_name,
      bgo.sort_order,
      bgo.is_enabled,
      bgo.config,
      bgo.created_at
    FROM board_grouping_options bgo
    LEFT JOIN departments d ON bgo.department_id = d.id
    WHERE bgo.is_enabled = true
  `

  if (departmentId) {
    params.push(departmentId)
    sql += ` AND (bgo.department_id = $${params.length} OR bgo.department_id IS NULL)`
  }

  sql += ` ORDER BY bgo.sort_order ASC, bgo.display_name ASC`

  const options = await queryRows(sql, params)

  return options.map(opt => ({
    id: opt.id,
    departmentId: opt.department_id,
    departmentName: opt.department_name,
    groupBy: opt.group_by,
    displayName: opt.display_name,
    sortOrder: opt.sort_order,
    isEnabled: opt.is_enabled,
    config: opt.config || {},
    createdAt: opt.created_at
  }))
})
