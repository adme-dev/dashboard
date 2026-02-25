/**
 * GET /api/chat/channels/by-task/:taskId
 * Find the chat channel linked to a specific task, if any.
 */
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const taskId = getRouterParam(event, 'taskId')
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID is required' })
  }

  const channel = await queryOne(`
    SELECT c.id, c.name, c.slug, c.type, c.task_id, c.department_id, c.created_at, c.updated_at,
      (SELECT COUNT(*)::int FROM chat_channel_members cm WHERE cm.channel_id = c.id) AS member_count,
      (SELECT COUNT(*)::int FROM chat_messages m WHERE m.channel_id = c.id AND m.deleted_at IS NULL) AS message_count
    FROM chat_channels c
    WHERE c.task_id = $1 AND c.archived_at IS NULL
    LIMIT 1
  `, [taskId])

  return channel || null
})
