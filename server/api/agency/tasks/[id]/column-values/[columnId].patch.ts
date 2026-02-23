/**
 * Upsert a single cell value for a task column
 * PATCH /api/agency/tasks/:id/column-values/:columnId
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { emitBoardEvent } from '~~/server/utils/boardEvents'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  const columnId = getRouterParam(event, 'columnId')

  if (!taskId || !columnId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID and Column ID are required' })
  }

  const body = await readBody(event)
  const { textValue, numberValue, dateValue, dateEndValue, jsonValue } = body

  try {
    // Verify task exists
    const task = await queryOne('SELECT id FROM tasks WHERE id = $1', [taskId])
    if (!task) {
      throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    }

    // Verify column exists
    const column = await queryOne('SELECT id FROM custom_columns WHERE id = $1', [columnId])
    if (!column) {
      throw createError({ statusCode: 404, statusMessage: 'Column not found' })
    }

    // Upsert the value
    const result = await queryOne(`
      INSERT INTO task_column_values (task_id, column_id, text_value, number_value, date_value, date_end_value, json_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (task_id, column_id) DO UPDATE SET
        text_value = COALESCE($3, task_column_values.text_value),
        number_value = COALESCE($4, task_column_values.number_value),
        date_value = COALESCE($5, task_column_values.date_value),
        date_end_value = COALESCE($6, task_column_values.date_end_value),
        json_value = COALESCE($7, task_column_values.json_value),
        updated_at = NOW()
      RETURNING
        id,
        task_id as "taskId",
        column_id as "columnId",
        text_value as "textValue",
        number_value as "numberValue",
        date_value as "dateValue",
        date_end_value as "dateEndValue",
        json_value as "jsonValue",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [
      taskId,
      columnId,
      textValue ?? null,
      numberValue ?? null,
      dateValue ?? null,
      dateEndValue ?? null,
      jsonValue ? JSON.stringify(jsonValue) : null,
    ])

    // Emit board event for real-time updates
    if (task && result) {
      // Look up the task's department_id for the board event
      const taskInfo = await queryOne('SELECT department_id FROM tasks WHERE id = $1', [taskId])
      if (taskInfo?.department_id) {
        emitBoardEvent({
          boardId: taskInfo.department_id,
          type: 'cell_updated',
          taskId: taskId!,
          columnId: columnId!,
          changes: { textValue, numberValue, dateValue, dateEndValue, jsonValue },
        })
      }
    }

    return result
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to upsert column value:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update column value: ${error.message}`,
    })
  }
})
