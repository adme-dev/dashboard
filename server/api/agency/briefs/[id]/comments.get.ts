/**
 * Get brief comments
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const includeInternal = query.includeInternal === 'true'

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

    // Get comments
    let whereClause = 'WHERE bc.brief_id = $1 AND bc.parent_id IS NULL'
    if (!includeInternal) {
      whereClause += ' AND bc.is_internal = false'
    }

    const comments = await queryRows(`
      SELECT
        bc.id,
        bc.brief_id,
        bc.parent_id,
        bc.user_id,
        bc.content,
        bc.is_internal,
        bc.is_resolution,
        bc.created_at,
        bc.updated_at,
        tm.name AS user_name,
        tm.email AS user_email,
        tm.avatar_url AS user_avatar
      FROM brief_comments bc
      LEFT JOIN team_members tm ON bc.user_id = tm.id
      ${whereClause}
      ORDER BY bc.created_at ASC
    `, [id])

    // Get replies for each comment
    for (const comment of comments) {
      let repliesWhere = 'WHERE bc.parent_id = $1'
      if (!includeInternal) {
        repliesWhere += ' AND bc.is_internal = false'
      }

      const replies = await queryRows(`
        SELECT
          bc.id,
          bc.brief_id,
          bc.parent_id,
          bc.user_id,
          bc.content,
          bc.is_internal,
          bc.is_resolution,
          bc.created_at,
          bc.updated_at,
          tm.name AS user_name,
          tm.email AS user_email,
          tm.avatar_url AS user_avatar
        FROM brief_comments bc
        LEFT JOIN team_members tm ON bc.user_id = tm.id
        ${repliesWhere}
        ORDER BY bc.created_at ASC
      `, [comment.id])

      comment.replies = replies.map(r => ({
        id: r.id,
        briefId: r.brief_id,
        parentId: r.parent_id,
        userId: r.user_id,
        content: r.content,
        isInternal: r.is_internal,
        isResolution: r.is_resolution,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        user: r.user_id ? {
          id: r.user_id,
          name: r.user_name,
          email: r.user_email,
          avatarUrl: r.user_avatar
        } : null
      }))
    }

    return comments.map(c => ({
      id: c.id,
      briefId: c.brief_id,
      parentId: c.parent_id,
      userId: c.user_id,
      content: c.content,
      isInternal: c.is_internal,
      isResolution: c.is_resolution,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      user: c.user_id ? {
        id: c.user_id,
        name: c.user_name,
        email: c.user_email,
        avatarUrl: c.user_avatar
      } : null,
      replies: c.replies || []
    }))
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch brief comments:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch brief comments'
    })
  }
})
