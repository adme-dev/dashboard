/**
 * List Capacity Adjustments
 * GET /api/agency/capacity/adjustments
 *
 * Query params:
 * - teamMemberId: Filter by team member
 * - type: Filter by adjustment type
 * - startDate: Filter by start date (from)
 * - endDate: Filter by end date (to)
 * - includeExpired: Include past adjustments (default false)
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (query.teamMemberId) {
      conditions.push(`ca.team_member_id = $${idx++}`)
      params.push(query.teamMemberId)
    }

    if (query.type) {
      conditions.push(`ca.adjustment_type = $${idx++}`)
      params.push(query.type)
    }

    if (query.startDate) {
      conditions.push(`ca.end_date >= $${idx++}`)
      params.push(query.startDate)
    }

    if (query.endDate) {
      conditions.push(`ca.start_date <= $${idx++}`)
      params.push(query.endDate)
    }

    // By default, only show future/current adjustments
    if (!query.includeExpired) {
      conditions.push('ca.end_date >= CURRENT_DATE')
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : ''

    const adjustments = await queryRows(`
      SELECT
        ca.id,
        ca.team_member_id,
        tm.name AS team_member_name,
        tm.email AS team_member_email,
        ca.department_id,
        d.name AS department_name,
        ca.adjustment_type,
        ca.start_date,
        ca.end_date,
        ca.hours_per_day,
        ca.adjusted_hours_per_day,
        ca.is_recurring,
        ca.recurrence_pattern,
        ca.title,
        ca.description,
        ca.is_approved,
        ca.approved_by,
        approver.name AS approved_by_name,
        ca.created_at,
        ca.updated_at,
        (ca.end_date - ca.start_date + 1) AS total_days,
        (ca.end_date - ca.start_date + 1) * (ca.hours_per_day - ca.adjusted_hours_per_day) AS hours_impact
      FROM capacity_adjustments ca
      LEFT JOIN team_members tm ON ca.team_member_id = tm.id
      LEFT JOIN departments d ON ca.department_id = d.id
      LEFT JOIN team_members approver ON ca.approved_by = approver.id
      ${whereClause}
      ORDER BY ca.start_date, tm.name
    `, params)

    // Group by type for summary
    const byType = new Map<string, number>()
    let totalHoursImpact = 0

    for (const adj of adjustments) {
      const count = byType.get(adj.adjustment_type) || 0
      byType.set(adj.adjustment_type, count + 1)
      totalHoursImpact += Number(adj.hours_impact || 0)
    }

    return {
      adjustments: adjustments.map(a => ({
        id: a.id,
        teamMember: a.team_member_id ? {
          id: a.team_member_id,
          name: a.team_member_name,
          email: a.team_member_email
        } : null,
        department: a.department_id ? {
          id: a.department_id,
          name: a.department_name
        } : null,
        type: a.adjustment_type,
        startDate: a.start_date,
        endDate: a.end_date,
        hoursPerDay: a.hours_per_day,
        adjustedHoursPerDay: a.adjusted_hours_per_day,
        isRecurring: a.is_recurring,
        recurrencePattern: a.recurrence_pattern,
        title: a.title,
        description: a.description,
        isApproved: a.is_approved,
        approvedBy: a.approved_by ? {
          id: a.approved_by,
          name: a.approved_by_name
        } : null,
        totalDays: a.total_days,
        hoursImpact: a.hours_impact,
        createdAt: a.created_at,
        updatedAt: a.updated_at
      })),
      summary: {
        total: adjustments.length,
        byType: Object.fromEntries(byType),
        totalHoursImpact
      }
    }
  } catch (error) {
    console.error('Failed to fetch capacity adjustments:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch capacity adjustments'
    })
  }
})
