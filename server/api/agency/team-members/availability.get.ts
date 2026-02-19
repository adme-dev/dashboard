/**
 * Get Team Member Availability
 * GET /api/agency/team-members/availability
 *
 * Returns availability information for team members
 * Query params:
 * - startDate: Start of period (default: today)
 * - endDate: End of period (default: 2 weeks from start)
 * - memberId: Filter to specific member
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)

  // Default to current date and 2 weeks ahead
  const today = new Date()
  const twoWeeksLater = new Date(today)
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14)

  const startDate = (query.startDate as string) || today.toISOString().split('T')[0]
  const endDate = (query.endDate as string) || twoWeeksLater.toISOString().split('T')[0]
  const memberId = query.memberId as string | undefined

  try {
    // Get active team members with their capacity settings
    let memberSql = `
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.department,
        tm.target_utilization,
        tm.avatar_url,
        COALESCE(tm.weekly_capacity, 40) as weekly_capacity
      FROM team_members tm
      WHERE tm.is_active = true
    `
    const memberParams: any[] = []

    if (memberId) {
      memberSql += ` AND tm.id = $1`
      memberParams.push(memberId)
    }

    memberSql += ' ORDER BY tm.name'

    const members = await queryRows(memberSql, memberParams)

    // Get scheduled time entries (tasks with dates) for the period
    const scheduledWork = await queryRows(`
      SELECT
        t.assignee_id,
        t.due_date,
        t.start_date,
        t.estimated_hours,
        t.title,
        ts.is_final
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.assignee_id IS NOT NULL
        AND ts.is_final = false
        AND (
          (t.due_date >= $1 AND t.due_date <= $2)
          OR (t.start_date >= $1 AND t.start_date <= $2)
          OR (t.start_date <= $1 AND t.due_date >= $2)
        )
    `, [startDate, endDate])

    // Get time already logged in this period
    const loggedTime = await queryRows(`
      SELECT
        user_id,
        date,
        SUM(hours) as hours
      FROM time_entries
      WHERE date >= $1 AND date <= $2
      GROUP BY user_id, date
    `, [startDate, endDate])

    // Get time off / unavailability (if we have such a table)
    // For now, we'll skip this as the schema doesn't include time-off tracking

    // Calculate availability for each member
    const availability = members.map(member => {
      const weeklyCapacity = Number(member.weekly_capacity) || 40
      const dailyCapacity = weeklyCapacity / 5 // Assuming 5-day work week

      // Get member's scheduled tasks
      const memberTasks = scheduledWork.filter(t => t.assignee_id === member.id)
      const totalScheduledHours = memberTasks.reduce((sum, t) => sum + (Number(t.estimated_hours) || 0), 0)

      // Get member's logged time
      const memberLoggedTime = loggedTime.filter(t => t.user_id === member.id)
      const totalLoggedHours = memberLoggedTime.reduce((sum, t) => sum + Number(t.hours), 0)

      // Calculate working days in period
      const start = new Date(startDate as string)
      const end = new Date(endDate as string)
      let workingDays = 0
      const current = new Date(start)
      while (current <= end) {
        const dayOfWeek = current.getDay()
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
          workingDays++
        }
        current.setDate(current.getDate() + 1)
      }

      const periodCapacity = workingDays * dailyCapacity
      const availableHours = Math.max(0, periodCapacity - totalScheduledHours - totalLoggedHours)
      const utilizationPercent = periodCapacity > 0
        ? Math.round(((totalScheduledHours + totalLoggedHours) / periodCapacity) * 100)
        : 0

      // Determine availability status
      let status: 'available' | 'limited' | 'busy' | 'overbooked'
      if (utilizationPercent < 50) {
        status = 'available'
      } else if (utilizationPercent < 80) {
        status = 'limited'
      } else if (utilizationPercent <= 100) {
        status = 'busy'
      } else {
        status = 'overbooked'
      }

      return {
        memberId: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        department: member.department,
        avatarUrl: member.avatar_url,
        weeklyCapacity,
        dailyCapacity,
        periodCapacity,
        scheduledHours: totalScheduledHours,
        loggedHours: totalLoggedHours,
        availableHours,
        utilizationPercent,
        status,
        upcomingTasks: memberTasks.slice(0, 5).map(t => ({
          title: t.title,
          dueDate: t.due_date,
          estimatedHours: Number(t.estimated_hours) || 0
        }))
      }
    })

    // Summary stats
    const summary = {
      totalMembers: availability.length,
      availableMembers: availability.filter(a => a.status === 'available').length,
      limitedMembers: availability.filter(a => a.status === 'limited').length,
      busyMembers: availability.filter(a => a.status === 'busy').length,
      overbookedMembers: availability.filter(a => a.status === 'overbooked').length,
      totalCapacity: availability.reduce((sum, a) => sum + a.periodCapacity, 0),
      totalScheduled: availability.reduce((sum, a) => sum + a.scheduledHours, 0),
      totalAvailable: availability.reduce((sum, a) => sum + a.availableHours, 0),
      avgUtilization: availability.length > 0
        ? Math.round(availability.reduce((sum, a) => sum + a.utilizationPercent, 0) / availability.length)
        : 0
    }

    return {
      period: {
        startDate,
        endDate
      },
      availability,
      summary
    }
  } catch (error) {
    console.error('Failed to fetch team availability:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch team availability'
    })
  }
})
