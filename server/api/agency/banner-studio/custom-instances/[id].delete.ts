import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  const existing = await queryOne(`
    SELECT created_by AS "createdBy" FROM banner_custom_instances WHERE id = $1
  `, [id])
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  if (existing.createdBy !== user.id && !['admin', 'owner'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  await execute('DELETE FROM banner_custom_instances WHERE id = $1', [id])
  return { success: true }
})
