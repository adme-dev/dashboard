/**
 * GET /api/chat/board-feeds/:boardId
 * Get chat feed settings for a board — which channels receive board events.
 *
 * Accepts either a department UUID or a slug — resolves to UUID before any
 * UUID-typed query runs.
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { isUUID } from '~~/server/utils/ids'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const boardIdOrSlug = getRouterParam(event, 'boardId')
  if (!boardIdOrSlug) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const board = isUUID(boardIdOrSlug)
    ? await queryOne('SELECT id FROM departments WHERE id = $1::uuid', [boardIdOrSlug])
    : await queryOne('SELECT id FROM departments WHERE slug = $1', [boardIdOrSlug])

  if (!board) {
    return []
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
  `, [board.id])

  return feeds
})
