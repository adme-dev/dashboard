import { execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  await execute(`
    UPDATE banner_custom_templates
    SET usage_count = usage_count + 1
    WHERE id = $1
  `, [id])

  return { success: true }
})
