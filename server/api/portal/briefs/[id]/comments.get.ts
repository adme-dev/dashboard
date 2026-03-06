/**
 * Client Portal - Get brief comments (non-internal only)
 * GET /api/portal/briefs/:id/comments
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Brief ID is required' })
  }

  try {
    // Verify brief belongs to client
    const brief = await queryOne(
      'SELECT id FROM briefs WHERE id = $1 AND client_id = $2',
      [id, clientUser.clientId]
    )

    if (!brief) {
      throw createError({ statusCode: 404, statusMessage: 'Brief not found' })
    }

    // CRITICAL: Only non-internal comments — never leak internal comments to clients
    const comments = await queryRows(`
      SELECT
        bc.id,
        bc.brief_id,
        bc.parent_id,
        bc.user_id,
        bc.content,
        bc.is_resolution,
        bc.created_at,
        bc.updated_at,
        tm.name AS user_name,
        tm.avatar_url AS user_avatar
      FROM brief_comments bc
      LEFT JOIN team_members tm ON bc.user_id = tm.id
      WHERE bc.brief_id = $1 AND bc.is_internal = false AND bc.parent_id IS NULL
      ORDER BY bc.created_at ASC
    `, [id])

    // Get replies for each comment (also non-internal only)
    for (const comment of comments) {
      const replies = await queryRows(`
        SELECT
          bc.id,
          bc.brief_id,
          bc.parent_id,
          bc.user_id,
          bc.content,
          bc.is_resolution,
          bc.created_at,
          bc.updated_at,
          tm.name AS user_name,
          tm.avatar_url AS user_avatar
        FROM brief_comments bc
        LEFT JOIN team_members tm ON bc.user_id = tm.id
        WHERE bc.parent_id = $1 AND bc.is_internal = false
        ORDER BY bc.created_at ASC
      `, [comment.id])

      comment.replies = replies.map(r => ({
        id: r.id,
        briefId: r.brief_id,
        parentId: r.parent_id,
        content: r.content,
        isResolution: r.is_resolution,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        user: {
          name: r.user_name || 'Team Member',
          avatarUrl: r.user_avatar
        }
      }))
    }

    return comments.map(c => ({
      id: c.id,
      briefId: c.brief_id,
      parentId: c.parent_id,
      content: c.content,
      isResolution: c.is_resolution,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      user: {
        name: c.user_name || 'Team Member',
        avatarUrl: c.user_avatar
      },
      replies: c.replies || []
    }))
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch portal brief comments:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch comments' })
  }
})
