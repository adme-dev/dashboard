/**
 * GET /api/chat/board-feeds/:boardId
 * Get chat feed settings for a board — which channels receive board events.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const boardId = getRouterParam(event, 'boardId')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const feeds = await queryRows(`
    SELECT
      fs.id, fs.channel_id, fs.board_id, fs.event_types, fs.is_active,
      fs.created_at, fs.updated_at,
      c.name AS channel_name, c.slug AS channel_slug
    FROM chat_board_feed_settings fs
    JOIN chat_channels c ON c.id = fs.channel_id
    WHERE fs.board_id = $1
    ORDER BY fs.created_at DESC
  `, [boardId])

  return feeds
})
