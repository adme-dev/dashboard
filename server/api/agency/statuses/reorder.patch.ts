/**
 * Reorder task statuses (for drag-and-drop column ordering)
 */

import { transaction } from '~~/server/utils/db'

interface ReorderItem {
  id: string
  sortOrder: number
}

interface ReorderBody {
  statuses: ReorderItem[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ReorderBody>(event)

  if (!body.statuses || !Array.isArray(body.statuses) || body.statuses.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Statuses array is required'
    })
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
      updatedCount: body.statuses.length,
    }
  } catch (error: any) {
    console.error('Failed to reorder statuses:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reorder statuses'
    })
  }
})
