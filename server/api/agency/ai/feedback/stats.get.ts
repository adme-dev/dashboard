import { queryRows, queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const [totals, categoryBreakdown, recentFeedback] = await Promise.all([
    // Total counts
    queryOne<any>(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE rating = 1) as positive,
        COUNT(*) FILTER (WHERE rating = -1) as negative,
        COUNT(*) FILTER (WHERE correction IS NOT NULL) as with_corrections
      FROM ai_feedback
    `),

    // Category breakdown for negative feedback
    queryRows<any>(`
      SELECT
        COALESCE(category, 'uncategorized') as category,
        COUNT(*) as count
      FROM ai_feedback
      WHERE rating = -1 AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `),

    // Recent feedback
    queryRows<any>(`
      SELECT f.id, f.rating, f.correction, f.category, f.created_at,
             m.content as message_content,
             tm.name as user_name
      FROM ai_feedback f
      JOIN ai_messages m ON m.id = f.message_id
      JOIN team_members tm ON tm.id = f.user_id
      ORDER BY f.created_at DESC
      LIMIT 20
    `),
  ])

  const total = parseInt(totals?.total || '0')
  const positive = parseInt(totals?.positive || '0')

  return {
    total,
    positive,
    negative: parseInt(totals?.negative || '0'),
    withCorrections: parseInt(totals?.with_corrections || '0'),
    positiveRate: total > 0 ? Math.round((positive / total) * 100) : 0,
    categoryBreakdown: categoryBreakdown.map(r => ({
      category: r.category,
      count: parseInt(r.count),
    })),
    recentFeedback: recentFeedback.map(r => ({
      id: r.id,
      rating: r.rating,
      correction: r.correction,
      category: r.category,
      messagePreview: r.message_content?.slice(0, 150) || '',
      userName: r.user_name,
      createdAt: r.created_at,
    })),
  }
})
