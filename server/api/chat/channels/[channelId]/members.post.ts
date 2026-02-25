/**
 * POST /api/chat/channels/:channelId/members
 * Add a member to the channel. Requires admin/owner role.
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')
  const body = await readBody(event)

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  const { userId, role = 'member' } = body
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }

  // Check caller is admin/owner
  const membership = await queryOne(`
    SELECT role FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can add members' })
  }

  await execute(`
    INSERT INTO chat_channel_members (channel_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (channel_id, user_id) DO UPDATE SET role = $3
  `, [channelId, userId, role])

  return { success: true }
})
