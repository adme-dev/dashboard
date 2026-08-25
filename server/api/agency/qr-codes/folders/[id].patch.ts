import { requireFolderAccess } from '~~/server/utils/qr/access'
import { FolderUpdateSchema } from '~~/server/utils/qr/schemas'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'

export default defineEventHandler(async (event) => {
  const { row } = await requireFolderAccess(event, getRouterParam(event, 'id'))
  const parsed = FolderUpdateSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  const folder = await executeQrMutation(event, 'folder-update', async (db) => {
    const r = await db.query(`UPDATE qr_folders SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [parsed.data.name, row.id])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_folders WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed folder no longer exists')
    return r.rows[0]
  })
  return { folder }
})
