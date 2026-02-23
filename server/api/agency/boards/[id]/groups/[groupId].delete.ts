/**
 * Delete Board Group
 * DELETE /api/agency/boards/:id/groups/:groupId
 *
 * Tasks in this group have their group_id set to NULL (via ON DELETE SET NULL).
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const groupId = getRouterParam(event, 'groupId')

  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: 'Group ID required' })
  }

  try {
    const existing = await queryOne('SELECT id FROM board_groups WHERE id = $1', [groupId])
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Group not found' })
    }

    await execute('DELETE FROM board_groups WHERE id = $1', [groupId])

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete board group:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to delete group: ${error.message}`,
    })
  }
})
