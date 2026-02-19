/**
 * Get time entries for a specific task
 * GET /api/agency/tasks/:id/time-entries
 *
 * Returns all time entries linked to this task with summary stats
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const taskId = getRouterParam(event, 'id')

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Verify task exists
    const task = await queryOne(`
      SELECT id, title, estimated_hours, actual_hours
      FROM tasks
      WHERE id = $1
    `, [taskId])

    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Get time entries for this task
    const entries = await queryRows(`
      SELECT
        te.id,
        te.user_id,
        te.project_id,
        te.date,
        te.hours,
        te.billable,
        te.hourly_rate,
        te.description,
        te.notes,
        te.status,
        te.approved,
        te.created_at,
        tm.name AS user_name,
        tm.avatar_url AS user_avatar
      FROM time_entries te
      LEFT JOIN team_members tm ON te.user_id = tm.id
      WHERE te.task_id = $1
      ORDER BY te.date DESC, te.created_at DESC
    `, [taskId])

    // Calculate summary
    const totalHours = entries.reduce((sum, e) => sum + Number(e.hours), 0)
    const billableHours = entries.reduce((sum, e) => sum + (e.billable ? Number(e.hours) : 0), 0)
    const totalValue = entries.reduce((sum, e) => sum + (Number(e.hours) * Number(e.hourly_rate)), 0)

    // Calculate variance from estimate
    const estimatedHours = Number(task.estimated_hours) || 0
    const variance = totalHours - estimatedHours
    const variancePercent = estimatedHours > 0
      ? Math.round((variance / estimatedHours) * 100)
      : 0

    return {
      task: {
        id: task.id,
        title: task.title,
        estimatedHours,
        actualHours: totalHours
      },
      entries: entries.map(e => ({
        id: e.id,
        userId: e.user_id,
        userName: e.user_name,
        userAvatar: e.user_avatar,
        projectId: e.project_id,
        date: e.date,
        hours: Number(e.hours),
        billable: e.billable,
        hourlyRate: Number(e.hourly_rate),
        description: e.description,
        notes: e.notes,
        status: e.status || 'draft',
        approved: e.approved,
        createdAt: e.created_at,
        value: Number(e.hours) * Number(e.hourly_rate)
      })),
      summary: {
        totalEntries: entries.length,
        totalHours: Math.round(totalHours * 100) / 100,
        billableHours: Math.round(billableHours * 100) / 100,
        nonBillableHours: Math.round((totalHours - billableHours) * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        estimatedHours,
        variance: Math.round(variance * 100) / 100,
        variancePercent,
        isOverBudget: variance > 0 && estimatedHours > 0
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch task time entries:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch task time entries'
    })
  }
})
