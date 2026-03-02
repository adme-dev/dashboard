import { queryRows, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteFile } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const { projectId, feedId, formatKey } = body

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const conditions: string[] = ['project_id = $1']
  const params: any[] = [projectId]
  let paramIndex = 2

  if (feedId) {
    conditions.push(`feed_id = $${paramIndex}`)
    params.push(feedId)
    paramIndex++
  }

  if (formatKey) {
    conditions.push(`format_key = $${paramIndex}`)
    params.push(formatKey)
    paramIndex++
  }

  const where = conditions.join(' AND ')

  // Get all R2 keys to delete
  const rows = await queryRows(`SELECT r2_key AS "r2Key" FROM banner_variants WHERE ${where}`, params)

  // Delete R2 files (best-effort, don't fail on individual errors)
  for (const row of rows) {
    try {
      await deleteFile(row.r2Key)
    } catch {
      // Ignore — file may already be gone
    }
  }

  // Delete DB records
  await execute(`DELETE FROM banner_variants WHERE ${where}`, params)

  return { success: true, deleted: rows.length }
})
