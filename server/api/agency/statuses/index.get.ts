/**
 * List all task statuses
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined
  const workspaceId = query.workspaceId as string | undefined

  try {
    let sql: string
    let params: any[] = []

    if (departmentId) {
      // Get statuses for specific department (includes global statuses)
      sql = `
        SELECT ts.*, d.name as department_name
        FROM task_statuses ts
        LEFT JOIN departments d ON ts.department_id = d.id
        WHERE ts.department_id IS NULL OR ts.department_id = $1
        ORDER BY ts.sort_order
      `
      params = [departmentId]
    } else if (workspaceId) {
      // Get statuses for all departments in a workspace (includes global statuses)
      sql = `
        SELECT ts.*, d.name as department_name
        FROM task_statuses ts
        LEFT JOIN departments d ON ts.department_id = d.id
        WHERE ts.department_id IS NULL OR ts.department_id IN (SELECT id FROM departments WHERE workspace_id = $1)
        ORDER BY ts.sort_order
      `
      params = [workspaceId]
    } else {
      // Get all statuses
      sql = `
        SELECT ts.*, d.name as department_name
        FROM task_statuses ts
        LEFT JOIN departments d ON ts.department_id = d.id
        ORDER BY ts.department_id NULLS FIRST, ts.sort_order
      `
    }

    const statuses = await queryRows(sql, params)

    return statuses.map(s => ({
      id: s.id,
      departmentId: s.department_id,
      departmentName: s.department_name,
      name: s.name,
      slug: s.slug,
      color: s.color,
      icon: s.icon,
      category: s.category,
      isDefault: s.is_default,
      isFinal: s.is_final,
      sortOrder: s.sort_order,
      createdAt: s.created_at,
    }))
  } catch (error) {
    console.error('Failed to fetch statuses:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch statuses'
    })
  }
})
