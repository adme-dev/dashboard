/**
 * Client Portal - List client's briefs
 * GET /api/portal/briefs
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

type BriefSummaryRow = {
  total: string | number | null
  draft: string | number | null
  submitted: string | number | null
  needs_info: string | number | null
  in_progress: string | number | null
  completed: string | number | null
  urgent: string | number | null
  overdue: string | number | null
  due_soon: string | number | null
  submitted_last_30: string | number | null
  avg_completion_days: string | number | null
}

const toNumber = (value: string | number | null | undefined) => Number(value || 0)

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)

  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = ['b.client_id = $1']
    const params: unknown[] = [clientUser.clientId]
    let idx = 2

    if (status && status !== 'all') {
      conditions.push(`b.status = $${idx}`)
      params.push(status)
      idx++
    }

    params.push(limit)

    const briefs = await queryRows(`
      SELECT
        b.id,
        b.template_id,
        b.reference_number,
        b.title,
        b.submitted_by_name,
        b.submitted_by_email,
        b.status,
        b.priority,
        b.requested_deadline,
        b.source,
        b.created_at,
        b.submitted_at,
        b.completed_at,
        bt.name AS template_name,
        bt.slug AS template_slug,
        bt.icon AS template_icon,
        bc.id AS category_id,
        bc.name AS category_name,
        bc.icon AS category_icon,
        bc.color AS category_color,
        am.name AS assignee_name,
        (SELECT COUNT(*) FROM brief_comments WHERE brief_id = b.id AND is_internal = false) AS comment_count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      LEFT JOIN team_members am ON b.assigned_to = am.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE b.status
          WHEN 'submitted' THEN 0
          WHEN 'needs_info' THEN 1
          WHEN 'under_review' THEN 2
          WHEN 'approved' THEN 3
          WHEN 'in_progress' THEN 4
          ELSE 5
        END,
        b.created_at DESC
      LIMIT $${idx}
    `, params)

    const summary = await queryOne<BriefSummaryRow>(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) AS submitted,
        COUNT(CASE WHEN status = 'needs_info' THEN 1 END) AS needs_info,
        COUNT(CASE WHEN status IN ('under_review', 'needs_info', 'approved', 'in_progress') THEN 1 END) AS in_progress,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
        COUNT(CASE WHEN priority = 'urgent' AND status NOT IN ('completed', 'cancelled', 'rejected') THEN 1 END) AS urgent,
        COUNT(CASE
          WHEN status NOT IN ('completed', 'cancelled', 'rejected')
            AND requested_deadline IS NOT NULL
            AND requested_deadline < CURRENT_DATE
          THEN 1
        END) AS overdue,
        COUNT(CASE
          WHEN status NOT IN ('completed', 'cancelled', 'rejected')
            AND requested_deadline >= CURRENT_DATE
            AND requested_deadline <= CURRENT_DATE + INTERVAL '14 days'
          THEN 1
        END) AS due_soon,
        COUNT(CASE WHEN submitted_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS submitted_last_30,
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - submitted_at)) / 86400)
          FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL AND submitted_at IS NOT NULL), 0) AS avg_completion_days
      FROM briefs
      WHERE client_id = $1
    `, [clientUser.clientId])

    return {
      briefs: briefs.map(b => ({
        id: b.id,
        templateId: b.template_id,
        referenceNumber: b.reference_number,
        title: b.title,
        submittedByName: b.submitted_by_name,
        submittedByEmail: b.submitted_by_email,
        status: b.status,
        priority: b.priority,
        requestedDeadline: b.requested_deadline,
        source: b.source,
        createdAt: b.created_at,
        submittedAt: b.submitted_at,
        completedAt: b.completed_at,
        template: {
          id: b.template_id,
          name: b.template_name,
          slug: b.template_slug,
          icon: b.template_icon
        },
        category: {
          id: b.category_id,
          name: b.category_name,
          icon: b.category_icon,
          color: b.category_color
        },
        assigneeName: b.assignee_name,
        commentCount: Number(b.comment_count) || 0
      })),
      summary: {
        total: toNumber(summary?.total),
        draft: toNumber(summary?.draft),
        submitted: toNumber(summary?.submitted),
        needsInfo: toNumber(summary?.needs_info),
        inProgress: toNumber(summary?.in_progress),
        completed: toNumber(summary?.completed),
        urgent: toNumber(summary?.urgent),
        overdue: toNumber(summary?.overdue),
        dueSoon: toNumber(summary?.due_soon),
        submittedLast30: toNumber(summary?.submitted_last_30),
        averageCompletionDays: Math.round(toNumber(summary?.avg_completion_days))
      }
    }
  } catch (error) {
    console.error('Failed to fetch portal briefs:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch briefs' })
  }
})
