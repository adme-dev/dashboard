/**
 * POST /api/chat/channels/:channelId/messages
 * Send a message to a channel via REST (for embedded mini-chat).
 * Returns the created message with user info.
 */
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const channelId = getRouterParam(event, 'channelId')
  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID is required' })
  }

  const body = await readBody(event)
  const { content, threadParentId, metadata } = body

  const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : {}

  const trimmedContent = typeof content === 'string' ? content.trim() : ''
  const hasAttachments = Array.isArray((safeMetadata as any).attachments)
    && (safeMetadata as any).attachments.length > 0

  // A message must carry either text or at least one attachment.
  if (!trimmedContent && !hasAttachments) {
    throw createError({ statusCode: 400, statusMessage: 'Message content or attachment is required' })
  }

  // Verify membership
  const membership = await queryOne(`
    SELECT 1 FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  // Insert message
  const message = await queryOne(`
    INSERT INTO chat_messages (channel_id, user_id, content, thread_parent_id, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, channel_id, user_id, content, thread_parent_id, metadata, created_at
  `, [
    channelId,
    user.id,
    trimmedContent,
    threadParentId || null,
    JSON.stringify(safeMetadata)
  ])

  // Update last_read_message_id for sender
  await queryOne(`
    UPDATE chat_channel_members
    SET last_read_message_id = $1
    WHERE channel_id = $2 AND user_id = $3
    RETURNING 1
  `, [message.id, channelId, user.id])

  // Return with user info
  return {
    ...message,
    user_name: user.name,
    user_avatar: user.avatar_url || null,
    reactions: [],
    thread_count: 0
  }
})
