/**
 * Agency - List All Client Requests
 * GET /api/agency/client-portal/requests
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string | undefined
  const type = query.type as string | undefined
  const status = query.status as string | undefined
  const assignedTo = query.assignedTo as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (clientId) {
      conditions.push(`cr.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (type && type !== 'all') {
      conditions.push(`cr.request_type = $${idx}`)
      params.push(type)
      idx++
    }

    if (status && status !== 'all') {
      conditions.push(`cr.status = $${idx}`)
      params.push(status)
      idx++
    }

    if (assignedTo) {
      conditions.push(`cr.assigned_to = $${idx}`)
      params.push(assignedTo)
      idx++
    }

    params.push(limit)
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const requests = await queryRows(`
      SELECT
        cr.id,
        cr.request_type,
        cr.category,
        cr.title,
        cr.priority,
        cr.status,
        cr.assigned_to,
        cr.project_id,
        cr.estimated_budget,
        cr.desired_deadline,
        cr.created_at,
        cr.updated_at,
        c.name as client_name,
        p.name as project_name,
        tm.name as assigned_name,
        cu.name as submitted_by_name
      FROM client_requests cr
      JOIN agency_clients c ON cr.client_id = c.id
      LEFT JOIN projects p ON cr.project_id = p.id
      LEFT JOIN team_members tm ON cr.assigned_to = tm.id
      LEFT JOIN client_users cu ON cr.client_user_id = cu.id
      ${whereClause}
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

    return {
      requests: requests.map(r => ({
        id: r.id,
        requestType: r.request_type,
        category: r.category,
        title: r.title,
        priority: r.priority,
        status: r.status,
        assignedTo: r.assigned_to,
        assignedName: r.assigned_name,
        projectId: r.project_id,
        projectName: r.project_name,
        clientName: r.client_name,
        estimatedBudget: r.estimated_budget ? Number(r.estimated_budget) : null,
        desiredDeadline: r.desired_deadline,
        submittedByName: r.submitted_by_name,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    }
  } catch (error) {
    console.error('Failed to fetch requests:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch requests' })
  }
})
