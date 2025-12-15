/**
 * Get User Saved Views
 * GET /api/agency/views/saved
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined

  const params: any[] = [user.id]
  let sql = `
    SELECT
      usv.id,
      usv.user_id,
      usv.department_id,
      d.name as department_name,
      usv.name,
      usv.view_type,
      usv.filters,
      usv.sort_config,
      usv.group_by,
      usv.visible_columns,
      usv.column_widths,
      usv.is_pinned,
      usv.created_at,
      usv.updated_at
    FROM user_saved_views usv
    LEFT JOIN departments d ON usv.department_id = d.id
    WHERE usv.user_id = $1
  `

  if (departmentId) {
    params.push(departmentId)
    sql += ` AND (usv.department_id = $${params.length} OR usv.department_id IS NULL)`
  }

  sql += ` ORDER BY usv.is_pinned DESC, usv.name ASC`

  const views = await queryRows(sql, params)

  return views.map(view => ({
    id: view.id,
    userId: view.user_id,
    departmentId: view.department_id,
    departmentName: view.department_name,
    name: view.name,
    viewType: view.view_type,
    filters: view.filters || {},
    sortConfig: view.sort_config || [],
    groupBy: view.group_by,
    visibleColumns: view.visible_columns,
    columnWidths: view.column_widths || {},
    isPinned: view.is_pinned,
    createdAt: view.created_at,
    updatedAt: view.updated_at
  }))
})
