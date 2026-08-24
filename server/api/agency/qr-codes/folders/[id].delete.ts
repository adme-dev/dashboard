import { execute } from '~~/server/utils/db'
import { requireFolderAccess } from '~~/server/utils/qr/access'
export default defineEventHandler(async (event) => {
  const { row } = await requireFolderAccess(event, getRouterParam(event, 'id'))
  await execute(`DELETE FROM qr_folders WHERE id = $1`, [row.id]) // codes fall back to folder_id NULL
  return { ok: true }
})
