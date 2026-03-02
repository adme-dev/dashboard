import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  const row = await queryOne(`
    SELECT
      bk.id, bk.name,
      bk.client_id AS "clientId",
      ac.name AS "clientName",
      bk.colors, bk.fonts, bk.logos,
      bk.guidelines,
      bk.created_by AS "createdBy",
      bk.created_at AS "createdAt",
      bk.updated_at AS "updatedAt"
    FROM brand_kits bk
    LEFT JOIN agency_clients ac ON ac.id = bk.client_id
    WHERE bk.id = $1
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  }

  return row
})
