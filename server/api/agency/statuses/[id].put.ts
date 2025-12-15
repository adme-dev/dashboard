/**
 * Update a task status
 */

import { queryOne } from '~~/server/utils/db'

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

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateStatusBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status ID is required'
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
  const values: any[] = []
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
      createdAt: status.created_at,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    if (error.code === '23505') {
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
