/**
 * Get brief activity feed
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Brief ID is required'
    })
  }

  try {
    // Verify brief exists
    const brief = await queryOne('SELECT id FROM briefs WHERE id = $1', [id])
    if (!brief) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Brief not found'
      })
    }

    const activities = await queryRows(`
      SELECT
        ba.id,
        ba.brief_id,
        ba.user_id,
        ba.activity_type,
        ba.old_value,
        ba.new_value,
        ba.content,
        ba.created_at,
        tm.name AS user_name,
        tm.email AS user_email
      FROM brief_activities ba
      LEFT JOIN team_members tm ON ba.user_id = tm.id
      WHERE ba.brief_id = $1
      ORDER BY ba.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset])

    return activities.map(a => ({
      id: a.id,
      briefId: a.brief_id,
      userId: a.user_id,
      activityType: a.activity_type,
      oldValue: a.old_value,
      newValue: a.new_value,
      content: a.content,
      createdAt: a.created_at,
      user: a.user_id ? {
        id: a.user_id,
        name: a.user_name,
        email: a.user_email
      } : null
    }))
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch brief activities:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch brief activities'
    })
  }
})
