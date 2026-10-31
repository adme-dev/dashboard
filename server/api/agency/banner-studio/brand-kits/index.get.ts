import { queryRowsFresh } from '~~/server/utils/db'
import { brandKitReadScope } from '~~/server/utils/banner/brandKitAccess'
import { BRAND_KIT_SELECT, normaliseKitRow } from '~~/server/utils/banner/brandKits'

/**
 * GET /api/agency/banner-studio/brand-kits?clientId=…
 * With clientId: that client's kits plus agency-wide (unassigned) kits, client-specific first.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const { where, params } = await brandKitReadScope(event, getQuery(event).clientId)
  const rows = await queryRowsFresh<{ colors: unknown, fonts: unknown, logos: unknown }>(`
    SELECT ${BRAND_KIT_SELECT}
    FROM brand_kits bk
    LEFT JOIN agency_clients ac ON ac.id = bk.client_id
    ${where}
    ORDER BY bk.is_default DESC, (bk.client_id IS NOT NULL) DESC, bk.updated_at DESC
  `, params)
  return rows.map(r => normaliseKitRow(r))
})
