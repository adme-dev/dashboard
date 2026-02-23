/**
 * Reorder Board Columns
 * PATCH /api/agency/boards/:id/columns/reorder
 *
 * Body: { columnIds: string[] } — ordered array of column IDs
 */

import { createError, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const { columnIds } = body
  if (!Array.isArray(columnIds) || columnIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'columnIds array is required' })
  }

  try {
    for (let i = 0; i < columnIds.length; i++) {
      await execute(
        'UPDATE custom_columns SET sort_order = $1, updated_at = NOW() WHERE id = $2',
        [i, columnIds[i]]
      )
    }

    return { success: true }
  } catch (error: any) {
    console.error('Failed to reorder columns:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to reorder columns: ${error.message}`,
    })
  }
})
