import { requireClientTrackingAccess } from '~~/server/utils/client-access'
import { FolderSchema } from '~~/server/utils/qr/schemas'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'

export default defineEventHandler(async (event) => {
  const parsed = FolderSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  await requireClientTrackingAccess(event, parsed.data.clientId)
  try {
    const folder = await executeQrMutation(event, 'folder-create', async (db) => {
      const r = await db.query(`INSERT INTO qr_folders (client_id, name) VALUES ($1,$2) RETURNING *`, [parsed.data.clientId, parsed.data.name])
      return r.rows[0]
    }, async (db, id) => {
      const r = await db.query(`SELECT * FROM qr_folders WHERE id = $1`, [id])
      if (!r.rows[0]) throw new Error('Replayed folder no longer exists')
      return r.rows[0]
    })
    return { folder }
  } catch (err: any) {
    if (err?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'A folder with that name already exists' })
    throw err
  }
})
