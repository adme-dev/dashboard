/**
 * Create Board Group
 * POST /api/agency/boards/:id/groups
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  const { name, color } = body
  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Group name is required' })
  }

  try {
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Board not found' })
    }

    // Get next sort order
    const maxOrder = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1) as max FROM board_groups WHERE department_id = $1',
      [dept.id]
    )
    const sortOrder = (maxOrder?.max ?? -1) + 1

    const group = await queryOne(`
      INSERT INTO board_groups (department_id, name, color, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        color,
        sort_order as "sortOrder",
        is_collapsed as "isCollapsed",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [dept.id, name.trim(), color || '#579BFC', sortOrder])

    return { group }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create board group:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create group: ${error.message}`,
    })
  }
})
