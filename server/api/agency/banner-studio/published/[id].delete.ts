import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteFile } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Published banner ID is required' })
  }

  const row = await queryOne(
    'DELETE FROM banner_published WHERE id = $1 RETURNING id, r2_key AS "r2Key"',
    [id]
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Published banner not found' })
  }

  // Clean up R2
  try {
    await deleteFile(row.r2Key)
  } catch {
    // Non-fatal — file may already be gone
  }

  return { success: true }
})
