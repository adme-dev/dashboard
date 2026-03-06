/**
 * Update Board Group
 * PATCH /api/agency/boards/:id/groups/:groupId
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { kvDelete } from '~~/server/utils/kv'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const groupId = getRouterParam(event, 'groupId')
  const body = await readBody(event)

  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: 'Group ID required' })
  }

  // Legacy groups (Monday-imported) have non-UUID IDs — can't be stored in board_groups
  if (!isUUID(groupId)) {
    return { group: { id: groupId, ...body } }
  }

  try {
    // Build dynamic SET clause
    const sets: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`)
      params.push(body.name.trim())
    }
    if (body.color !== undefined) {
      sets.push(`color = $${idx++}`)
      params.push(body.color)
    }
    if (body.isCollapsed !== undefined) {
      sets.push(`is_collapsed = $${idx++}`)
      params.push(body.isCollapsed)
    }
    if (body.sortOrder !== undefined) {
      sets.push(`sort_order = $${idx++}`)
      params.push(body.sortOrder)
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    params.push(groupId)

    const group = await queryOne(`
      UPDATE board_groups
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING
        id,
        name,
        color,
        sort_order as "sortOrder",
        is_collapsed as "isCollapsed",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, params)

    if (!group) {
      throw createError({ statusCode: 404, statusMessage: 'Group not found' })
    }

    // Invalidate groups cache
    const boardId = getRouterParam(event, 'id')
    if (boardId) {
      kvDelete(event, `board:${boardId}:groups`)
    }

    return { group }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update board group:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update group: ${error.message}`,
    })
  }
})
