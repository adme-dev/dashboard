/**
 * Add Column to Board
 * POST /api/agency/boards/:id/columns
 *
 * Creates a column in custom_columns (modern system).
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryOne } from '../../../../utils/db'
import { kvDelete } from '~~/server/utils/kv'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  const { name, type, settings } = body
  if (!name || !type) {
    throw createError({ statusCode: 400, statusMessage: 'Name and type required' })
  }

  try {
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Board not found' })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 100)

    const maxOrder = await queryOne(
      'SELECT MAX(sort_order) as max FROM custom_columns WHERE department_id = $1',
      [dept.id]
    )
    const sortOrder = (maxOrder?.max || 0) + 1

    const column = await queryOne(`
      INSERT INTO custom_columns (department_id, name, slug, column_type, settings, sort_order, created_by)
      VALUES ($1, $2, $3, $4::column_type, $5, $6, $7)
      ON CONFLICT (department_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        column_type = EXCLUDED.column_type,
        settings = EXCLUDED.settings,
        is_visible = true,
        updated_at = NOW()
      RETURNING
        id,
        name,
        slug,
        column_type as "columnType",
        column_type as type,
        settings,
        sort_order as "sortOrder",
        is_visible as "isVisible",
        width
    `, [dept.id, name, slug, type, JSON.stringify(settings || {}), sortOrder, user.id])

    // Invalidate columns cache for this board
    kvDelete(event, `board:${boardId}:columns`)
    kvDelete(event, `board:${boardId}:columns:all`)

    return { column }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add column:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add column: ${error.message}`,
    })
  }
})
