/**
 * Get Board Views
 * GET /api/agency/boards/:id/views
 *
 * Returns saved views for this board (department).
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const boardId = getRouterParam(event, 'id')

  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID required' })
  }

  try {
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      return { views: [] }
    }

    // Get board-level views (shared)
    const boardViews = await queryRows(`
      SELECT
        bv.id,
        bv.name,
        bv.view_type as "viewType",
        bv.is_default as "isDefault",
        bv.is_public as "isPublic",
        bv.config,
        bv.sort_order as "sortOrder",
        bv.created_by as "createdBy",
        tm.name as "createdByName",
        bv.created_at as "createdAt",
        bv.updated_at as "updatedAt"
      FROM board_views bv
      LEFT JOIN team_members tm ON bv.created_by = tm.id
      WHERE bv.department_id = $1
        AND (bv.is_public = true OR bv.created_by = $2)
      ORDER BY bv.sort_order, bv.created_at
    `, [dept.id, user.id])

    // Get user's personal saved views
    const userViews = await queryRows(`
      SELECT
        id,
        name,
        view_type as "viewType",
        filters,
        sort_config as "sortConfig",
        group_by as "groupBy",
        visible_columns as "visibleColumns",
        column_widths as "columnWidths",
        is_pinned as "isPinned",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM user_saved_views
      WHERE user_id = $1
        AND department_id = $2
      ORDER BY is_pinned DESC, created_at DESC
    `, [user.id, dept.id])

    return { views: boardViews, userViews }
  } catch (error: any) {
    console.error('Failed to fetch board views:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch views: ${error.message}`,
    })
  }
})
