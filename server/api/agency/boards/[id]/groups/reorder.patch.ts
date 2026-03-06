/**
 * Reorder Board Groups
 * PATCH /api/agency/boards/:id/groups/reorder
 *
 * Body: { groupIds: string[] } — ordered array of group IDs
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
import { kvDelete } from '~~/server/utils/kv'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const { groupIds } = body
  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'groupIds array is required' })
  }

  try {
    // Update sort_order for each group
    for (let i = 0; i < groupIds.length; i++) {
      await execute(
        'UPDATE board_groups SET sort_order = $1 WHERE id = $2',
        [i, groupIds[i]]
      )
    }

    // Invalidate groups cache
    const boardId = getRouterParam(event, 'id')
    if (boardId) {
      kvDelete(event, `board:${boardId}:groups`)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Failed to reorder groups:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to reorder groups: ${error.message}`,
    })
  }
})
