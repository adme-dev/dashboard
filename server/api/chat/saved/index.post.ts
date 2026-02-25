/**
 * POST /api/chat/saved
 * Toggle save/unsave a message (bookmark).
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { messageId, channelId, note } = body

  if (!messageId || !channelId) {
    throw createError({ statusCode: 400, statusMessage: 'messageId and channelId required' })
  }

  // Check if already saved
  const existing = await queryOne(
    `SELECT id FROM chat_saved_messages WHERE user_id = $1 AND message_id = $2`,
    [user.id, messageId]
  )

  if (existing) {
    // Unsave
    await execute(
      `DELETE FROM chat_saved_messages WHERE user_id = $1 AND message_id = $2`,
      [user.id, messageId]
    )
    return { saved: false }
  }

  // Save
  await execute(
    `INSERT INTO chat_saved_messages (user_id, message_id, channel_id, note) VALUES ($1, $2, $3, $4)`,
    [user.id, messageId, channelId, note || null]
  )
  return { saved: true }
})
