/**
 * Client Portal - List client's briefs
 * GET /api/portal/briefs
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)

  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = ['b.client_id = $1']
    const params: any[] = [clientUser.clientId]
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

    const summary = await queryOne(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) AS submitted,
        COUNT(CASE WHEN status IN ('under_review', 'needs_info', 'approved', 'in_progress') THEN 1 END) AS in_progress,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed
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
        total: Number(summary?.total || 0),
        submitted: Number(summary?.submitted || 0),
        inProgress: Number(summary?.in_progress || 0),
        completed: Number(summary?.completed || 0)
      }
    }
  } catch (error: any) {
    console.error('Failed to fetch portal briefs:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch briefs' })
  }
})
