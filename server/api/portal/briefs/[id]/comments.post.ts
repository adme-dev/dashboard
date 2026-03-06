/**
 * Client Portal - Add comment to brief (always non-internal)
 * POST /api/portal/briefs/:id/comments
 */

import { queryOne, execute } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  const { content } = body

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Brief ID is required' })
  }

  if (!content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Comment content is required' })
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

    // CRITICAL: Always set is_internal = false — clients cannot create internal comments
    const comment = await queryOne(`
      INSERT INTO brief_comments (brief_id, content, is_internal, is_resolution, metadata)
      VALUES ($1, $2, false, false, $3)
      RETURNING *
    `, [
      id,
      content.trim(),
      JSON.stringify({
        source: 'client_portal',
        clientUserId: clientUser.id,
        clientUserName: clientUser.name,
        clientUserEmail: clientUser.email
      })
    ])

    // Log activity
    await execute(`
      INSERT INTO brief_activities (brief_id, activity_type, content)
      VALUES ($1, $2, $3)
    `, [
      id,
      'commented',
      `Client comment by ${clientUser.name}`
    ])

    return {
      id: comment.id,
      briefId: comment.brief_id,
      content: comment.content,
      isResolution: comment.is_resolution,
      createdAt: comment.created_at,
      user: {
        name: clientUser.name,
        avatarUrl: clientUser.avatarUrl
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create portal brief comment:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to add comment' })
  }
})
