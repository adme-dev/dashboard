/**
 * POST /api/chat/dm
 * Create or get existing DM channel between current user and another user.
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { userId } = body
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }

  if (userId === user.id) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot create DM with yourself' })
  }

  // Check if DM already exists between these two users
  const existing = await queryOne(`
    SELECT c.* FROM chat_channels c
    WHERE c.type = 'dm'
      AND EXISTS (
        SELECT 1 FROM chat_channel_members m1
        WHERE m1.channel_id = c.id AND m1.user_id = $1
      )
      AND EXISTS (
        SELECT 1 FROM chat_channel_members m2
        WHERE m2.channel_id = c.id AND m2.user_id = $2
      )
      AND (SELECT COUNT(*) FROM chat_channel_members m3 WHERE m3.channel_id = c.id) = 2
    LIMIT 1
  `, [user.id, userId])

  if (existing) {
    return existing
  }

  // Get other user's name for the channel name
  const otherUser = await queryOne(`
    SELECT id, name FROM team_members WHERE id = $1
  `, [userId])

  if (!otherUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Sort user IDs for consistent slug
  const sortedIds = [user.id, userId].sort()
  const slug = `dm-${sortedIds[0].slice(0, 8)}-${sortedIds[1].slice(0, 8)}`

  const channel = await queryOne(`
    INSERT INTO chat_channels (name, slug, type, is_private, created_by)
    VALUES ($1, $2, 'dm', true, $3)
    RETURNING *
  `, [`${otherUser.name}`, slug, user.id])

  // Add both users
  await execute(`
    INSERT INTO chat_channel_members (channel_id, user_id, role) VALUES ($1, $2, 'member')
  `, [channel.id, user.id])

  await execute(`
    INSERT INTO chat_channel_members (channel_id, user_id, role) VALUES ($1, $2, 'member')
  `, [channel.id, userId])

  return channel
})
