/**
 * Chat Notification Utilities
 * Mention parsing, DM notifications, and chat-specific notification helpers.
 */

import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { createNotification, createBulkNotifications } from '~~/server/utils/notifications'

/**
 * Parse @mentions from message content.
 * Supports "@Name" and "@name" patterns.
 * Returns an array of user IDs that were mentioned.
 */
export async function parseMentions(content: string, channelId: string): Promise<string[]> {
  // Match @Name patterns (handles multi-word names with quotes or single-word names)
  // e.g. @John, @"John Smith", @john.smith
  const mentionPattern = /@"([^"]+)"|@(\S+)/g
  const names: string[] = []
  let match

  while ((match = mentionPattern.exec(content)) !== null) {
    const name = (match[1] || match[2] || '').trim()
    if (name && name !== 'everyone' && name !== 'channel') {
      names.push(name)
    }
  }

  if (names.length === 0) return []

  // Look up team members by name (case-insensitive) who are members of this channel
  const placeholders = names.map((_, i) => `LOWER($${i + 2})`).join(', ')
  const members = await queryRows(`
    SELECT DISTINCT tm.id
    FROM team_members tm
    JOIN chat_channel_members cm ON cm.user_id = tm.id
    WHERE cm.channel_id = $1
      AND LOWER(tm.name) IN (${placeholders})
  `, [channelId, ...names])

  return members.map((m: any) => m.id)
}

/**
 * Check if content has @everyone or @channel mentions.
 */
export function hasChannelMention(content: string): boolean {
  return /@everyone\b/.test(content) || /@channel\b/.test(content)
}

/**
 * Store mentions in the chat_mentions table.
 */
export async function storeMentions(
  messageId: number,
  channelId: string,
  userIds: string[],
  isChannelMention: boolean
) {
  if (isChannelMention) {
    await execute(`
      INSERT INTO chat_mentions (message_id, channel_id, user_id, mention_type)
      VALUES ($1, $2, NULL, 'channel')
    `, [messageId, channelId])
  }

  for (const userId of userIds) {
    await execute(`
      INSERT INTO chat_mentions (message_id, channel_id, user_id, mention_type)
      VALUES ($1, $2, $3, 'user')
    `, [messageId, channelId, userId])
  }
}

/**
 * Notify users who were @mentioned in a chat message.
 */
export async function notifyChatMention(params: {
  channelId: string
  channelName: string
  messageId: number
  senderId: string
  senderName: string
  mentionedUserIds: string[]
  messageSnippet: string
}) {
  // Exclude the sender from notifications
  const toNotify = params.mentionedUserIds.filter(id => id !== params.senderId)
  if (toNotify.length === 0) return

  await createBulkNotifications(toNotify, {
    type: 'chat_mention',
    title: 'Mentioned in chat',
    message: `${params.senderName} mentioned you in #${params.channelName}`,
    link: `/agency/chat?channel=${params.channelId}&message=${params.messageId}`,
    actorId: params.senderId,
    metadata: {
      channelId: params.channelId,
      channelName: params.channelName,
      messageId: params.messageId,
      messageSnippet: params.messageSnippet.substring(0, 120)
    }
  })
}

/**
 * Notify a user about a new DM message.
 */
export async function notifyChatDM(params: {
  channelId: string
  messageId: number
  senderId: string
  senderName: string
  recipientId: string
  messageSnippet: string
}) {
  if (params.senderId === params.recipientId) return

  await createNotification({
    userId: params.recipientId,
    type: 'chat_dm',
    title: 'New direct message',
    message: `${params.senderName}: ${params.messageSnippet.substring(0, 100)}`,
    link: `/agency/chat?channel=${params.channelId}`,
    actorId: params.senderId,
    metadata: {
      channelId: params.channelId,
      messageId: params.messageId
    }
  })
}

/**
 * Notify @everyone or @channel — all channel members except the sender.
 */
export async function notifyChatChannelMention(params: {
  channelId: string
  channelName: string
  messageId: number
  senderId: string
  senderName: string
  messageSnippet: string
}) {
  // Get all channel members except the sender
  const members = await queryRows(`
    SELECT user_id FROM chat_channel_members
    WHERE channel_id = $1 AND user_id != $2
  `, [params.channelId, params.senderId])

  const userIds = members.map((m: any) => m.user_id)
  if (userIds.length === 0) return

  await createBulkNotifications(userIds, {
    type: 'chat_mention',
    title: 'Mentioned in chat',
    message: `${params.senderName} mentioned @everyone in #${params.channelName}`,
    link: `/agency/chat?channel=${params.channelId}&message=${params.messageId}`,
    actorId: params.senderId,
    metadata: {
      channelId: params.channelId,
      channelName: params.channelName,
      messageId: params.messageId,
      messageSnippet: params.messageSnippet.substring(0, 120),
      isChannelMention: true
    }
  })
}

/**
 * Process a newly archived message: extract mentions, create notifications.
 * Called after a message is inserted into Neon from the DO archival.
 */
export async function processArchivedMessage(params: {
  messageId: number
  channelId: string
  userId: string
  content: string
}) {
  // Get channel info
  const channel = await queryOne(`
    SELECT name, type FROM chat_channels WHERE id = $1
  `, [params.channelId])

  if (!channel) return

  // Get sender info
  const sender = await queryOne(`
    SELECT name FROM team_members WHERE id = $1
  `, [params.userId])

  if (!sender) return

  // Handle DM notifications
  if (channel.type === 'dm') {
    const recipient = await queryOne(`
      SELECT user_id FROM chat_channel_members
      WHERE channel_id = $1 AND user_id != $2
      LIMIT 1
    `, [params.channelId, params.userId])

    if (recipient) {
      await notifyChatDM({
        channelId: params.channelId,
        messageId: params.messageId,
        senderId: params.userId,
        senderName: sender.name,
        recipientId: recipient.user_id,
        messageSnippet: params.content
      })
    }
    return
  }

  // Parse @mentions
  const mentionedUserIds = await parseMentions(params.content, params.channelId)
  const isChannelMention = hasChannelMention(params.content)

  // Store mentions
  if (mentionedUserIds.length > 0 || isChannelMention) {
    await storeMentions(params.messageId, params.channelId, mentionedUserIds, isChannelMention)
  }

  // Notify individual mentions
  if (mentionedUserIds.length > 0) {
    await notifyChatMention({
      channelId: params.channelId,
      channelName: channel.name,
      messageId: params.messageId,
      senderId: params.userId,
      senderName: sender.name,
      mentionedUserIds,
      messageSnippet: params.content
    })
  }

  // Notify @everyone/@channel
  if (isChannelMention) {
    await notifyChatChannelMention({
      channelId: params.channelId,
      channelName: channel.name,
      messageId: params.messageId,
      senderId: params.userId,
      senderName: sender.name,
      messageSnippet: params.content
    })
  }
}
