/**
 * Update a task status
 */

import { queryOne } from '~~/server/utils/db'
import { requireBoardAccess, requireWriteAccess } from '~~/server/utils/auth'

interface UpdateStatusBody {
  name?: string
  slug?: string
  color?: string
  icon?: string
  category?: 'not_started' | 'in_progress' | 'review' | 'done' | 'cancelled'
  isDefault?: boolean
  isFinal?: boolean
  sortOrder?: number
}

function isHttpError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
}

function hasDatabaseErrorCode(error: unknown): error is { code: string } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateStatusBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status ID is required'
    })
  }

  const existingStatus = await queryOne(`
    SELECT id, department_id
    FROM task_statuses
    WHERE id = $1
  `, [id])

  if (!existingStatus) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Status not found'
    })
  }

  if (existingStatus.department_id) {
    await requireBoardAccess(event, existingStatus.department_id)
  } else if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only owners and admins can update global statuses'
    })
  }

  // Validate category if provided
  if (body.category) {
    const validCategories = ['not_started', 'in_progress', 'review', 'done', 'cancelled']
    if (!validCategories.includes(body.category)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Category must be one of: ${validCategories.join(', ')}`
      })
    }
  }

  // Build dynamic update
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (body.name !== undefined) {
    fields.push(`name = $${idx}`)
    values.push(body.name.trim())
    idx++
  }

  if (body.slug !== undefined) {
    fields.push(`slug = $${idx}`)
    values.push(body.slug)
    idx++
  }

  if (body.color !== undefined) {
    fields.push(`color = $${idx}`)
    values.push(body.color)
    idx++
  }

  if (body.icon !== undefined) {
    fields.push(`icon = $${idx}`)
    values.push(body.icon || null)
    idx++
  }

  if (body.category !== undefined) {
    fields.push(`category = $${idx}`)
    values.push(body.category)
    idx++
  }

  if (body.isDefault !== undefined) {
    fields.push(`is_default = $${idx}`)
    values.push(body.isDefault)
    idx++
  }

  if (body.isFinal !== undefined) {
    fields.push(`is_final = $${idx}`)
    values.push(body.isFinal)
    idx++
  }

  if (body.sortOrder !== undefined) {
    fields.push(`sort_order = $${idx}`)
    values.push(body.sortOrder)
    idx++
  }

  if (fields.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No fields to update'
    })
  }

  values.push(id)

  try {
    const status = await queryOne(`
      UPDATE task_statuses
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, values)

    if (!status) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Status not found'
      })
    }

    return {
      id: status.id,
      departmentId: status.department_id,
      name: status.name,
      slug: status.slug,
      color: status.color,
      icon: status.icon,
      category: status.category,
      isDefault: status.is_default,
      isFinal: status.is_final,
      sortOrder: status.sort_order,
      createdAt: status.created_at
    }
  } catch (error: unknown) {
    if (isHttpError(error)) throw error
    if (hasDatabaseErrorCode(error) && error.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'A status with this slug already exists'
      })
    }
    console.error('Failed to update status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update status'
    })
  }
})
