/**
 * Get time entries
 * GET /api/agency/time/entries
 *
 * Query params:
 * - userId: Filter by user
 * - projectId: Filter by project
 * - taskId: Filter by task
 * - startDate: Start date filter (YYYY-MM-DD)
 * - endDate: End date filter (YYYY-MM-DD)
 * - billable: Filter by billable status
 * - status: Filter by entry status (draft, submitted, approved, rejected)
 * - limit: Results limit
 * - offset: Results offset
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  // Filter by user (default to current user unless admin/manager)
  const isManager = ['admin', 'owner', 'lead'].includes(user.role || '')
  if (query.userId && isManager) {
    conditions.push(`te.user_id = $${idx}`)
    params.push(query.userId)
    idx++
  } else if (!query.all || !isManager) {
    // Default to current user's entries
    conditions.push(`te.user_id = $${idx}`)
    params.push(user.id)
    idx++
  }

  // Filter by project
  if (query.projectId) {
    conditions.push(`te.project_id = $${idx}`)
    params.push(query.projectId)
    idx++
  }

  // Filter by task
  if (query.taskId) {
    conditions.push(`te.task_id = $${idx}`)
    params.push(query.taskId)
    idx++
  }

  // Filter by date range
  if (query.startDate) {
    conditions.push(`te.date >= $${idx}`)
    params.push(query.startDate)
    idx++
  }

  if (query.endDate) {
    conditions.push(`te.date <= $${idx}`)
    params.push(query.endDate)
    idx++
  }

  // Filter by billable
  if (query.billable !== undefined) {
    conditions.push(`te.billable = $${idx}`)
    params.push(query.billable === 'true' || query.billable === true)
    idx++
  }

  // Filter by status
  if (query.status) {
    conditions.push(`te.status = $${idx}`)
    params.push(query.status)
    idx++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Number(query.limit) || 100, 500)
  const offset = Number(query.offset) || 0

  // Get entries with related data
  const entries = await queryRows(`
    SELECT
      te.id,
      te.user_id,
      te.project_id,
      te.task_id,
      te.date,
      te.hours,
      te.billable,
      te.hourly_rate,
      te.description,
      te.notes,
      te.status,
      te.approved,
      te.invoiced,
      te.submitted_at,
      te.approved_at,
      te.approved_by,
      te.rejection_reason,
      te.created_at,
      tm.name AS user_name,
      tm.email AS user_email,
      p.name AS project_name,
      c.name AS client_name,
      t.title AS task_title
    FROM time_entries te
    LEFT JOIN team_members tm ON te.user_id = tm.id
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN agency_clients c ON p.client_id = c.id
    LEFT JOIN tasks t ON te.task_id = t.id
    ${whereClause}
    ORDER BY te.date DESC, te.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, limit, offset])

  // Get total count
  const countResult = await queryOne(`
    SELECT COUNT(*) AS total
    FROM time_entries te
    ${whereClause}
  `, params)

  // Get summary stats
  const summaryResult = await queryOne(`
    SELECT
      COALESCE(SUM(te.hours), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours,
      COALESCE(SUM(te.hours * te.hourly_rate), 0) AS total_value,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END), 0) AS billable_value
    FROM time_entries te
    ${whereClause}
  `, params)

  return {
    entries: entries.map(e => ({
      id: e.id,
      userId: e.user_id,
      projectId: e.project_id,
      taskId: e.task_id,
      date: e.date,
      hours: Number(e.hours),
      billable: e.billable,
      hourlyRate: Number(e.hourly_rate),
      description: e.description,
      notes: e.notes,
      status: e.status || 'draft',
      approved: e.approved,
      invoiced: e.invoiced,
      submittedAt: e.submitted_at,
      approvedAt: e.approved_at,
      approvedBy: e.approved_by,
      rejectionReason: e.rejection_reason,
      createdAt: e.created_at,
      value: Number(e.hours) * Number(e.hourly_rate),
      user: {
        id: e.user_id,
        name: e.user_name,
        email: e.user_email
      },
      project: e.project_id ? {
        id: e.project_id,
        name: e.project_name,
        clientName: e.client_name
      } : null,
      task: e.task_id ? {
        id: e.task_id,
        title: e.task_title
      } : null
    })),
    summary: {
      totalHours: Number(summaryResult?.total_hours || 0),
      billableHours: Number(summaryResult?.billable_hours || 0),
      nonBillableHours: Number(summaryResult?.total_hours || 0) - Number(summaryResult?.billable_hours || 0),
      totalValue: Number(summaryResult?.total_value || 0),
      billableValue: Number(summaryResult?.billable_value || 0)
    },
    pagination: {
      total: Number(countResult?.total || 0),
      limit,
      offset,
      hasMore: offset + entries.length < Number(countResult?.total || 0)
    }
  }
})
