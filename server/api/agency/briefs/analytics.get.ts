/**
 * Brief analytics dashboard data
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const period = (query.period as string) || '30d'
  const categoryId = query.categoryId as string | undefined
  const templateId = query.templateId as string | undefined

  // Calculate date range
  const periodDays: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }
  const days = periodDays[period] || 30

  try {
    // Build WHERE clause for filters
    const conditions: string[] = [`b.created_at >= NOW() - MAKE_INTERVAL(days => $1)`]
    const params: any[] = [days]
    let paramIdx = 2

    if (categoryId) {
      conditions.push(`bt.category_id = $${paramIdx}`)
      params.push(categoryId)
      paramIdx++
    }

    if (templateId) {
      conditions.push(`b.template_id = $${paramIdx}`)
      params.push(templateId)
      paramIdx++
    }

    const whereClause = conditions.join(' AND ')

    // Summary stats
    const summary = await queryOne(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE b.status = 'submitted') AS submitted,
        COUNT(*) FILTER (WHERE b.status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE b.status = 'rejected') AS rejected,
        COUNT(*) FILTER (WHERE b.status = 'completed') AS completed,
        ROUND(AVG(
          CASE WHEN b.completed_at IS NOT NULL AND b.created_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (b.completed_at - b.created_at)) / 86400.0
          END
        )::numeric, 1) AS avg_completion_days
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      WHERE ${whereClause}
    `, params)

    // By status
    const byStatus = await queryRows(`
      SELECT b.status, COUNT(*) AS count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      WHERE ${whereClause}
      GROUP BY b.status
      ORDER BY count DESC
    `, params)

    // By category
    const byCategory = await queryRows(`
      SELECT bc.id AS category_id, bc.name AS category_name, COUNT(*) AS count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      WHERE ${whereClause}
      GROUP BY bc.id, bc.name
      ORDER BY count DESC
    `, params)

    // By priority
    const byPriority = await queryRows(`
      SELECT b.priority, COUNT(*) AS count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      WHERE ${whereClause}
      GROUP BY b.priority
      ORDER BY
        CASE b.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END
    `, params)

    // By template
    const byTemplate = await queryRows(`
      SELECT bt.id AS template_id, bt.name AS template_name, COUNT(*) AS count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      WHERE ${whereClause}
      GROUP BY bt.id, bt.name
      ORDER BY count DESC
      LIMIT 20
    `, params)

    // Timeline (daily counts)
    const timeline = await queryRows(`
      SELECT DATE(b.created_at) AS date, COUNT(*) AS count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      WHERE ${whereClause}
      GROUP BY DATE(b.created_at)
      ORDER BY date ASC
    `, params)

    // Cycle time (average days between stages)
    const cycleTime = await queryOne(`
      SELECT
        ROUND(AVG(
          CASE WHEN b.submitted_at IS NOT NULL AND b.created_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (b.submitted_at - b.created_at)) / 86400.0 END
        )::numeric, 1) AS avg_submit_to_review,
        ROUND(AVG(
          CASE WHEN b.reviewed_at IS NOT NULL AND b.submitted_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (b.reviewed_at - b.submitted_at)) / 86400.0 END
        )::numeric, 1) AS avg_review_to_approval,
        ROUND(AVG(
          CASE WHEN b.completed_at IS NOT NULL AND b.reviewed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (b.completed_at - b.reviewed_at)) / 86400.0 END
        )::numeric, 1) AS avg_approval_to_completion
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      WHERE ${whereClause}
    `, params)

    // Top submitters
    const topSubmitters = await queryRows(`
      SELECT
        COALESCE(tm.id, b.submitted_by) AS user_id,
        COALESCE(tm.name, b.submitted_by_name, 'Unknown') AS user_name,
        COUNT(*) AS count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      LEFT JOIN team_members tm ON b.submitted_by = tm.id
      WHERE ${whereClause}
        AND (b.submitted_by IS NOT NULL OR b.submitted_by_name IS NOT NULL)
      GROUP BY COALESCE(tm.id, b.submitted_by), COALESCE(tm.name, b.submitted_by_name, 'Unknown')
      ORDER BY count DESC
      LIMIT 10
    `, params)

    return {
      period,
      summary: {
        total: Number(summary?.total || 0),
        submitted: Number(summary?.submitted || 0),
        approved: Number(summary?.approved || 0),
        rejected: Number(summary?.rejected || 0),
        completed: Number(summary?.completed || 0),
        avgCompletionDays: Number(summary?.avg_completion_days || 0)
      },
      byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.count) })),
      byCategory: byCategory.map(r => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        count: Number(r.count)
      })),
      byPriority: byPriority.map(r => ({ priority: r.priority, count: Number(r.count) })),
      byTemplate: byTemplate.map(r => ({
        templateId: r.template_id,
        templateName: r.template_name,
        count: Number(r.count)
      })),
      timeline: timeline.map(r => ({ date: r.date, count: Number(r.count) })),
      cycleTime: {
        avgSubmitToReview: Number(cycleTime?.avg_submit_to_review || 0),
        avgReviewToApproval: Number(cycleTime?.avg_review_to_approval || 0),
        avgApprovalToCompletion: Number(cycleTime?.avg_approval_to_completion || 0)
      },
      topSubmitters: topSubmitters.map(r => ({
        userId: r.user_id,
        userName: r.user_name,
        count: Number(r.count)
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch brief analytics:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch brief analytics' })
  }
})
