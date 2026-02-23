/**
 * Add Dropdown Option
 * POST /api/agency/columns/:id/options
 *
 * Adds a new option to a status/dropdown column.
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const columnId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!columnId) {
    throw createError({ statusCode: 400, statusMessage: 'Column ID required' })
  }

  const { value, label, color, isDefault } = body
  if (!label?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Option label is required' })
  }

  try {
    // Verify column exists and is a type that supports options
    const column = await queryOne(
      'SELECT id, column_type FROM custom_columns WHERE id = $1',
      [columnId]
    )
    if (!column) {
      throw createError({ statusCode: 404, statusMessage: 'Column not found' })
    }
    if (!['status', 'dropdown'].includes(column.column_type)) {
      throw createError({ statusCode: 400, statusMessage: 'Column type does not support options' })
    }

    // Get next sort order
    const maxOrder = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1) as max FROM column_dropdown_options WHERE column_id = $1',
      [columnId]
    )
    const sortOrder = (maxOrder?.max ?? -1) + 1

    // Generate value from label if not provided
    const optValue = (value || label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')).substring(0, 100)

    const option = await queryOne(`
      INSERT INTO column_dropdown_options (column_id, value, label, color, sort_order, is_default)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        column_id as "columnId",
        value,
        label,
        color,
        sort_order as "sortOrder",
        is_default as "isDefault",
        created_at as "createdAt"
    `, [
      columnId,
      optValue,
      label.trim(),
      color || '#6B7280',
      sortOrder,
      isDefault || false,
    ])

    return { option }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add option:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add option: ${error.message}`,
    })
  }
})
