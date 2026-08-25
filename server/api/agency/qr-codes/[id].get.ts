import { queryRows, queryOne } from '~~/server/utils/db'
import { requireQrCodeAccess, shortUrl } from '~~/server/utils/qr/access'

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const [names, history] = await Promise.all([
    queryOne<{ client_name: string, folder_name: string | null }>(
      `SELECT cl.name AS client_name, f.name AS folder_name
       FROM agency_clients cl LEFT JOIN qr_folders f ON f.id = $2
       WHERE cl.id = $1`, [row.client_id, row.folder_id]),
    queryRows(
      `SELECT h.old_url, h.new_url, h.changed_at, u.name AS changed_by_name
       FROM qr_destination_history h LEFT JOIN team_members u ON u.id = h.changed_by
       WHERE h.qr_code_id = $1 ORDER BY h.changed_at DESC LIMIT 50`, [row.id])
  ])
  return { code: { ...row, client_name: names?.client_name ?? null, folder_name: names?.folder_name ?? null }, shortUrl: shortUrl(row.code), history }
})
