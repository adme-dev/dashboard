/**
 * Update task assignee (quick assignment change)
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { notifyTaskAssigneeChanged } from '~~/server/utils/notifications'
import { runCappedBeforeResponse } from '~~/server/utils/asyncBackground'

interface UpdateAssigneeBody {
  assigneeId: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const actorUserId = user.id

  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateAssigneeBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Get current task
    const currentTask = await queryOne(`
      SELECT t.*, tm.name as old_assignee_name
      FROM tasks t
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      WHERE t.id = $1
    `, [id])

    if (!currentTask) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Get new assignee info (if provided)
    let newAssigneeName = null
    if (body.assigneeId) {
      const newAssignee = await queryOne('SELECT id, name FROM team_members WHERE id = $1', [body.assigneeId])
      if (!newAssignee) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid assignee ID'
        })
      }
      newAssigneeName = newAssignee.name
    }

    // No change needed
    if (currentTask.assignee_id === body.assigneeId) {
      return { success: true, message: 'Assignee unchanged' }
    }

    await transaction(async (client) => {
      // Update task assignee
      await client.query(`
        UPDATE tasks
        SET assignee_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [body.assigneeId || null, id])

      // Log assignee change activity
      const activityContent = body.assigneeId
        ? currentTask.assignee_id
          ? `Reassigned from "${currentTask.old_assignee_name}" to "${newAssigneeName}"`
          : `Assigned to "${newAssigneeName}"`
        : `Unassigned from "${currentTask.old_assignee_name}"`

      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content, old_value, new_value)
        VALUES ($1, $2, 'assignment', $3, $4, $5)
      `, [
        id,
        actorUserId,
        activityContent,
        JSON.stringify({ assigneeId: currentTask.assignee_id, assigneeName: currentTask.old_assignee_name }),
        JSON.stringify({ assigneeId: body.assigneeId, assigneeName: newAssigneeName }),
      ])
    })

    // Return updated task
    const updatedTask = await queryOne(`
      SELECT t.assignee_id, tm.name as assignee_name, tm.email as assignee_email
      FROM tasks t
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      WHERE t.id = $1
    `, [id])

    // Send notification (helper handles unchanged/unassign/self-assignment skips).
    // Capped in-request so the write can't be silently lost on Cloudflare
    // Workers (bare .catch() fire-and-forget / waitUntil would be killed).
    await runCappedBeforeResponse(notifyTaskAssigneeChanged({
      taskId: id,
      taskTitle: currentTask.title,
      oldAssigneeId: currentTask.assignee_id,
      newAssigneeId: body.assigneeId || null,
      actorId: actorUserId,
      dueDate: currentTask.due_date ? new Date(currentTask.due_date) : undefined,
    }), 'notifyTaskAssigneeChanged')

    return {
      id,
      assigneeId: updatedTask.assignee_id,
      assignee: updatedTask.assignee_id ? {
        id: updatedTask.assignee_id,
        name: updatedTask.assignee_name,
        email: updatedTask.assignee_email,
      } : null,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update task assignee:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update task assignee'
    })
  }
})
