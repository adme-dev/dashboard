/**
 * List all task labels
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined

  try {
    let sql: string
    let params: any[] = []

    if (departmentId) {
      // Get labels for specific department (includes global labels)
      sql = `
        SELECT tl.*, d.name as department_name,
          COUNT(tla.task_id) as usage_count
        FROM task_labels tl
        LEFT JOIN departments d ON tl.department_id = d.id
        LEFT JOIN task_label_assignments tla ON tl.id = tla.label_id
        WHERE tl.department_id IS NULL OR tl.department_id = $1
        GROUP BY tl.id, d.name
        ORDER BY tl.name
      `
      params = [departmentId]
    } else {
      // Get all labels
      sql = `
        SELECT tl.*, d.name as department_name,
          COUNT(tla.task_id) as usage_count
        FROM task_labels tl
        LEFT JOIN departments d ON tl.department_id = d.id
        LEFT JOIN task_label_assignments tla ON tl.id = tla.label_id
        GROUP BY tl.id, d.name
        ORDER BY tl.department_id NULLS FIRST, tl.name
      `
    }

    const labels = await queryRows(sql, params)

    return labels.map(l => ({
      id: l.id,
      departmentId: l.department_id,
      departmentName: l.department_name,
      name: l.name,
      color: l.color,
      description: l.description,
      createdAt: l.created_at,
      usageCount: Number(l.usage_count) || 0,
    }))
  } catch (error) {
    console.error('Failed to fetch labels:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch labels'
    })
  }
})
