/**
 * Save Board View
 * POST /api/agency/boards/:id/views
 *
 * Creates a new saved view for the board.
 * Body: { name, viewType, config?, isPublic? } for board views
 * Body: { name, viewType, filters?, sortConfig?, groupBy?, visibleColumns?, columnWidths?, isPinned? } for user views
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

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

  const { name, viewType, isPublic, config, filters, sortConfig, groupBy, visibleColumns, columnWidths, isPinned } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'View name is required' })
  }

  const validTypes = ['table', 'kanban', 'timeline', 'calendar', 'list', 'gallery']
  if (!viewType || !validTypes.includes(viewType)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid view type. Must be one of: ${validTypes.join(', ')}` })
  }

  try {
    const dept = isUUID(boardId)
      ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardId])
      : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardId])

    if (!dept) {
      throw createError({ statusCode: 404, statusMessage: 'Board not found' })
    }

    // Determine if creating a board view (shared) or user view (personal)
    const isShared = isPublic === true

    if (isShared) {
      // Create board view
      const maxOrder = await queryOne(
        'SELECT COALESCE(MAX(sort_order), -1) as max FROM board_views WHERE department_id = $1',
        [dept.id]
      )
      const sortOrder = (maxOrder?.max ?? -1) + 1

      const view = await queryOne(`
        INSERT INTO board_views (department_id, name, view_type, is_public, config, sort_order, created_by)
        VALUES ($1, $2, $3::board_view_type, $4, $5, $6, $7)
        RETURNING
          id,
          name,
          view_type as "viewType",
          is_default as "isDefault",
          is_public as "isPublic",
          config,
          sort_order as "sortOrder",
          created_at as "createdAt"
      `, [dept.id, name.trim(), viewType, true, JSON.stringify(config || {}), sortOrder, user.id])

      return { view }
    } else {
      // Create user saved view
      const view = await queryOne(`
        INSERT INTO user_saved_views (
          user_id, department_id, name, view_type,
          filters, sort_config, group_by, visible_columns, column_widths, is_pinned
        )
        VALUES ($1, $2, $3, $4::board_view_type, $5, $6, $7, $8, $9, $10)
        RETURNING
          id,
          name,
          view_type as "viewType",
          filters,
          sort_config as "sortConfig",
          group_by as "groupBy",
          visible_columns as "visibleColumns",
          column_widths as "columnWidths",
          is_pinned as "isPinned",
          created_at as "createdAt"
      `, [
        user.id,
        dept.id,
        name.trim(),
        viewType,
        JSON.stringify(filters || {}),
        JSON.stringify(sortConfig || []),
        groupBy || null,
        visibleColumns || null,
        JSON.stringify(columnWidths || {}),
        isPinned || false,
      ])

      return { view }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to save view:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to save view: ${error.message}`,
    })
  }
})
