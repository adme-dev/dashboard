/**
 * Add Column to Board
 * POST /api/agency/boards/:id/columns
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryOne, execute } from '../../../../utils/db'

// Check if string is UUID
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

  const { name, type, settings } = body
  if (!name || !type) {
    throw createError({ statusCode: 400, statusMessage: 'Name and type required' })
  }

  try {
    // Get department ID - use proper type handling
    let dept: any
    if (isUUID(boardId)) {
      dept = await queryOne(`
        SELECT id FROM departments WHERE id = $1::uuid
      `, [boardId])
    } else {
      dept = await queryOne(`
        SELECT id FROM departments WHERE slug = $1
      `, [boardId])
    }

    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Board not found' })
    }

    // Generate slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50)
    
    // Get max sort order
    const maxOrder = await queryOne(`
      SELECT MAX(sort_order) as max FROM board_columns WHERE department_id = $1
    `, [dept.id])
    
    const sortOrder = (maxOrder?.max || 0) + 1

    // Create column
    const column = await queryOne(`
      INSERT INTO board_columns (department_id, name, slug, type, settings, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (department_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        settings = EXCLUDED.settings,
        is_visible = true,
        updated_at = NOW()
      RETURNING *
    `, [dept.id, name, slug, type, JSON.stringify(settings || {}), sortOrder])

    return { column }

  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add column: ${error.message}`
    })
  }
})
