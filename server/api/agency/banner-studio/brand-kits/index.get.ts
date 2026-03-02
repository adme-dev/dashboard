import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { clientId } = getQuery(event)

  const conditions = []
  const params: any[] = []

  if (clientId) {
    params.push(clientId)
    conditions.push(`bk.client_id = $${params.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = await queryRows(`
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
    ${where}
    ORDER BY bk.updated_at DESC
  `, params)

  return rows
})
