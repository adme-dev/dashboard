/**
 * Reorder task statuses (for drag-and-drop column ordering)
 */

import { queryRows, transaction } from '~~/server/utils/db'
import { requireBoardAccess, requireWriteAccess } from '~~/server/utils/auth'

interface ReorderItem {
  id: string
  sortOrder: number
}

interface ReorderBody {
  statuses: ReorderItem[]
}

interface StatusScopeRow {
  id: string
  department_id: string | null
}

function isHttpError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = await readBody<ReorderBody>(event)

  if (!body.statuses || !Array.isArray(body.statuses) || body.statuses.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Statuses array is required'
    })
  }

  if (body.statuses.some(status => !status.id || !Number.isInteger(status.sortOrder) || status.sortOrder < 0)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Every status requires an ID and a non-negative integer sort order'
    })
  }

  const statusIds = [...new Set(body.statuses.map(status => status.id))]
  const statusScopes = await queryRows<StatusScopeRow>(`
    SELECT id, department_id
    FROM task_statuses
    WHERE id = ANY($1::uuid[])
  `, [statusIds])

  if (statusScopes.length !== statusIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'One or more status IDs are invalid'
    })
  }

  const departmentIds = new Set<string>()
  for (const status of statusScopes) {
    if (status.department_id) departmentIds.add(status.department_id)
    else if (user.role !== 'owner' && user.role !== 'admin') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Only owners and admins can reorder global statuses'
      })
    }
  }

  for (const departmentId of departmentIds) {
    await requireBoardAccess(event, departmentId)
  }

  try {
    await transaction(async (client) => {
      for (const status of body.statuses) {
        if (!status.id) continue

        await client.query(`
          UPDATE task_statuses
          SET sort_order = $1
          WHERE id = $2
        `, [status.sortOrder, status.id])
      }
    })

    return {
      success: true,
      message: `Reordered ${body.statuses.length} statuses`,
      updatedCount: body.statuses.length
    }
  } catch (error: unknown) {
    if (isHttpError(error)) throw error
    console.error('Failed to reorder statuses:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reorder statuses'
    })
  }
})
