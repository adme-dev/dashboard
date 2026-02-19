/**
 * Resolve Proof Comment
 * POST /api/agency/proofs/comments/:id/resolve
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
    // Get comment
    const existing = await queryOne(`
      SELECT * FROM proof_comments WHERE id = $1
    `, [commentId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Comment not found'
      })
    }

    if (existing.is_resolved) {
      return {
        success: true,
        message: 'Comment already resolved'
      }
    }

    // Resolve comment
    const comment = await queryOne(`
      UPDATE proof_comments
      SET
        is_resolved = true,
        resolved_by = $1,
        resolved_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [user.id, commentId])

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (
        proof_id,
        actor_type,
        team_member_id,
        activity_type,
        description,
        metadata
      ) VALUES ($1, 'team_member', $2, 'comment_resolved', 'Comment resolved', $3)
    `, [
      comment.proof_id,
      user.id,
      JSON.stringify({ commentId: comment.id })
    ])

    return {
      success: true,
      comment: {
        id: comment.id,
        isResolved: comment.is_resolved,
        resolvedBy: comment.resolved_by,
        resolvedAt: comment.resolved_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to resolve comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resolve comment'
    })
  }
})
