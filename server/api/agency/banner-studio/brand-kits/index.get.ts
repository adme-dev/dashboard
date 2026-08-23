import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { BRAND_KIT_SELECT, normaliseKitRow } from '~~/server/utils/banner/brandKits'

/**
 * GET /api/agency/banner-studio/brand-kits?clientId=…
 * With clientId: that client's kits plus agency-wide (unassigned) kits, client-specific first.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { clientId } = getQuery(event)
  const params: any[] = []
  let where = ''
  if (typeof clientId === 'string' && clientId) {
    params.push(clientId)
    where = `WHERE bk.client_id = $1 OR bk.client_id IS NULL`
  }
  const rows = await queryRows(`
    SELECT ${BRAND_KIT_SELECT}
    FROM brand_kits bk
    LEFT JOIN agency_clients ac ON ac.id = bk.client_id
    ${where}
    ORDER BY bk.is_default DESC, (bk.client_id IS NOT NULL) DESC, bk.updated_at DESC
  `, params)
  return rows.map(r => normaliseKitRow(r as any))
})
