/**
 * Get Custom Columns
 * GET /api/agency/columns
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const query_params = getQuery(event)
  const departmentId = query_params.departmentId as string | undefined
  const includeGlobal = query_params.includeGlobal !== 'false'

  const params: any[] = []
  const conditions: string[] = []

  if (departmentId) {
    if (includeGlobal) {
      params.push(departmentId)
      conditions.push(`(department_id = $${params.length} OR department_id IS NULL)`)
    } else {
      params.push(departmentId)
      conditions.push(`department_id = $${params.length}`)
    }
  }

  let sql = `
    SELECT
      cc.id,
      cc.department_id,
      d.name as department_name,
      cc.name,
      cc.slug,
      cc.column_type,
      cc.description,
      cc.settings,
      cc.is_visible,
      cc.is_required,
      cc.allowed_roles,
      cc.editable_roles,
      cc.width,
      cc.sort_order,
      cc.created_by,
      cc.created_at,
      cc.updated_at
    FROM custom_columns cc
    LEFT JOIN departments d ON cc.department_id = d.id
  `

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`
  }

  sql += ` ORDER BY cc.sort_order ASC, cc.name ASC`

  const columns = await queryRows(sql, params)

  // Filter columns based on user role if allowed_roles is set
  const userRole = user.user_role || 'member'

  return columns
    .filter(col => {
      // If no role restrictions, show to everyone
      if (!col.allowed_roles || col.allowed_roles.length === 0) return true
      // Check if user's role is in allowed roles
      return col.allowed_roles.includes(userRole) || userRole === 'admin' || userRole === 'owner'
    })
    .map(col => ({
      id: col.id,
      departmentId: col.department_id,
      departmentName: col.department_name,
      name: col.name,
      slug: col.slug,
      columnType: col.column_type,
      description: col.description,
      settings: col.settings || {},
      isVisible: col.is_visible,
      isRequired: col.is_required,
      allowedRoles: col.allowed_roles,
      editableRoles: col.editable_roles,
      width: col.width,
      sortOrder: col.sort_order,
      createdBy: col.created_by,
      createdAt: col.created_at,
      updatedAt: col.updated_at
    }))
})
