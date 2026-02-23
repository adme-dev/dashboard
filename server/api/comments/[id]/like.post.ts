/**
 * Toggle like on a comment
 * POST /api/comments/:id/like
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryOne, queryCount } from '../../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const commentId = getRouterParam(event, 'id')

  if (!commentId) {
    throw createError({ statusCode: 400, statusMessage: 'Comment ID required' })
  }

  try {
    // Check comment exists and is not deleted
    const comment = await queryOne(`
      SELECT id, is_deleted FROM task_activities 
      WHERE id = $1 AND activity_type = 'comment'
    `, [commentId])

    if (!comment) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
    }

    if (comment.is_deleted) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot like deleted comment' })
    }

    // Check if user already liked
    const existingLike = await queryOne(`
      SELECT id FROM task_comment_reactions 
      WHERE comment_id = $1 AND user_id = $2 AND reaction_type = 'like'
    `, [commentId, user.id])

    let liked: boolean
    let likesCount: number

    if (existingLike) {
      // Unlike - remove the reaction
      await queryOne(`
        DELETE FROM task_comment_reactions 
        WHERE comment_id = $1 AND user_id = $2 AND reaction_type = 'like'
      `, [commentId, user.id])
      liked = false
    } else {
      // Like - add the reaction
      await queryOne(`
        INSERT INTO task_comment_reactions (comment_id, user_id, reaction_type)
        VALUES ($1, $2, 'like')
        ON CONFLICT DO NOTHING
      `, [commentId, user.id])
      liked = true
    }

    // Get updated count
    const count = await queryOne(`
      SELECT COUNT(*) as count FROM task_comment_reactions 
      WHERE comment_id = $1 AND reaction_type = 'like'
    `, [commentId])

    return {
      liked,
      likesCount: parseInt(count?.count || '0')
    }

  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to toggle like:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to toggle like: ${error.message}`
    })
  }
})
