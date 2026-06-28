/**
 * Get briefs with filtering and pagination
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  // Pagination
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = Number(query.offset) || 0

  // Filters
  const categoryId = query.categoryId as string | undefined
  const templateId = query.templateId as string | undefined
  const status = query.status as string | string[] | undefined
  const priority = query.priority as string | string[] | undefined
  const assigneeId = query.assigneeId as string | undefined
  const submittedById = query.submittedById as string | undefined
  const clientId = query.clientId as string | undefined
  const departmentId = query.departmentId as string | undefined
  const search = query.search as string | undefined

  try {
    let whereClause = 'WHERE 1=1'
    const params: any[] = []
    let paramIdx = 1

    if (categoryId) {
      whereClause += ` AND bc.id = $${paramIdx}`
      params.push(categoryId)
      paramIdx++
    }

    if (templateId) {
      whereClause += ` AND b.template_id = $${paramIdx}`
      params.push(templateId)
      paramIdx++
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status]
      whereClause += ` AND b.status = ANY($${paramIdx})`
      params.push(statuses)
      paramIdx++
    }

    if (priority) {
      const priorities = Array.isArray(priority) ? priority : [priority]
      whereClause += ` AND b.priority = ANY($${paramIdx})`
      params.push(priorities)
      paramIdx++
    }

    if (assigneeId) {
      whereClause += ` AND b.assigned_to = $${paramIdx}`
      params.push(assigneeId)
      paramIdx++
    }

    if (submittedById) {
      whereClause += ` AND b.submitted_by = $${paramIdx}`
      params.push(submittedById)
      paramIdx++
    }

    if (clientId) {
      whereClause += ` AND b.client_id = $${paramIdx}`
      params.push(clientId)
      paramIdx++
    }

    if (departmentId) {
      whereClause += ` AND b.department_id = $${paramIdx}`
      params.push(departmentId)
      paramIdx++
    }

    if (search) {
      whereClause += ` AND (b.title ILIKE $${paramIdx} OR b.reference_number ILIKE $${paramIdx})`
      params.push(`%${search}%`)
      paramIdx++
    }

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) AS total
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      ${whereClause}
    `, params)

    // Per-status totals across the whole (filtered) set, so pipeline widgets get true
    // counts instead of sampling the current page.
    const statusCountRows = await queryRows(`
      SELECT b.status, COUNT(*)::int AS count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      ${whereClause}
      GROUP BY b.status
    `, params)
    const statusCounts: Record<string, number> = {}
    for (const r of statusCountRows as any[]) statusCounts[r.status] = Number(r.count)

    // Get briefs
    const briefs = await queryRows(`
      SELECT
        b.id,
        b.template_id,
        b.reference_number,
        b.title,
        b.submitted_by,
        b.submitted_by_name,
        b.submitted_by_email,
        b.client_id,
        b.project_id,
        b.department_id,
        b.status,
        b.priority,
        b.assigned_to,
        b.assigned_at,
        b.reviewed_by,
        b.reviewed_at,
        b.requested_deadline,
        b.budget_min,
        b.budget_max,
        b.budget_currency,
        b.source,
        b.created_at,
        b.submitted_at,
        b.completed_at,
        -- Template
        bt.name AS template_name,
        bt.slug AS template_slug,
        -- Category
        bc.id AS category_id,
        bc.name AS category_name,
        bc.slug AS category_slug,
        bc.icon AS category_icon,
        bc.color AS category_color,
        -- Submitter
        sm.name AS submitter_name,
        sm.email AS submitter_email,
        -- Assignee
        am.name AS assignee_name,
        am.email AS assignee_email,
        -- Client
        c.name AS client_name,
        -- Department
        d.name AS department_name,
        d.color AS department_color,
        -- Counts
        (SELECT COUNT(*) FROM brief_comments WHERE brief_id = b.id) AS comment_count,
        (SELECT COUNT(*) FROM brief_attachments WHERE brief_id = b.id) AS attachment_count
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      LEFT JOIN team_members sm ON b.submitted_by = sm.id
      LEFT JOIN team_members am ON b.assigned_to = am.id
      LEFT JOIN agency_clients c ON b.client_id = c.id
      LEFT JOIN departments d ON b.department_id = d.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, limit, offset])

    return {
      briefs: briefs.map(b => ({
        id: b.id,
        templateId: b.template_id,
        referenceNumber: b.reference_number,
        title: b.title,
        submittedBy: b.submitted_by,
        submittedByName: b.submitted_by_name,
        submittedByEmail: b.submitted_by_email,
        clientId: b.client_id,
        projectId: b.project_id,
        departmentId: b.department_id,
        status: b.status,
        priority: b.priority,
        assignedTo: b.assigned_to,
        assignedAt: b.assigned_at,
        reviewedBy: b.reviewed_by,
        reviewedAt: b.reviewed_at,
        requestedDeadline: b.requested_deadline,
        budgetMin: b.budget_min,
        budgetMax: b.budget_max,
        budgetCurrency: b.budget_currency,
        source: b.source,
        createdAt: b.created_at,
        submittedAt: b.submitted_at,
        completedAt: b.completed_at,
        template: {
          id: b.template_id,
          name: b.template_name,
          slug: b.template_slug
        },
        category: {
          id: b.category_id,
          name: b.category_name,
          slug: b.category_slug,
          icon: b.category_icon,
          color: b.category_color
        },
        submitter: b.submitted_by ? {
          id: b.submitted_by,
          name: b.submitter_name || b.submitted_by_name,
          email: b.submitter_email || b.submitted_by_email
        } : null,
        assignee: b.assigned_to ? {
          id: b.assigned_to,
          name: b.assignee_name,
          email: b.assignee_email
        } : null,
        client: b.client_id ? {
          id: b.client_id,
          name: b.client_name
        } : null,
        department: b.department_id ? {
          id: b.department_id,
          name: b.department_name,
          color: b.department_color
        } : null,
        commentCount: Number(b.comment_count) || 0,
        attachmentCount: Number(b.attachment_count) || 0
      })),
      statusCounts,
      pagination: {
        total: Number(countResult?.total) || 0,
        limit,
        offset,
        hasMore: offset + briefs.length < Number(countResult?.total)
      }
    }
  } catch (error: any) {
    console.error('Failed to fetch briefs:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch briefs'
    })
  }
})
