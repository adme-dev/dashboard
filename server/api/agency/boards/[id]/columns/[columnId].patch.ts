/**
 * Update Column Settings
 * PATCH /api/agency/boards/:id/columns/:columnId
 *
 * Updates column name, description, settings, width, visibility, permissions.
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { kvDelete } from '~~/server/utils/kv'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const columnId = getRouterParam(event, 'columnId')
  const body = await readBody(event)

  if (!columnId) {
    throw createError({ statusCode: 400, statusMessage: 'Column ID required' })
  }

  try {
    const sets: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`)
      params.push(body.name.trim())
      // Update slug when name changes
      const slug = body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 100)
      sets.push(`slug = $${idx++}`)
      params.push(slug)
    }
    if (body.description !== undefined) {
      sets.push(`description = $${idx++}`)
      params.push(body.description)
    }
    if (body.settings !== undefined) {
      sets.push(`settings = $${idx++}`)
      params.push(JSON.stringify(body.settings))
    }
    if (body.width !== undefined) {
      sets.push(`width = $${idx++}`)
      params.push(body.width)
    }
    if (body.isVisible !== undefined) {
      sets.push(`is_visible = $${idx++}`)
      params.push(body.isVisible)
    }
    if (body.isRequired !== undefined) {
      sets.push(`is_required = $${idx++}`)
      params.push(body.isRequired)
    }
    if (body.allowedRoles !== undefined) {
      sets.push(`allowed_roles = $${idx++}`)
      params.push(body.allowedRoles)
    }
    if (body.editableRoles !== undefined) {
      sets.push(`editable_roles = $${idx++}`)
      params.push(body.editableRoles)
    }

    if (sets.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    sets.push(`updated_at = NOW()`)
    params.push(columnId)

    const column = await queryOne(`
      UPDATE custom_columns
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING
        id,
        name,
        slug,
        column_type as "columnType",
        column_type as type,
        description,
        settings,
        is_visible as "isVisible",
        is_required as "isRequired",
        allowed_roles as "allowedRoles",
        editable_roles as "editableRoles",
        width,
        sort_order as "sortOrder",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, params)

    if (!column) {
      throw createError({ statusCode: 404, statusMessage: 'Column not found' })
    }

    // Invalidate columns cache
    const boardId = getRouterParam(event, 'id')
    if (boardId) {
      kvDelete(event, `board:${boardId}:columns`)
      kvDelete(event, `board:${boardId}:columns:all`)
    }

    return { column }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update column:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update column: ${error.message}`,
    })
  }
})
