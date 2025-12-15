/**
 * Create Board View
 * POST /api/agency/views
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateViewBody {
  departmentId?: string
  name: string
  viewType: string
  isDefault?: boolean
  isPublic?: boolean
  config?: Record<string, any>
}

const VALID_VIEW_TYPES = ['kanban', 'table', 'timeline', 'calendar', 'list', 'gallery']

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateViewBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'View name is required'
    })
  }

  if (!body.viewType || !VALID_VIEW_TYPES.includes(body.viewType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid view type. Must be one of: ${VALID_VIEW_TYPES.join(', ')}`
    })
  }

  // Get max sort order
  const maxOrder = await queryOne(`
    SELECT COALESCE(MAX(sort_order), 0) as max_order
    FROM board_views
    WHERE department_id = $1 OR (department_id IS NULL AND $1 IS NULL)
  `, [body.departmentId || null])

  const view = await queryOne(`
    INSERT INTO board_views (
      department_id, name, view_type, is_default, is_public,
      created_by, config, sort_order
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    body.departmentId || null,
    body.name.trim(),
    body.viewType,
    body.isDefault ?? false,
    body.isPublic ?? true,
    user.id,
    JSON.stringify(body.config || {}),
    (maxOrder?.max_order || 0) + 1
  ])

  return {
    id: view.id,
    departmentId: view.department_id,
    name: view.name,
    viewType: view.view_type,
    isDefault: view.is_default,
    isPublic: view.is_public,
    createdBy: view.created_by,
    config: view.config || {},
    sortOrder: view.sort_order,
    createdAt: view.created_at,
    updatedAt: view.updated_at
  }
})
