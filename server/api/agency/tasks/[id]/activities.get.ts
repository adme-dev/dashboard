/**
 * Get task activity feed with pagination
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  // Pagination
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = Number(query.offset) || 0

  // Filter by activity type
  const activityType = query.type as string | undefined

  try {
    // Verify task exists
    const task = await queryOne('SELECT id FROM tasks WHERE id = $1', [id])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Build query with optional type filter
    let whereClause = 'WHERE ta.task_id = $1'
    const params: any[] = [id]
    let paramIdx = 2

    if (activityType) {
      whereClause += ` AND ta.activity_type = $${paramIdx}`
      params.push(activityType)
      paramIdx++
    }

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) as total
      FROM task_activities ta
      ${whereClause}
    `, params)

    // Get activities with user info
    const activities = await queryRows(`
      SELECT
        ta.id,
        ta.activity_type,
        ta.content,
        ta.old_value,
        ta.new_value,
        ta.created_at,
        ta.user_id,
        tm.name as user_name,
        tm.email as user_email
      FROM task_activities ta
      LEFT JOIN team_members tm ON ta.user_id = tm.id
      ${whereClause}
      ORDER BY ta.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, limit, offset])

    return {
      activities: activities.map(a => ({
        id: a.id,
        type: a.activity_type,
        content: a.content,
        oldValue: a.old_value ? JSON.parse(a.old_value) : null,
        newValue: a.new_value ? JSON.parse(a.new_value) : null,
        createdAt: a.created_at,
        user: a.user_id ? {
          id: a.user_id,
          name: a.user_name,
          email: a.user_email,
        } : null,
      })),
      pagination: {
        total: Number(countResult?.total) || 0,
        limit,
        offset,
        hasMore: offset + activities.length < Number(countResult?.total),
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch task activities:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch task activities'
    })
  }
})
