/**
 * POST /api/internal/chat-archive
 * Internal endpoint for DO → Neon message archival.
 * Secured with INTERNAL_API_KEY (same pattern as email-to-board).
 */
import { execute, queryOne } from '~~/server/utils/db'
import { processArchivedMessage } from '~~/server/utils/chatNotifications'

export default defineEventHandler(async (event) => {
  // Verify internal API key
  const authHeader = getHeader(event, 'authorization')
  const expectedKey = process.env.INTERNAL_API_KEY

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { channelId, messages } = body

  if (!channelId || !Array.isArray(messages) || messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'channelId and messages[] required' })
  }

  // Verify channel exists
  const channel = await queryOne(
    'SELECT id FROM chat_channels WHERE id = $1',
    [channelId]
  )

  if (!channel) {
    throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  }

  let inserted = 0

  for (const msg of messages) {
    try {
      const result = await queryOne(`
        INSERT INTO chat_messages (channel_id, user_id, content, thread_parent_id, edited_at, deleted_at, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        channelId,
        msg.userId,
        msg.content,
        msg.threadParentId || null,
        msg.editedAt || null,
        msg.deletedAt || null,
        JSON.stringify(msg.metadata || {}),
        msg.createdAt || new Date().toISOString()
      ])
      inserted++

      // Process mentions and notifications (fire-and-forget)
      if (result && !msg.deletedAt) {
        processArchivedMessage({
          messageId: result.id,
          channelId,
          userId: msg.userId,
          content: msg.content
        }).catch(err => console.error('[chat-archive] Notification processing failed:', err))
      }
    } catch (err) {
      console.error('[chat-archive] Failed to insert message:', err)
    }
  }

  return { success: true, inserted, total: messages.length }
})
