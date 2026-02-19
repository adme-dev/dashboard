/**
 * Create Custom Column
 * POST /api/agency/columns
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateColumnBody {
  departmentId?: string
  name: string
  columnType: string
  description?: string
  settings?: Record<string, any>
  isVisible?: boolean
  isRequired?: boolean
  allowedRoles?: string[]
  editableRoles?: string[]
  width?: number
}

const VALID_COLUMN_TYPES = [
  'text', 'number', 'currency', 'date', 'timeline', 'status', 'dropdown',
  'people', 'checkbox', 'rating', 'link', 'email', 'phone', 'location',
  'formula', 'tags', 'files', 'progress', 'color', 'dependency'
]

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Only admin/owner can create custom columns
  if (!['admin', 'owner'].includes(user.user_role || '')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only administrators can create custom columns'
    })
  }

  const body = await readBody<CreateColumnBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Column name is required'
    })
  }

  if (!body.columnType || !VALID_COLUMN_TYPES.includes(body.columnType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid column type. Must be one of: ${VALID_COLUMN_TYPES.join(', ')}`
    })
  }

  const name = body.name.trim()
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Column name must contain at least one alphanumeric character'
    })
  }

  // Check for existing column with same slug in the department
  const existing = await queryOne(
    `SELECT id FROM custom_columns WHERE slug = $1 AND (department_id = $2 OR (department_id IS NULL AND $2 IS NULL))`,
    [slug, body.departmentId || null]
  )
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A column with this name already exists'
    })
  }

  // Get max sort order for the department
  const maxOrder = await queryOne(`
    SELECT COALESCE(MAX(sort_order), 0) as max_order
    FROM custom_columns
    WHERE department_id = $1 OR (department_id IS NULL AND $1 IS NULL)
  `, [body.departmentId || null])

  const column = await queryOne(`
    INSERT INTO custom_columns (
      department_id, name, slug, column_type, description,
      settings, is_visible, is_required, allowed_roles, editable_roles,
      width, sort_order, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    body.departmentId || null,
    name,
    slug,
    body.columnType,
    body.description || null,
    JSON.stringify(body.settings || {}),
    body.isVisible ?? true,
    body.isRequired ?? false,
    body.allowedRoles || null,
    body.editableRoles || null,
    body.width || 150,
    (maxOrder?.max_order || 0) + 1,
    user.id
  ])

  return {
    id: column.id,
    departmentId: column.department_id,
    name: column.name,
    slug: column.slug,
    columnType: column.column_type,
    description: column.description,
    settings: column.settings || {},
    isVisible: column.is_visible,
    isRequired: column.is_required,
    allowedRoles: column.allowed_roles,
    editableRoles: column.editable_roles,
    width: column.width,
    sortOrder: column.sort_order,
    createdBy: column.created_by,
    createdAt: column.created_at,
    updatedAt: column.updated_at
  }
})
