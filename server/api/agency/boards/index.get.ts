/**
 * Get All Boards (Departments)
 * GET /api/agency/boards
 */

import { createError } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryRows } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  try {
    // Get all departments with task counts
    const boards = await queryRows(`
      SELECT
        d.id,
        d.name,
        d.color,
        d.slug,
        d.description,
        d.icon,
        COUNT(t.id) as task_count,
        COUNT(t.id) FILTER (WHERE ts.category = 'in_progress') as in_progress_count,
        COUNT(t.id) FILTER (WHERE ts.category = 'done') as completed_count,
        MAX(t.updated_at) as last_activity
      FROM departments d
      LEFT JOIN tasks t ON t.department_id = d.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.color, d.slug, d.description, d.icon
      ORDER BY d.sort_order, d.name
    `)

    return {
      boards: boards.map(b => ({
        id: b.id,
        name: b.name,
        color: b.color,
        slug: b.slug,
        description: b.description,
        icon: b.icon,
        stats: {
          total: parseInt(b.task_count) || 0,
          inProgress: parseInt(b.in_progress_count) || 0,
          completed: parseInt(b.completed_count) || 0
        },
        lastActivity: b.last_activity
      }))
    }
  } catch (error: any) {
    console.error('Failed to fetch boards:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch boards: ${error.message}`
    })
  }
})
