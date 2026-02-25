/**
 * DELETE /api/chat/channels/:channelId/members
 * Remove a member from the channel (or leave if removing self).
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')
  const body = await readBody(event)

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  const { userId } = body
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }

  const isSelf = userId === user.id

  if (!isSelf) {
    // Check caller is admin/owner
    const membership = await queryOne(`
      SELECT role FROM chat_channel_members
      WHERE channel_id = $1 AND user_id = $2
    `, [channelId, user.id])

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw createError({ statusCode: 403, statusMessage: 'Only admins can remove members' })
    }
  }

  await execute(`
    DELETE FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, userId])

  return { success: true }
})
