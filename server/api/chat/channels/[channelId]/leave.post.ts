/**
 * POST /api/chat/channels/:channelId/leave
 * Leave a channel. Owners cannot leave unless they transfer ownership.
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
    SELECT role FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 404, statusMessage: 'Not a member of this channel' })
  }

  // Check channel type — cannot leave DMs
  const channel = await queryOne(`
    SELECT type FROM chat_channels WHERE id = $1
  `, [channelId])

  if (channel?.type === 'dm') {
    throw createError({ statusCode: 400, statusMessage: 'Cannot leave a direct message' })
  }

  // Owners must transfer ownership first
  if (membership.role === 'owner') {
    const otherMembers = await queryOne(`
      SELECT COUNT(*)::int AS count FROM chat_channel_members
      WHERE channel_id = $1 AND user_id != $2
    `, [channelId, user.id])

    if (otherMembers && otherMembers.count > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Transfer ownership before leaving. Use PATCH to promote another member.'
      })
    }
  }

  // Remove membership
  await execute(`
    DELETE FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  return { success: true }
})
