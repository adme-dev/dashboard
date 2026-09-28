import { queryRows } from '~~/server/utils/db'
import { requireQrClientAccess } from '~~/server/utils/qr/permissions'

export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string | undefined
  await requireQrClientAccess(event, clientId)
  const folders = await queryRows(
    `SELECT f.*, (SELECT COUNT(*) FROM qr_codes c WHERE c.folder_id = f.id)::int AS code_count
     FROM qr_folders f WHERE f.client_id = $1 ORDER BY f.name`, [clientId])
  return { folders }
})
