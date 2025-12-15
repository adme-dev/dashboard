/**
 * Delete Global Tag
 * DELETE /api/agency/tags/:id
 */

import { query, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tag ID is required'
    })
  }

  // Check tag exists
  const existing = await queryOne('SELECT id FROM global_tags WHERE id = $1', [id])
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tag not found'
    })
  }

  // Delete the tag (cascade will remove task_tags associations)
  await query('DELETE FROM global_tags WHERE id = $1', [id])

  return { success: true }
})
