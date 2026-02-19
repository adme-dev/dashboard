/**
 * Bulk Update Tasks
 * PATCH /api/agency/tasks/bulk
 *
 * Update multiple tasks at once
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { taskIds, updates } = body

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'taskIds must be a non-empty array'
    })
  }

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'updates must be a non-empty object'
    })
  }

  // Allowed fields to update
  const allowedFields: Record<string, string> = {
    statusId: 'status_id',
    priority: 'priority',
    assigneeId: 'assignee_id',
    dueDate: 'due_date',
    isBlocked: 'is_blocked'
  }

  // Build update clause
  const setClauses: string[] = []
  const values: any[] = []
  let paramIndex = 1

  for (const [key, value] of Object.entries(updates)) {
    const dbField = allowedFields[key]
    if (!dbField) continue

    setClauses.push(`${dbField} = $${paramIndex}`)
    values.push(value)
    paramIndex++
  }

  if (setClauses.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No valid fields to update'
    })
  }

  // Add updated_at
  setClauses.push(`updated_at = NOW()`)

  try {
    // Build the task IDs parameter
    const taskIdPlaceholders = taskIds.map((_, i) => `$${paramIndex + i}`).join(', ')
    values.push(...taskIds)

    const sql = `
      UPDATE tasks
      SET ${setClauses.join(', ')}
      WHERE id IN (${taskIdPlaceholders})
      RETURNING id
    `

    const result = await queryRows(sql, values)

    return {
      success: true,
      updatedCount: result.length,
      updatedIds: result.map(r => r.id)
    }
  } catch (error: any) {
    console.error('Failed to bulk update tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to bulk update tasks'
    })
  }
})
