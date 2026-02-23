/**
 * Get Board Columns
 * GET /api/agency/boards/:id/columns
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { queryRows } from '../../../../utils/db'

// Check if string is UUID
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
    // Build query based on whether boardId is UUID or slug
    let whereClause: string
    let params: any[]
    
    if (isUUID(boardId)) {
      whereClause = 'd.id = $1::uuid'
      params = [boardId]
    } else {
      whereClause = 'd.slug = $1'
      params = [boardId]
    }
    
    const columns = await queryRows(`
      SELECT
        bc.id,
        bc.name,
        bc.slug,
        bc.type,
        bc.settings,
        bc.sort_order,
        bc.is_visible
      FROM board_columns bc
      JOIN departments d ON d.id = bc.department_id
      WHERE ${whereClause}
      ORDER BY bc.sort_order, bc.name
    `, params)

    return { columns }

  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch columns: ${error.message}`
    })
  }
})
