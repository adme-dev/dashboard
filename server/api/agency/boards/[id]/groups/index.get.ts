/**
 * List Board Groups
 * GET /api/agency/boards/:id/groups
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  try {
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      return { groups: [] }
    }

    const groups = await queryRows(`
      SELECT
        bg.id,
        bg.name,
        bg.color,
        bg.sort_order as "sortOrder",
        bg.is_collapsed as "isCollapsed",
        bg.created_at as "createdAt",
        bg.updated_at as "updatedAt",
        COUNT(t.id)::int as "taskCount"
      FROM board_groups bg
      LEFT JOIN tasks t ON t.group_id = bg.id
      WHERE bg.department_id = $1
      GROUP BY bg.id
      ORDER BY bg.sort_order, bg.created_at
    `, [dept.id])

    return { groups }
  } catch (error: any) {
    console.error('Failed to fetch board groups:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch groups: ${error.message}`,
    })
  }
})
