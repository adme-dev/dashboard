/**
 * Update a brief category
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['admin', 'owner'])

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Category ID is required' })
  }

  const body = await readBody(event)
  const { name, description, icon, color, sortOrder } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  try {
    const category = await queryOne(`
      UPDATE brief_categories SET
        name = $2,
        description = $3,
        icon = COALESCE($4, icon),
        color = COALESCE($5, color),
        sort_order = COALESCE($6, sort_order),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, slug
    `, [id, name.trim(), description || null, icon || null, color || null, sortOrder ?? null])

    if (!category) {
      throw createError({ statusCode: 404, statusMessage: 'Category not found' })
    }

    return category
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update brief category:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update brief category' })
  }
})
