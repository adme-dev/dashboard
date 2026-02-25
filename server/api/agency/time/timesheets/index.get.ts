/**
 * List timesheets
 * GET /api/agency/time/timesheets
 *
 * Query params:
 * - status: Filter by status (submitted, approved, rejected)
 * - userId: Filter by user (managers only)
 * - periodStart: Filter by period start date
 * - periodEnd: Filter by period end date
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  const isManager = ['admin', 'owner', 'lead'].includes(user.role || '')

  const conditions: string[] = []
  const params: any[] = []
  let idx = 1

  // Non-managers can only see their own timesheets
  if (query.userId && isManager) {
    conditions.push(`tp.user_id = $${idx}`)
    params.push(query.userId)
    idx++
  } else if (!isManager) {
    conditions.push(`tp.user_id = $${idx}`)
    params.push(user.id)
    idx++
  }

  if (query.status) {
    conditions.push(`tp.status = $${idx}`)
    params.push(query.status)
    idx++
  }

  if (query.periodStart) {
    conditions.push(`tp.period_start >= $${idx}`)
    params.push(query.periodStart)
    idx++
  }

  if (query.periodEnd) {
    conditions.push(`tp.period_end <= $${idx}`)
    params.push(query.periodEnd)
    idx++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Number(query.limit) || 50, 200)
  const offset = Number(query.offset) || 0

  const timesheets = await queryRows(`
    SELECT
      tp.id,
      tp.user_id,
      tp.period_start,
      tp.period_end,
      tp.status,
      tp.total_hours,
      tp.billable_hours,
      tp.submitted_at,
      tp.approved_at,
      tp.approved_by,
      tp.rejection_reason,
      tp.created_at,
      tm.name AS user_name,
      tm.email AS user_email,
      approver.name AS approver_name
    FROM timesheet_periods tp
    LEFT JOIN team_members tm ON tp.user_id = tm.id
    LEFT JOIN team_members approver ON tp.approved_by = approver.id
    ${whereClause}
    ORDER BY tp.period_start DESC, tp.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, limit, offset])

  const countResult = await queryOne(`
    SELECT COUNT(*) AS total FROM timesheet_periods tp ${whereClause}
  `, params)

  return {
    timesheets: timesheets.map(ts => ({
      id: ts.id,
      userId: ts.user_id,
      periodStart: ts.period_start,
      periodEnd: ts.period_end,
      status: ts.status,
      totalHours: Number(ts.total_hours || 0),
      billableHours: Number(ts.billable_hours || 0),
      submittedAt: ts.submitted_at,
      approvedAt: ts.approved_at,
      approvedBy: ts.approved_by,
      rejectionReason: ts.rejection_reason,
      createdAt: ts.created_at,
      user: {
        id: ts.user_id,
        name: ts.user_name,
        email: ts.user_email
      },
      approver: ts.approved_by ? {
        id: ts.approved_by,
        name: ts.approver_name
      } : null
    })),
    pagination: {
      total: Number(countResult?.total || 0),
      limit,
      offset,
      hasMore: offset + timesheets.length < Number(countResult?.total || 0)
    }
  }
})
