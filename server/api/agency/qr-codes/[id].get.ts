import { queryRows } from '~~/server/utils/db'
import { requireQrCodeAccess, shortUrl } from '~~/server/utils/qr/access'

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const history = await queryRows(
    `SELECT h.old_url, h.new_url, h.changed_at, u.name AS changed_by_name
     FROM qr_destination_history h LEFT JOIN team_members u ON u.id = h.changed_by
     WHERE h.qr_code_id = $1 ORDER BY h.changed_at DESC LIMIT 50`, [row.id])
  return { code: row, shortUrl: shortUrl(row.code), history }
})
