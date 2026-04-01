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
    // Fetch all comments (top-level + replies) in a single query
    const allComments = await queryRows(`
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
      WHERE bc.brief_id = $1 AND bc.is_internal = false
      ORDER BY bc.created_at ASC
    `, [id])

    // Group replies under their parent comments
    const topLevel: any[] = []
    const repliesByParent = new Map<string, any[]>()

    for (const c of allComments) {
      const mapped = {
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
        }
      }

      if (!c.parent_id) {
        topLevel.push(mapped)
      } else {
        const arr = repliesByParent.get(c.parent_id) || []
        arr.push(mapped)
        repliesByParent.set(c.parent_id, arr)
      }
    }

    return topLevel.map(c => ({
      ...c,
      replies: repliesByParent.get(c.id) || []
    }))
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch portal brief comments:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch comments' })
  }
})
