/**
 * PATCH /api/chat/channels/:channelId/mute
 * Set notification preferences for a channel.
 * Body: { notifyLevel?: 'all' | 'mentions' | 'nothing', muteDuration?: number (minutes, 0 to unmute) }
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  // Verify membership
  const membership = await queryOne(`
    SELECT 1 FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  const body = await readBody(event)
  const { notifyLevel, muteDuration } = body

  // Validate notify level
  const validLevels = ['all', 'mentions', 'nothing']
  if (notifyLevel && !validLevels.includes(notifyLevel)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid notify level' })
  }

  // Calculate muted_until
  let mutedUntil: string | null = null
  if (typeof muteDuration === 'number' && muteDuration > 0) {
    const until = new Date(Date.now() + muteDuration * 60 * 1000)
    mutedUntil = until.toISOString()
  }

  // Upsert notification preferences
  const pref = await queryOne(`
    INSERT INTO chat_channel_notification_prefs (channel_id, user_id, notify_level, muted_until)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (channel_id, user_id) DO UPDATE SET
      notify_level = COALESCE($3, chat_channel_notification_prefs.notify_level),
      muted_until = $4,
      updated_at = NOW()
    RETURNING *
  `, [channelId, user.id, notifyLevel || 'all', mutedUntil])

  // Also update the legacy muted_until on chat_channel_members for backward compat
  await execute(`
    UPDATE chat_channel_members SET muted_until = $3
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id, mutedUntil])

  return pref
})
