import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  const row = await queryOne(`
    DELETE FROM brand_kits WHERE id = $1 RETURNING id
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  }

  return { success: true }
})
