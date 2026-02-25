/**
 * GET /api/chat/channels/:channelId/notifications
 * Get current user's notification preferences for a channel.
 */
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  const pref = await queryOne(`
    SELECT notify_level, muted_until
    FROM chat_channel_notification_prefs
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  return pref || { notify_level: 'all', muted_until: null }
})
