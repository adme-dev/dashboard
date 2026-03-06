/**
 * Soft-delete a brief template (set is_active = false)
 */

import { execute } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['admin', 'owner'])

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  try {
    const rowCount = await execute(`
      UPDATE brief_templates SET is_active = false, updated_at = NOW() WHERE id = $1
    `, [id])

    if (rowCount === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Template not found' })
    }

    return { success: true }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete brief template:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete brief template' })
  }
})
