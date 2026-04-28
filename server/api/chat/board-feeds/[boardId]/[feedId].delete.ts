/**
 * DELETE /api/chat/board-feeds/:boardId/:feedId
 * Remove a board chat feed link. The underlying chat channel is preserved.
 */
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const feedId = getRouterParam(event, 'feedId')
  if (!feedId) {
    throw createError({ statusCode: 400, statusMessage: 'Feed ID is required' })
  }

  const result = await execute(
    'DELETE FROM chat_board_feed_settings WHERE id = $1',
    [feedId]
  )

  if (result === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  return { success: true }
})
