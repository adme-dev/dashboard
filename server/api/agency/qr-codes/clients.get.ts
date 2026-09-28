import { queryRows } from '~~/server/utils/db'
import { requireQrAccess, accessibleQrClientIds } from '~~/server/utils/qr/permissions'

/** QR pickers need names and ids, never the general client profitability payload. */
export default defineEventHandler(async (event) => {
  const user = await requireQrAccess(event)
  const ids = await accessibleQrClientIds(user)
  return queryRows<{ id: string, name: string }>(
    `SELECT id,name FROM agency_clients WHERE is_active=true
     AND ($1::uuid[] IS NULL OR id=ANY($1::uuid[])) ORDER BY name`,
    [ids]
  )
})
