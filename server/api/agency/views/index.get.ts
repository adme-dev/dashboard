/**
 * Get Board Views
 * GET /api/agency/views
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined
  const viewType = query.viewType as string | undefined

  const params: any[] = []
  const conditions: string[] = []

  if (departmentId) {
    params.push(departmentId)
    conditions.push(`(bv.department_id = $${params.length} OR bv.department_id IS NULL)`)
  }

  if (viewType) {
    params.push(viewType)
    conditions.push(`bv.view_type = $${params.length}`)
  }

  // Only show public views or views created by the user
  params.push(user.id)
  conditions.push(`(bv.is_public = true OR bv.created_by = $${params.length})`)

  let sql = `
    SELECT
      bv.id,
      bv.department_id,
      d.name as department_name,
      bv.name,
      bv.view_type,
      bv.is_default,
      bv.is_public,
      bv.created_by,
      tm.name as created_by_name,
      bv.config,
      bv.sort_order,
      bv.created_at,
      bv.updated_at
    FROM board_views bv
    LEFT JOIN departments d ON bv.department_id = d.id
    LEFT JOIN team_members tm ON bv.created_by = tm.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY bv.is_default DESC, bv.sort_order ASC, bv.name ASC
  `

  const views = await queryRows(sql, params)

  return views.map(view => ({
    id: view.id,
    departmentId: view.department_id,
    departmentName: view.department_name,
    name: view.name,
    viewType: view.view_type,
    isDefault: view.is_default,
    isPublic: view.is_public,
    createdBy: view.created_by,
    createdByName: view.created_by_name,
    config: view.config || {},
    sortOrder: view.sort_order,
    createdAt: view.created_at,
    updatedAt: view.updated_at
  }))
})
