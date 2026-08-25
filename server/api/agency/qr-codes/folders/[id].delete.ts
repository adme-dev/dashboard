import { requireFolderAccess } from '~~/server/utils/qr/access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'

export default defineEventHandler(async (event) => {
  const { row } = await requireFolderAccess(event, getRouterParam(event, 'id'))
  await executeQrMutation(event, 'folder-delete', async (db) => {
    await db.query(`DELETE FROM qr_folders WHERE id = $1`, [row.id]) // codes fall back to folder_id NULL
    return { id: row.id }
  }, async (_db, id) => ({ id }))
  return { ok: true }
})
