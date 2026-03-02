import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteFile } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Variant ID is required' })
  }

  const row = await queryOne('SELECT id, r2_key AS "r2Key" FROM banner_variants WHERE id = $1', [id])
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Variant not found' })
  }

  // Delete R2 file (non-fatal if missing)
  try {
    await deleteFile(row.r2Key)
  } catch {
    // Ignore — file may already be gone
  }

  await queryOne('DELETE FROM banner_variants WHERE id = $1 RETURNING id', [id])

  return { success: true }
})
