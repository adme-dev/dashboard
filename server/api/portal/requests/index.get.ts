/**
 * Client Portal - List Requests
 * GET /api/portal/requests
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)

  const type = query.type as string | undefined
  const status = query.status as string | undefined
  const view = query.view as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = ['cr.client_id = $1']
    const params: unknown[] = [clientUser.clientId]
    let idx = 2

    if (type && type !== 'all') {
      conditions.push(`cr.request_type = $${idx}`)
      params.push(type)
      idx++
    }

    if (view === 'open') {
      conditions.push(`cr.status NOT IN ('completed', 'closed', 'cancelled')`)
    } else if (view === 'needs_review') {
      conditions.push(`cr.status IN ('submitted', 'in_review')`)
    } else if (view === 'in_progress') {
      conditions.push(`cr.status IN ('approved', 'in_progress')`)
    } else if (view === 'resolved') {
      conditions.push(`cr.status IN ('completed', 'closed')`)
    } else if (status && status !== 'all') {
      conditions.push(`cr.status = $${idx}`)
      params.push(status)
      idx++
    }

    params.push(limit)

    const requests = await queryRows(`
      SELECT
        cr.id,
        cr.request_type,
        cr.category,
        cr.title,
        cr.description,
        cr.priority,
        cr.status,
        cr.project_id,
        cr.estimated_budget,
        cr.desired_deadline,
        cr.created_at,
        cr.updated_at,
        p.name as project_name,
        tm.name as assigned_name,
        tm.avatar_url as assigned_avatar,
        cu.name as submitted_by_name
      FROM client_requests cr
      LEFT JOIN projects p ON cr.project_id = p.id
      LEFT JOIN team_members tm ON cr.assigned_to = tm.id
      LEFT JOIN client_users cu ON cr.client_user_id = cu.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE cr.status
          WHEN 'submitted' THEN 0
          WHEN 'in_review' THEN 1
          WHEN 'approved' THEN 2
          WHEN 'in_progress' THEN 3
          ELSE 4
        END,
        CASE cr.priority
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
        END,
        cr.created_at DESC
      LIMIT $${idx}
    `, params)

    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
        COUNT(CASE WHEN status IN ('submitted', 'in_review') THEN 1 END) as needs_review,
        COUNT(CASE WHEN status IN ('in_review', 'approved', 'in_progress') THEN 1 END) as in_progress,
        COUNT(CASE WHEN status IN ('completed', 'closed') THEN 1 END) as resolved,
        COUNT(CASE WHEN status NOT IN ('completed', 'closed', 'cancelled') THEN 1 END) as open,
        COUNT(CASE WHEN priority = 'urgent' AND status NOT IN ('completed', 'closed', 'cancelled') THEN 1 END) as urgent_open,
        COUNT(CASE WHEN assigned_to IS NULL AND status NOT IN ('completed', 'closed', 'cancelled') THEN 1 END) as unassigned_open,
        COUNT(CASE
          WHEN status NOT IN ('completed', 'closed', 'cancelled')
            AND desired_deadline IS NOT NULL
            AND desired_deadline < CURRENT_DATE
          THEN 1
        END) as past_desired_deadline,
        COUNT(CASE
          WHEN status NOT IN ('completed', 'closed', 'cancelled')
            AND desired_deadline >= CURRENT_DATE
            AND desired_deadline <= CURRENT_DATE + INTERVAL '14 days'
          THEN 1
        END) as due_soon,
        COALESCE(SUM(CASE
          WHEN request_type = 'job_request'
            AND status NOT IN ('completed', 'closed', 'cancelled')
          THEN estimated_budget ELSE 0
        END), 0) as open_requested_budget,
        COUNT(CASE WHEN request_type = 'job_request' THEN 1 END) as job_requests,
        COUNT(CASE WHEN request_type = 'support_ticket' THEN 1 END) as support_tickets
      FROM client_requests
      WHERE client_id = $1
    `, [clientUser.clientId])

    return {
      requests: requests.map(r => ({
        id: r.id,
        requestType: r.request_type,
        category: r.category,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status,
        projectId: r.project_id,
        projectName: r.project_name,
        estimatedBudget: r.estimated_budget ? Number(r.estimated_budget) : null,
        desiredDeadline: r.desired_deadline,
        assignedName: r.assigned_name,
        assignedAvatar: r.assigned_avatar,
        submittedByName: r.submitted_by_name,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      })),
      summary: {
        total: Number(summary?.total || 0),
        submitted: Number(summary?.submitted || 0),
        needsReview: Number(summary?.needs_review || 0),
        inProgress: Number(summary?.in_progress || 0),
        resolved: Number(summary?.resolved || 0),
        open: Number(summary?.open || 0),
        urgentOpen: Number(summary?.urgent_open || 0),
        unassignedOpen: Number(summary?.unassigned_open || 0),
        pastDesiredDeadline: Number(summary?.past_desired_deadline || 0),
        dueSoon: Number(summary?.due_soon || 0),
        openRequestedBudget: Number(summary?.open_requested_budget || 0),
        jobRequests: Number(summary?.job_requests || 0),
        supportTickets: Number(summary?.support_tickets || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch requests:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch requests' })
  }
})
