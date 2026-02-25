/**
 * POST /api/chat/board-feeds/:boardId
 * Link a chat channel to a board for event feed, or create a new channel and link it.
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const boardId = getRouterParam(event, 'boardId')
  if (!boardId) {
    throw createError({ statusCode: 400, statusMessage: 'Board ID is required' })
  }

  const body = await readBody(event)
  const {
    channelId,
    eventTypes = ['task_created', 'status_changed'],
    createChannel: shouldCreate
  } = body

  let targetChannelId = channelId

  // If no channel specified, create one
  if (!targetChannelId && shouldCreate) {
    const board = await queryOne('SELECT name FROM departments WHERE id = $1', [boardId])
    const boardName = board?.name || 'Board'
    const slug = `board-${boardId.substring(0, 8)}-${Date.now().toString(36)}`

    const channel = await queryOne(`
      INSERT INTO chat_channels (name, slug, type, is_private, created_by, department_id)
      VALUES ($1, $2, 'channel', false, $3, $4)
      RETURNING id
    `, [`${boardName} Updates`, slug, user.id, boardId])

    targetChannelId = channel.id

    // Add creator as owner
    await execute(`
      INSERT INTO chat_channel_members (channel_id, user_id, role)
      VALUES ($1, $2, 'owner')
    `, [targetChannelId, user.id])
  }

  if (!targetChannelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID or createChannel flag is required' })
  }

  // Upsert feed settings
  const feed = await queryOne(`
    INSERT INTO chat_board_feed_settings (channel_id, board_id, event_types, created_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (channel_id, board_id)
    DO UPDATE SET event_types = $3, is_active = true, updated_at = NOW()
    RETURNING *
  `, [targetChannelId, boardId, eventTypes, user.id])

  return feed
})
