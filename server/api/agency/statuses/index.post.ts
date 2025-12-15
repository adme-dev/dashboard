/**
 * Create a custom task status
 */

import { queryOne } from '~~/server/utils/db'

interface CreateStatusBody {
  name: string
  slug?: string
  color?: string
  icon?: string
  category: 'not_started' | 'in_progress' | 'review' | 'done' | 'cancelled'
  departmentId?: string
  isDefault?: boolean
  isFinal?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateStatusBody>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status name is required'
    })
  }

  if (!body.category) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status category is required'
    })
  }

  const validCategories = ['not_started', 'in_progress', 'review', 'done', 'cancelled']
  if (!validCategories.includes(body.category)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Category must be one of: ${validCategories.join(', ')}`
    })
  }

  // Generate slug if not provided
  const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  try {
    // Get max sort order for the department/global
    const maxOrderResult = await queryOne(`
      SELECT COALESCE(MAX(sort_order), 0) as max_order
      FROM task_statuses
      WHERE department_id IS NOT DISTINCT FROM $1
    `, [body.departmentId || null])

    const sortOrder = (maxOrderResult?.max_order || 0) + 1

    const status = await queryOne(`
      INSERT INTO task_statuses (name, slug, color, icon, category, department_id, is_default, is_final, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      body.name.trim(),
      slug,
      body.color || '#6B7280',
      body.icon || null,
      body.category,
      body.departmentId || null,
      body.isDefault ?? false,
      body.isFinal ?? (body.category === 'done' || body.category === 'cancelled'),
      sortOrder,
    ])

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
    if (error.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'A status with this slug already exists'
      })
    }
    console.error('Failed to create status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create status'
    })
  }
})
