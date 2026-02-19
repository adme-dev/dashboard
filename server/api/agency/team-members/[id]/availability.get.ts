/**
 * Get Single Team Member Availability
 * GET /api/agency/team-members/:id/availability
 *
 * Returns detailed availability for a specific team member
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface Task {
  id: string
  title: string
  due_date: string | null
  start_date: string | null
  estimated_hours: number | null
  priority: string
  project_name: string | null
  status_name: string
  status_color: string
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const memberId = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!memberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Team member ID is required'
    })
  }

  // Default to current week
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay() + 1) // Monday

  const endOfPeriod = new Date(startOfWeek)
  endOfPeriod.setDate(startOfWeek.getDate() + 27) // 4 weeks

  const startDateStr = (query.startDate as string) || formatDate(startOfWeek)
  const endDateStr = (query.endDate as string) || formatDate(endOfPeriod)

  try {
    // Get team member
    const member = await queryOne(`
      SELECT
        id,
        name,
        email,
        role,
        department,
        target_utilization,
        avatar_url,
        COALESCE(weekly_capacity, 40) as weekly_capacity
      FROM team_members
      WHERE id = $1
    `, [memberId])

    if (!member) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Team member not found'
      })
    }

    const weeklyCapacity = Number(member.weekly_capacity) || 40
    const dailyCapacity = weeklyCapacity / 5

    // Get assigned tasks
    const tasks = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.due_date,
        t.start_date,
        t.estimated_hours,
        t.priority,
        p.name as project_name,
        ts.name as status_name,
        ts.color as status_color
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.assignee_id = $1
        AND ts.is_final = false
        AND (
          t.due_date >= $2
          OR t.start_date >= $2
          OR (t.start_date IS NULL AND t.due_date IS NULL)
        )
      ORDER BY
        t.due_date ASC NULLS LAST,
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `, [memberId, startDateStr]) as Task[]

    // Get logged time by day
    const timeEntries = await queryRows(`
      SELECT
        date,
        SUM(hours) as hours
      FROM time_entries
      WHERE user_id = $1
        AND date >= $2
        AND date <= $3
      GROUP BY date
      ORDER BY date
    `, [memberId, startDateStr, endDateStr])

    // Build daily breakdown
    const dailyBreakdown: Array<{
      date: string
      dayOfWeek: string
      capacity: number
      logged: number
      scheduled: number
      available: number
      isWeekend: boolean
    }> = []

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const start = new Date(startDateStr)
    const end = new Date(endDateStr)
    const current = new Date(start)

    const timeByDate = new Map<string, number>()
    for (const t of timeEntries) {
      const dateKey = formatDate(new Date(t.date))
      timeByDate.set(dateKey, Number(t.hours))
    }

    while (current <= end) {
      const dateStr = formatDate(current)
      const dayOfWeek = current.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

      const capacity = isWeekend ? 0 : dailyCapacity
      const logged = timeByDate.get(dateStr) || 0

      // Calculate scheduled hours for this day from tasks
      // (simplified: spread task hours evenly across their duration)
      let scheduled = 0
      for (const task of tasks) {
        if (!task.due_date && !task.start_date) continue
        const taskStartStr = task.start_date || task.due_date
        const taskEndStr = task.due_date || task.start_date
        if (!taskStartStr || !taskEndStr) continue

        const taskStart = new Date(taskStartStr)
        const taskEnd = new Date(taskEndStr)
        const currentDate = new Date(dateStr)

        if (currentDate >= taskStart && currentDate <= taskEnd) {
          // Task spans this day
          const taskDuration = Math.max(1, Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
          const hoursPerDay = (Number(task.estimated_hours) || 0) / taskDuration
          scheduled += hoursPerDay
        }
      }

      dailyBreakdown.push({
        date: dateStr,
        dayOfWeek: dayNames[dayOfWeek] ?? 'Unknown',
        capacity,
        logged,
        scheduled: Math.round(scheduled * 10) / 10,
        available: Math.max(0, capacity - logged - scheduled),
        isWeekend
      })

      current.setDate(current.getDate() + 1)
    }

    // Calculate totals
    const totalCapacity = dailyBreakdown.reduce((sum, d) => sum + d.capacity, 0)
    const totalLogged = dailyBreakdown.reduce((sum, d) => sum + d.logged, 0)
    const totalScheduled = dailyBreakdown.reduce((sum, d) => sum + d.scheduled, 0)
    const totalAvailable = dailyBreakdown.reduce((sum, d) => sum + d.available, 0)

    return {
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        department: member.department,
        avatarUrl: member.avatar_url,
        weeklyCapacity,
        dailyCapacity
      },
      period: {
        startDate: startDateStr,
        endDate: endDateStr
      },
      summary: {
        totalCapacity,
        totalLogged,
        totalScheduled,
        totalAvailable,
        utilizationPercent: totalCapacity > 0
          ? Math.round(((totalLogged + totalScheduled) / totalCapacity) * 100)
          : 0
      },
      dailyBreakdown,
      upcomingTasks: tasks.slice(0, 10).map(t => ({
        id: t.id,
        title: t.title,
        projectName: t.project_name,
        dueDate: t.due_date,
        startDate: t.start_date,
        estimatedHours: Number(t.estimated_hours) || 0,
        priority: t.priority,
        status: {
          name: t.status_name,
          color: t.status_color
        }
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch member availability:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch member availability'
    })
  }
})
