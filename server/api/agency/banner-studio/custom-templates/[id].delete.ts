import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  const existing = await queryOne(`
    SELECT created_by AS "createdBy", is_system AS "isSystem"
    FROM banner_custom_templates WHERE id = $1
  `, [id])
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  // Block deletion of system templates unless admin/owner
  if (existing.isSystem && !['admin', 'owner'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Cannot delete system templates' })
  }

  // Block if not owner or admin
  if (existing.createdBy !== user.id && !['admin', 'owner'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  await execute('DELETE FROM banner_custom_templates WHERE id = $1', [id])
  return { success: true }
})
