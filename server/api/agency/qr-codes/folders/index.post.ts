import { queryOne } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/client-access'
import { FolderSchema } from '~~/server/utils/qr/schemas'
export default defineEventHandler(async (event) => {
  const parsed = FolderSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  await requireClientTrackingAccess(event, parsed.data.clientId)
  try {
    const folder = await queryOne(`INSERT INTO qr_folders (client_id, name) VALUES ($1,$2) RETURNING *`, [parsed.data.clientId, parsed.data.name])
    return { folder }
  } catch (err: any) {
    if (err?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'A folder with that name already exists' })
    throw err
  }
})
