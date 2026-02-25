/**
 * Forward a message to this channel
 * POST /api/chat/channels/:channelId/messages/forward
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID is required' })
  }

  const body = await readBody(event)
  const { originalChannelId, originalMessageId, content } = body

  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Message content is required' })
  }

  // Verify user is a member of the target channel
  const membership = await queryOne(
    'SELECT user_id FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2',
    [channelId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'You are not a member of this channel' })
  }

  // Verify source message exists (optional — graceful if missing)
  let originalUserName: string | undefined
  if (originalChannelId && originalMessageId) {
    const originalMsg = await queryOne(`
      SELECT cm.id, tm.name as user_name
      FROM chat_messages cm
      JOIN team_members tm ON cm.user_id = tm.id
      WHERE cm.id = $1 AND cm.channel_id = $2
    `, [originalMessageId, originalChannelId])
    originalUserName = originalMsg?.user_name
  }

  // Insert forwarded message
  const forwardedContent = originalUserName
    ? `> *Forwarded from ${originalUserName}:*\n> ${content.split('\n').join('\n> ')}\n`
    : content

  const metadata: Record<string, unknown> = {}
  if (body.metadata?.attachments) {
    metadata.attachments = body.metadata.attachments
  }
  metadata.forwarded = true
  metadata.forwardedFrom = {
    channelId: originalChannelId,
    messageId: originalMessageId,
    userName: originalUserName
  }

  const message = await queryOne(`
    INSERT INTO chat_messages (channel_id, user_id, content, forwarded_from_channel_id, forwarded_from_message_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id,
      channel_id as "channelId",
      user_id as "userId",
      content,
      forwarded_from_channel_id as "forwardedFromChannelId",
      forwarded_from_message_id as "forwardedFromMessageId",
      metadata,
      created_at as "createdAt"
  `, [
    channelId,
    user.id,
    forwardedContent,
    originalChannelId || null,
    originalMessageId || null,
    JSON.stringify(metadata)
  ])

  return message
})
