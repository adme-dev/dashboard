import { queryOne } from '~~/server/utils/db'
import { requireFolderAccess } from '~~/server/utils/qr/access'
import { FolderUpdateSchema } from '~~/server/utils/qr/schemas'
export default defineEventHandler(async (event) => {
  const { row } = await requireFolderAccess(event, getRouterParam(event, 'id'))
  const parsed = FolderUpdateSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  const folder = await queryOne(`UPDATE qr_folders SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [parsed.data.name, row.id])
  return { folder }
})
