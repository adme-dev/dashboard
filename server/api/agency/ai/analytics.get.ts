/**
 * Get AI Suggestion Analytics
 * GET /api/agency/ai/analytics
 *
 * Returns analytics on AI suggestion effectiveness
 *
 * Query params:
 * - startDate: Start of date range (YYYY-MM-DD)
 * - endDate: End of date range (YYYY-MM-DD)
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  try {
    // Default to last 30 days if no date range provided
    const endDate = (query.endDate as string) || new Date().toISOString().split('T')[0]
    const startDate = (query.startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Overall suggestion stats
    const overallStats = await queryOne(`
      SELECT
        COUNT(*) as total_suggestions,
        COUNT(CASE WHEN applied_at IS NOT NULL THEN 1 END) as applied_count,
        COUNT(CASE WHEN feedback_rating IS NOT NULL THEN 1 END) as feedback_count,
        ROUND(AVG(feedback_rating)::numeric, 2) as avg_rating,
        ROUND(AVG(feedback_modification_pct)::numeric, 2) as avg_modification_pct,
        COUNT(CASE WHEN feedback_applied = true THEN 1 END) as confirmed_applied
      FROM ai_task_suggestions
      WHERE created_at >= $1 AND created_at <= $2
    `, [startDate, endDate])

    // Stats by suggestion type
    const byType = await queryRows(`
      SELECT
        suggestion_type,
        COUNT(*) as count,
        COUNT(CASE WHEN applied_at IS NOT NULL THEN 1 END) as applied,
        ROUND(AVG(feedback_rating)::numeric, 2) as avg_rating,
        ROUND(AVG(feedback_modification_pct)::numeric, 2) as avg_modification
      FROM ai_task_suggestions
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY suggestion_type
      ORDER BY count DESC
    `, [startDate, endDate])

    // Daily trends
    const dailyTrends = await queryRows(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as suggestions,
        COUNT(CASE WHEN applied_at IS NOT NULL THEN 1 END) as applied,
        ROUND(AVG(feedback_rating)::numeric, 2) as avg_rating
      FROM ai_task_suggestions
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [startDate, endDate])

    // Top performing suggestion types (by acceptance rate)
    const topPerforming = await queryRows(`
      SELECT
        suggestion_type,
        COUNT(*) as total,
        ROUND(COUNT(CASE WHEN applied_at IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as acceptance_rate,
        ROUND(AVG(feedback_rating)::numeric, 2) as avg_rating
      FROM ai_task_suggestions
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY suggestion_type
      HAVING COUNT(*) >= 5
      ORDER BY acceptance_rate DESC, avg_rating DESC
      LIMIT 5
    `, [startDate, endDate])

    // Recent feedback
    const recentFeedback = await queryRows(`
      SELECT
        ats.id,
        ats.suggestion_type,
        ats.suggestion_text,
        ats.feedback_rating,
        ats.feedback_text,
        ats.feedback_modification_pct,
        ats.feedback_at,
        tm.name as user_name
      FROM ai_task_suggestions ats
      LEFT JOIN team_members tm ON ats.feedback_user_id = tm.id
      WHERE ats.feedback_at IS NOT NULL
        AND ats.created_at >= $1
        AND ats.created_at <= $2
      ORDER BY ats.feedback_at DESC
      LIMIT 10
    `, [startDate, endDate])

    // Calculate key metrics
    const acceptanceRate = overallStats.total_suggestions > 0
      ? (overallStats.applied_count / overallStats.total_suggestions * 100).toFixed(1)
      : 0

    const feedbackRate = overallStats.total_suggestions > 0
      ? (overallStats.feedback_count / overallStats.total_suggestions * 100).toFixed(1)
      : 0

    return {
      dateRange: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalSuggestions: parseInt(overallStats.total_suggestions) || 0,
        appliedCount: parseInt(overallStats.applied_count) || 0,
        acceptanceRate: parseFloat(acceptanceRate as string) || 0,
        feedbackCount: parseInt(overallStats.feedback_count) || 0,
        feedbackRate: parseFloat(feedbackRate as string) || 0,
        averageRating: parseFloat(overallStats.avg_rating) || null,
        averageModification: parseFloat(overallStats.avg_modification_pct) || null
      },
      byType: byType.map(t => ({
        type: t.suggestion_type,
        count: parseInt(t.count) || 0,
        applied: parseInt(t.applied) || 0,
        acceptanceRate: t.count > 0 ? ((parseInt(t.applied) / parseInt(t.count)) * 100).toFixed(1) : 0,
        avgRating: parseFloat(t.avg_rating) || null,
        avgModification: parseFloat(t.avg_modification) || null
      })),
      trends: dailyTrends.map(d => ({
        date: d.date,
        suggestions: parseInt(d.suggestions) || 0,
        applied: parseInt(d.applied) || 0,
        avgRating: parseFloat(d.avg_rating) || null
      })),
      topPerforming: topPerforming.map(t => ({
        type: t.suggestion_type,
        total: parseInt(t.total) || 0,
        acceptanceRate: parseFloat(t.acceptance_rate) || 0,
        avgRating: parseFloat(t.avg_rating) || null
      })),
      recentFeedback: recentFeedback.map(f => ({
        id: f.id,
        type: f.suggestion_type,
        text: f.suggestion_text,
        rating: f.feedback_rating,
        feedback: f.feedback_text,
        modificationPct: f.feedback_modification_pct,
        feedbackAt: f.feedback_at,
        userName: f.user_name
      }))
    }
  } catch (error: any) {
    console.error('Failed to fetch AI analytics:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch AI analytics'
    })
  }
})
