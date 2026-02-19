/**
 * Cancel a task approval
 * DELETE /api/agency/tasks/:id/approvals
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const taskId = getRouterParam(event, 'id')

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Verify task exists
    const task = await queryOne('SELECT id, title FROM tasks WHERE id = $1', [taskId])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Find the active approval
    const approval = await queryOne(`
      SELECT id, status FROM task_approvals
      WHERE task_id = $1 AND status IN ('pending', 'in_progress')
      ORDER BY created_at DESC
      LIMIT 1
    `, [taskId])

    if (!approval) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No active approval found for this task'
      })
    }

    await transaction(async (client) => {
      // Update approval status to cancelled
      await client.query(`
        UPDATE task_approvals
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
      `, [approval.id])

      // Log activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'approval_cancelled', $3)
      `, [
        taskId,
        user.id,
        'Approval workflow cancelled'
      ])
    })

    return {
      success: true,
      message: 'Approval workflow cancelled'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to cancel approval:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to cancel approval'
    })
  }
})
