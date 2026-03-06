/**
 * Delete a brief category (only if no active templates exist)
 */

import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['admin', 'owner'])

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Category ID is required' })
  }

  try {
    // Check for active templates
    const count = await queryOne<{ count: string }>(
      'SELECT COUNT(*) AS count FROM brief_templates WHERE category_id = $1 AND is_active = true',
      [id]
    )

    if (count && parseInt(count.count) > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Cannot delete category with active templates. Remove or move templates first.'
      })
    }

    const rowCount = await execute('DELETE FROM brief_categories WHERE id = $1', [id])

    if (rowCount === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Category not found' })
    }

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete brief category:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete brief category' })
  }
})
