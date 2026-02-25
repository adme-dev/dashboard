/**
 * Upsert a single cell value for a task column
 * PATCH /api/agency/tasks/:id/column-values/:columnId
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { emitBoardEvent } from '~~/server/utils/boardEvents'
import { notifyBoardSubscribers } from '~~/server/utils/boardNotifications'
import { evaluateAutomations } from '~~/server/utils/automationEngine'
import { enqueue } from '~~/server/utils/queue'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  const columnId = getRouterParam(event, 'columnId')

  if (!taskId || !columnId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID and Column ID are required' })
  }

  const body = await readBody(event)
  // Track which fields were explicitly provided (even if null) vs not provided
  const hasText = 'textValue' in body
  const hasNumber = 'numberValue' in body
  const hasDate = 'dateValue' in body
  const hasDateEnd = 'dateEndValue' in body
  const hasJson = 'jsonValue' in body
  const { textValue, numberValue, dateValue, dateEndValue, jsonValue } = body

  try {
    // Verify task exists
    const task = await queryOne('SELECT id FROM tasks WHERE id = $1', [taskId])
    if (!task) {
      throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    }

    // Verify column exists (check custom_columns first, then legacy board_columns)
    let column = await queryOne('SELECT id FROM custom_columns WHERE id = $1', [columnId])
    if (!column) {
      // Check legacy board_columns and auto-migrate if found
      const legacyCol = await queryOne(
        'SELECT id, department_id, name, slug, type, settings, sort_order, is_visible FROM board_columns WHERE id = $1',
        [columnId]
      )
      if (legacyCol) {
        // Map legacy types to valid column_type enum values
        const typeMap: Record<string, string> = { label: 'status', numbers: 'number' }
        const mappedType = typeMap[legacyCol.type] || legacyCol.type || 'text'

        // Auto-migrate to custom_columns
        column = await queryOne(`
          INSERT INTO custom_columns (id, department_id, name, slug, column_type, settings, sort_order, is_visible)
          VALUES ($1, $2, $3, $4, $5::column_type, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `, [
          legacyCol.id,
          legacyCol.department_id,
          legacyCol.name,
          legacyCol.slug,
          mappedType,
          legacyCol.settings ? JSON.stringify(legacyCol.settings) : '{}',
          legacyCol.sort_order || 0,
          legacyCol.is_visible ?? true,
        ]).catch(() => ({ id: legacyCol.id })) // If migration fails, still allow the write
        if (!column) column = { id: legacyCol.id }
      }
    }
    if (!column) {
      throw createError({ statusCode: 404, statusMessage: 'Column not found' })
    }

    // Upsert the value
    // Use direct assignment for explicitly provided fields (allows clearing to NULL)
    // Use COALESCE only for fields that were NOT provided in the request body
    const result = await queryOne(`
      INSERT INTO task_column_values (task_id, column_id, text_value, number_value, date_value, date_end_value, json_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (task_id, column_id) DO UPDATE SET
        text_value = ${hasText ? '$3' : 'COALESCE($3, task_column_values.text_value)'},
        number_value = ${hasNumber ? '$4' : 'COALESCE($4, task_column_values.number_value)'},
        date_value = ${hasDate ? '$5' : 'COALESCE($5, task_column_values.date_value)'},
        date_end_value = ${hasDateEnd ? '$6' : 'COALESCE($6, task_column_values.date_end_value)'},
        json_value = ${hasJson ? '$7' : 'COALESCE($7, task_column_values.json_value)'},
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
      jsonValue != null ? JSON.stringify(jsonValue) : null,
    ])

    // Emit board event for real-time updates
    if (task && result) {
      // Look up the task's department_id for the board event
      const taskInfo = await queryOne('SELECT department_id FROM tasks WHERE id = $1', [taskId])
      if (taskInfo?.department_id) {
        const cellChanges = { textValue, numberValue, dateValue, dateEndValue, jsonValue }

        emitBoardEvent({
          boardId: taskInfo.department_id,
          type: 'cell_updated',
          taskId: taskId!,
          columnId: columnId!,
          changes: cellChanges,
        }, event)

        const boardEvent = {
          boardId: taskInfo.department_id,
          type: 'cell_updated',
          taskId: taskId!,
          columnId: columnId!,
          actorId: user.id,
          changes: cellChanges,
        }

        // Notify board subscribers (queued with retry, fallback to fire-and-forget)
        enqueue(event, 'board.notify', boardEvent, () => notifyBoardSubscribers(boardEvent))

        // Evaluate board automations (queued with retry, fallback to fire-and-forget)
        enqueue(event, 'board.automate', boardEvent, () => evaluateAutomations(taskInfo.department_id, boardEvent))
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
