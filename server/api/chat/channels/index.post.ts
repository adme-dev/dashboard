/**
 * POST /api/chat/channels
 * Create a new chat channel (channel, group_dm).
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, type = 'channel', isPrivate = false, memberIds = [], departmentId, taskId } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Channel name is required' })
  }

  if (!['channel', 'group_dm'].includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid channel type' })
  }

  // Generate slug from name
  const baseSlug = name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const slug = `${baseSlug}-${Date.now().toString(36)}`

  const channel = await queryOne(`
    INSERT INTO chat_channels (name, slug, description, type, is_private, created_by, department_id, task_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    name.trim(),
    slug,
    body.description || null,
    type,
    isPrivate,
    user.id,
    departmentId || null,
    taskId || null
  ])

  // Add creator as owner
  await execute(`
    INSERT INTO chat_channel_members (channel_id, user_id, role)
    VALUES ($1, $2, 'owner')
  `, [channel.id, user.id])

  // Add other members
  const uniqueMembers = [...new Set(memberIds.filter((id: string) => id !== user.id))]
  for (const memberId of uniqueMembers) {
    await execute(`
      INSERT INTO chat_channel_members (channel_id, user_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT DO NOTHING
    `, [channel.id, memberId])
  }

  return channel
})
