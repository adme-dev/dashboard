/**
 * Submit Feedback for AI Suggestion
 * POST /api/agency/ai/suggestions/:id/feedback
 *
 * Collects user feedback on AI suggestions to improve future recommendations
 *
 * Body:
 * - rating: 1-5 star rating
 * - wasApplied: Whether the suggestion was applied
 * - modificationPercentage: 0-100, how much was modified
 * - feedback: Optional text feedback
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface FeedbackBody {
  rating: number
  wasApplied: boolean
  modificationPercentage?: number
  feedback?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const suggestionId = getRouterParam(event, 'id')
  const body = await readBody<FeedbackBody>(event)

  if (!suggestionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Suggestion ID is required'
    })
  }

  // Validate rating
  if (!body.rating || body.rating < 1 || body.rating > 5) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rating must be between 1 and 5'
    })
  }

  try {
    // Check if suggestion exists
    const suggestion = await queryOne(`
      SELECT id, suggestion_type, applied_at
      FROM ai_task_suggestions
      WHERE id = $1
    `, [suggestionId])

    if (!suggestion) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Suggestion not found'
      })
    }

    // Update suggestion with feedback
    const result = await queryOne(`
      UPDATE ai_task_suggestions
      SET
        feedback_rating = $1,
        feedback_applied = $2,
        feedback_modification_pct = $3,
        feedback_text = $4,
        feedback_user_id = $5,
        feedback_at = NOW(),
        updated_at = NOW()
      WHERE id = $6
      RETURNING id, feedback_rating, feedback_applied, feedback_modification_pct
    `, [
      body.rating,
      body.wasApplied,
      body.modificationPercentage ?? null,
      body.feedback ?? null,
      user.id,
      suggestionId
    ])

    return {
      success: true,
      suggestion: {
        id: result.id,
        rating: result.feedback_rating,
        wasApplied: result.feedback_applied,
        modificationPercentage: result.feedback_modification_pct
      },
      message: 'Thank you for your feedback!'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to submit feedback:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to submit feedback'
    })
  }
})
