/**
 * Delete Client Comment
 * DELETE /api/agency/client-portal/comments/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const commentId = getRouterParam(event, 'id')

  if (!commentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment ID is required'
    })
  }

  try {
    // Check comment exists and user has permission
    const existing = await queryOne(`
      SELECT id, team_member_id, client_user_id, content
      FROM client_comments WHERE id = $1
    `, [commentId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Comment not found'
      })
    }

    // Only the author or an admin can delete the comment
    if (existing.team_member_id && existing.team_member_id !== user.id) {
      // Check if user is admin/owner
      const isAdmin = user.role === 'owner' || user.role === 'admin'
      if (!isAdmin) {
        throw createError({
          statusCode: 403,
          statusMessage: 'You can only delete your own comments'
        })
      }
    }

    // Delete the comment (will cascade to child comments)
    await queryOne(`
      DELETE FROM client_comments WHERE id = $1 RETURNING id
    `, [commentId])

    return {
      success: true,
      message: 'Comment deleted successfully'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete comment'
    })
  }
})
