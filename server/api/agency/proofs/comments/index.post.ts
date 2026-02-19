/**
 * Add Comment to Proof
 * POST /api/agency/proofs/comments
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface AddCommentBody {
  proofId: string
  assetId?: string
  parentCommentId?: string
  content: string
  isInternal?: boolean
  annotation?: {
    type: 'point' | 'rectangle' | 'circle' | 'arrow' | 'freehand'
    data: Record<string, any>
  }
  timestamp?: {
    start: number
    end?: number
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<AddCommentBody>(event)

  // Validation
  if (!body.proofId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Proof ID is required'
    })
  }

  if (!body.content?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment content is required'
    })
  }

  try {
    // Verify proof exists
    const proof = await queryOne(`
      SELECT id, allow_comments FROM creative_proofs WHERE id = $1
    `, [body.proofId])

    if (!proof) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Proof not found'
      })
    }

    if (!proof.allow_comments && !body.isInternal) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Comments are disabled for this proof'
      })
    }

    // Verify asset if provided
    if (body.assetId) {
      const asset = await queryOne(`
        SELECT id FROM proof_assets WHERE id = $1 AND proof_id = $2
      `, [body.assetId, body.proofId])

      if (!asset) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Asset not found'
        })
      }
    }

    // Verify parent comment if provided
    if (body.parentCommentId) {
      const parent = await queryOne(`
        SELECT id FROM proof_comments WHERE id = $1 AND proof_id = $2
      `, [body.parentCommentId, body.proofId])

      if (!parent) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Parent comment not found'
        })
      }
    }

    // Create comment
    const comment = await queryOne(`
      INSERT INTO proof_comments (
        proof_id,
        asset_id,
        parent_comment_id,
        author_type,
        team_member_id,
        content,
        is_internal,
        annotation_type,
        annotation_data,
        timestamp_start,
        timestamp_end
      ) VALUES ($1, $2, $3, 'team_member', $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      body.proofId,
      body.assetId || null,
      body.parentCommentId || null,
      user.id,
      body.content.trim(),
      body.isInternal || false,
      body.annotation?.type || null,
      body.annotation?.data ? JSON.stringify(body.annotation.data) : null,
      body.timestamp?.start || null,
      body.timestamp?.end || null
    ])

    // Log activity
    await queryOne(`
      INSERT INTO proof_activities (
        proof_id,
        actor_type,
        team_member_id,
        activity_type,
        description,
        metadata
      ) VALUES ($1, 'team_member', $2, $3, $4, $5)
    `, [
      body.proofId,
      user.id,
      body.annotation ? 'annotation_added' : 'comment_added',
      body.isInternal ? 'Internal note added' : 'Comment added',
      JSON.stringify({
        commentId: comment.id,
        hasAnnotation: !!body.annotation,
        isReply: !!body.parentCommentId
      })
    ])

    return {
      success: true,
      comment: {
        id: comment.id,
        proofId: comment.proof_id,
        assetId: comment.asset_id,
        parentCommentId: comment.parent_comment_id,
        authorType: comment.author_type,
        teamMemberId: comment.team_member_id,
        content: comment.content,
        isInternal: comment.is_internal,
        annotation: comment.annotation_type ? {
          type: comment.annotation_type,
          data: comment.annotation_data
        } : null,
        timestamp: comment.timestamp_start ? {
          start: comment.timestamp_start,
          end: comment.timestamp_end
        } : null,
        isResolved: comment.is_resolved,
        createdAt: comment.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add comment'
    })
  }
})
