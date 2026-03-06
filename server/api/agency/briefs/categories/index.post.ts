/**
 * Create a brief category
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['admin', 'owner'])

  const body = await readBody(event)
  const { name, description, icon, color, sortOrder } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  try {
    const category = await queryOne(`
      INSERT INTO brief_categories (name, slug, description, icon, color, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, slug
    `, [
      name.trim(), slug, description || null,
      icon || 'i-lucide-folder', color || 'blue',
      sortOrder || 0
    ])

    return category
  } catch (error: any) {
    if (error.message?.includes('unique') || error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'A category with this name already exists' })
    }
    console.error('Failed to create brief category:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create brief category' })
  }
})
