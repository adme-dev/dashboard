/**
 * Create User Saved View
 * POST /api/agency/views/saved
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateSavedViewBody {
  departmentId?: string
  name: string
  viewType?: string
  filters?: Record<string, any>
  sortConfig?: { column: string; direction: string; nullsLast?: boolean }[]
  groupBy?: string
  visibleColumns?: string[]
  columnWidths?: Record<string, number>
  isPinned?: boolean
}

const VALID_VIEW_TYPES = ['kanban', 'table', 'timeline', 'calendar', 'list', 'gallery']

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateSavedViewBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'View name is required'
    })
  }

  const viewType = body.viewType || 'table'
  if (!VALID_VIEW_TYPES.includes(viewType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid view type. Must be one of: ${VALID_VIEW_TYPES.join(', ')}`
    })
  }

  const view = await queryOne(`
    INSERT INTO user_saved_views (
      user_id, department_id, name, view_type, filters,
      sort_config, group_by, visible_columns, column_widths, is_pinned
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    user.id,
    body.departmentId || null,
    body.name.trim(),
    viewType,
    JSON.stringify(body.filters || {}),
    JSON.stringify(body.sortConfig || []),
    body.groupBy || null,
    body.visibleColumns || null,
    JSON.stringify(body.columnWidths || {}),
    body.isPinned ?? false
  ])

  return {
    id: view.id,
    userId: view.user_id,
    departmentId: view.department_id,
    name: view.name,
    viewType: view.view_type,
    filters: view.filters || {},
    sortConfig: view.sort_config || [],
    groupBy: view.group_by,
    visibleColumns: view.visible_columns,
    columnWidths: view.column_widths || {},
    isPinned: view.is_pinned,
    createdAt: view.created_at,
    updatedAt: view.updated_at
  }
})
