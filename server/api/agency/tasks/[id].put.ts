/**
 * Update a task
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { emitBoardEvent } from '~~/server/utils/boardEvents'
import { notifyBoardSubscribers } from '~~/server/utils/boardNotifications'
import { evaluateAutomations } from '~~/server/utils/automationEngine'
import { enqueue } from '~~/server/utils/queue'
import { postBoardEventToChat } from '~~/server/utils/boardChatBridge'
import { notifyTaskAssigneeChanged } from '~~/server/utils/notifications'

interface UpdateTaskBody {
  title?: string
  description?: string
  projectId?: string | null
  parentTaskId?: string | null
  statusId?: string
  priority?: 'urgent' | 'high' | 'medium' | 'low'
  taskType?: string
  assigneeId?: string | null
  reporterId?: string | null
  dueDate?: string | null
  startDate?: string | null
  estimatedHours?: number | null
  actualHours?: number | null
  sortOrder?: number
  isBlocked?: boolean
  blockedReason?: string | null
  groupId?: string | null
  labels?: string[]
  estimatedCost?: number | null
  actualCost?: number | null
  billingRate?: number | null
  currency?: string
  isBillable?: boolean
  quoteLineItemId?: string | null
  briefId?: string | null
  budgetSource?: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const actorUserId = user.id

  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateTaskBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Get current task state for activity logging
    const currentTask = await queryOne('SELECT * FROM tasks WHERE id = $1', [id])
    if (!currentTask) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Build dynamic update
    const fields: string[] = []
    const values: any[] = []
    const changes: { field: string; oldValue: any; newValue: any }[] = []
    let idx = 1

    const trackChange = (field: string, dbField: string, newValue: any, oldValue: any) => {
      if (newValue !== undefined && newValue !== oldValue) {
        fields.push(`${dbField} = $${idx}`)
        values.push(newValue)
        changes.push({ field, oldValue, newValue })
        idx++
      }
    }

    if (body.title !== undefined) {
      trackChange('title', 'title', body.title.trim(), currentTask.title)
    }

    if (body.description !== undefined) {
      trackChange('description', 'description', body.description?.trim() || null, currentTask.description)
    }

    if (body.projectId !== undefined) {
      trackChange('project', 'project_id', body.projectId || null, currentTask.project_id)
    }

    if (body.parentTaskId !== undefined) {
      trackChange('parent_task', 'parent_task_id', body.parentTaskId || null, currentTask.parent_task_id)
    }

    if (body.statusId !== undefined) {
      trackChange('status', 'status_id', body.statusId, currentTask.status_id)
    }

    if (body.priority !== undefined) {
      trackChange('priority', 'priority', body.priority, currentTask.priority)
    }

    if (body.taskType !== undefined) {
      trackChange('task_type', 'task_type', body.taskType, currentTask.task_type)
    }

    if (body.assigneeId !== undefined) {
      trackChange('assignee', 'assignee_id', body.assigneeId || null, currentTask.assignee_id)
    }

    if (body.reporterId !== undefined) {
      trackChange('reporter', 'reporter_id', body.reporterId || null, currentTask.reporter_id)
    }

    if (body.dueDate !== undefined) {
      trackChange('due_date', 'due_date', body.dueDate || null, currentTask.due_date)
    }

    if (body.startDate !== undefined) {
      trackChange('start_date', 'start_date', body.startDate || null, currentTask.start_date)
    }

    if (body.estimatedHours !== undefined) {
      trackChange('estimated_hours', 'estimated_hours', body.estimatedHours, currentTask.estimated_hours)
    }

    if (body.actualHours !== undefined) {
      trackChange('actual_hours', 'actual_hours', body.actualHours, currentTask.actual_hours)
    }

    if (body.sortOrder !== undefined) {
      trackChange('sort_order', 'sort_order', body.sortOrder, currentTask.sort_order)
    }

    if (body.isBlocked !== undefined) {
      trackChange('is_blocked', 'is_blocked', body.isBlocked, currentTask.is_blocked)
    }

    if (body.blockedReason !== undefined) {
      trackChange('blocked_reason', 'blocked_reason', body.blockedReason || null, currentTask.blocked_reason)
    }

    if (body.groupId !== undefined) {
      trackChange('group', 'group_id', body.groupId || null, currentTask.group_id)
    }

    if (body.estimatedCost !== undefined) {
      trackChange('estimated_cost', 'estimated_cost', body.estimatedCost, currentTask.estimated_cost)
    }
    if (body.actualCost !== undefined) {
      trackChange('actual_cost', 'actual_cost', body.actualCost, currentTask.actual_cost)
    }
    if (body.billingRate !== undefined) {
      trackChange('billing_rate', 'billing_rate', body.billingRate, currentTask.billing_rate)
    }
    if (body.currency !== undefined) {
      trackChange('currency', 'currency', body.currency, currentTask.currency)
    }
    if (body.isBillable !== undefined) {
      trackChange('is_billable', 'is_billable', body.isBillable, currentTask.is_billable)
    }
    if (body.quoteLineItemId !== undefined) {
      trackChange('quote_line_item', 'quote_line_item_id', body.quoteLineItemId || null, currentTask.quote_line_item_id)
    }
    if (body.briefId !== undefined) {
      trackChange('brief', 'brief_id', body.briefId || null, currentTask.brief_id)
    }
    if (body.budgetSource !== undefined) {
      trackChange('budget_source', 'budget_source', body.budgetSource || 'manual', currentTask.budget_source)
    }

    // Auto-populate from quote line item when linking
    if (body.quoteLineItemId) {
      try {
        const qli = await queryOne(`
          SELECT line_total, hourly_rate, estimated_hours
          FROM quote_line_items WHERE id = $1
        `, [body.quoteLineItemId])
        if (qli) {
          // Count how many tasks share this line item (including this one)
          const shared = await queryOne(`
            SELECT COUNT(*)::int AS count FROM tasks WHERE quote_line_item_id = $1 AND id != $2
          `, [body.quoteLineItemId, id])
          const sharedCount = (shared?.count || 0) + 1

          const lineTotal = Number(qli.line_total || 0)
          if (lineTotal > 0 && body.estimatedCost === undefined) {
            trackChange('estimated_cost', 'estimated_cost', lineTotal / sharedCount, currentTask.estimated_cost)
          }
          if (qli.hourly_rate && body.billingRate === undefined) {
            trackChange('billing_rate', 'billing_rate', Number(qli.hourly_rate), currentTask.billing_rate)
          }
          if (qli.estimated_hours && body.estimatedHours === undefined) {
            trackChange('estimated_hours', 'estimated_hours', Number(qli.estimated_hours) / sharedCount, currentTask.estimated_hours)
          }
          if (body.budgetSource === undefined) {
            trackChange('budget_source', 'budget_source', 'quote', currentTask.budget_source)
          }
        }
      } catch { /* non-critical */ }
    }

    // Auto-calculate estimated_cost when hours AND rate are both available
    if (body.estimatedHours !== undefined || body.billingRate !== undefined) {
      const hrs = body.estimatedHours !== undefined ? body.estimatedHours : currentTask.estimated_hours
      const rate = body.billingRate !== undefined ? body.billingRate : currentTask.billing_rate
      if (hrs != null && rate != null && body.estimatedCost === undefined) {
        const autoEstCost = Number(hrs) * Number(rate)
        trackChange('estimated_cost', 'estimated_cost', autoEstCost, currentTask.estimated_cost)
      }
    }

    const result = await transaction(async (client) => {
      let updatedTask = currentTask

      // Update task fields if any
      if (fields.length > 0) {
        values.push(id)
        const updateResult = await client.query(`
          UPDATE tasks
          SET ${fields.join(', ')}, updated_at = NOW()
          WHERE id = $${idx}
          RETURNING *
        `, values)
        updatedTask = updateResult.rows[0]

        // Log field changes
        for (const change of changes) {
          await client.query(`
            INSERT INTO task_activities (task_id, user_id, activity_type, content, old_value, new_value)
            VALUES ($1, $2, 'updated', $3, $4, $5)
          `, [
            id,
            actorUserId,
            `Changed ${change.field}`,
            JSON.stringify(change.oldValue),
            JSON.stringify(change.newValue),
          ])
        }
      }

      // Update labels if provided
      if (body.labels !== undefined) {
        // Remove existing labels
        await client.query('DELETE FROM task_label_assignments WHERE task_id = $1', [id])

        // Add new labels
        for (const labelId of body.labels) {
          await client.query(`
            INSERT INTO task_label_assignments (task_id, label_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [id, labelId])
        }
      }

      return updatedTask
    })

    // Auto-subscribe assignee to board item BEFORE notifying subscribers,
    // so the new assignee is included in the notification fan-out.
    if (body.assigneeId && currentTask.department_id) {
      const { autoSubscribe } = await import('~~/server/utils/subscriptions')
      try {
        await autoSubscribe(body.assigneeId, currentTask.department_id, id)
      } catch (err) {
        console.error('Auto-subscribe failed:', err)
      }
    }

    // Emit board event for real-time updates
    if (currentTask.department_id && changes.length > 0) {
      emitBoardEvent({
        boardId: currentTask.department_id,
        type: 'task_updated',
        taskId: id,
        changes: Object.fromEntries(changes.map(c => [c.field, c.newValue])),
      }, event)

      const boardEvent = {
        boardId: currentTask.department_id,
        type: 'task_updated',
        taskId: id,
        actorId: actorUserId,
        changes: Object.fromEntries(changes.map(c => [c.field, c.newValue])),
      }

      // Notify board subscribers (queued with retry, fallback to fire-and-forget)
      enqueue(event, 'board.notify', boardEvent, () => notifyBoardSubscribers(boardEvent))

      // Evaluate board automations (queued with retry, fallback to fire-and-forget)
      enqueue(event, 'board.automate', boardEvent, () => evaluateAutomations(currentTask.department_id, boardEvent))

      // Post to linked chat channels (fire-and-forget)
      postBoardEventToChat({
        ...boardEvent,
        taskTitle: currentTask.title,
      }).catch(() => {})
    }

    // Notify the new assignee directly (in-app + email).
    // The helper handles unchanged/unassign/self-assignment skips.
    if (body.assigneeId !== undefined) {
      notifyTaskAssigneeChanged({
        taskId: id,
        taskTitle: currentTask.title,
        oldAssigneeId: currentTask.assignee_id,
        newAssigneeId: body.assigneeId || null,
        actorId: actorUserId,
        dueDate: currentTask.due_date ? new Date(currentTask.due_date) : undefined,
      }).catch(err => console.error('Failed to send assignment notification:', err))
    }

    // Fetch complete updated task
    const task = await queryOne(`
      SELECT
        t.*,
        ts.name as status_name,
        ts.color as status_color,
        t.status_is_final as status_is_final,
        d.name as department_name,
        assignee.name as assignee_name
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE t.id = $1
    `, [id])

    return {
      id: task.id,
      projectId: task.project_id,
      departmentId: task.department_id,
      parentTaskId: task.parent_task_id,
      statusId: task.status_id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      taskType: task.task_type,
      assigneeId: task.assignee_id,
      reporterId: task.reporter_id,
      dueDate: task.due_date,
      startDate: task.start_date,
      estimatedHours: task.estimated_hours ? Number(task.estimated_hours) : null,
      actualHours: task.actual_hours ? Number(task.actual_hours) : null,
      estimatedCost: task.estimated_cost != null ? Number(task.estimated_cost) : null,
      actualCost: task.actual_cost != null ? Number(task.actual_cost) : null,
      billingRate: task.billing_rate != null ? Number(task.billing_rate) : null,
      currency: task.currency || 'AUD',
      isBillable: task.is_billable ?? true,
      quoteLineItemId: task.quote_line_item_id || null,
      briefId: task.brief_id || null,
      budgetSource: task.budget_source || 'manual',
      sortOrder: task.sort_order,
      isBlocked: task.is_blocked,
      blockedReason: task.blocked_reason,
      completedAt: task.completed_at,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      status: {
        id: task.status_id,
        name: task.status_name,
        color: task.status_color,
        isFinal: task.status_is_final,
      },
      department: {
        id: task.department_id,
        name: task.department_name,
      },
      assignee: task.assignee_id ? {
        id: task.assignee_id,
        name: task.assignee_name,
      } : null,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update task'
    })
  }
})
