import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteFile } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  const feed = await queryOne('SELECT id, r2_key FROM banner_feeds WHERE id = $1', [id])
  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  // Delete R2 data
  if (feed.r2_key) {
    try {
      await deleteFile(feed.r2_key)
    } catch {
      // R2 file may not exist -- continue
    }
  }

  await execute('DELETE FROM banner_feeds WHERE id = $1', [id])

  return { success: true }
})
