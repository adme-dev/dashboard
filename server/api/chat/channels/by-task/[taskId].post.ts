/**
 * POST /api/chat/channels/by-task/:taskId
 * Create a chat channel linked to a task, or return existing one.
 * Auto-adds the task assignee(s) and the creator as members.
 */
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const taskId = getRouterParam(event, 'taskId')
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID is required' })
  }

  // Check if channel already exists for this task
  const existing = await queryOne(`
    SELECT * FROM chat_channels WHERE task_id = $1 AND archived_at IS NULL LIMIT 1
  `, [taskId])

  if (existing) return existing

  // Get task info for naming
  const task = await queryOne(`
    SELECT t.id, t.title, t.department_id, t.assigned_to_id
    FROM tasks t WHERE t.id = $1
  `, [taskId])

  if (!task) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  }

  // Create channel
  const slug = `task-${taskId.substring(0, 8)}-${Date.now().toString(36)}`
  const channel = await queryOne(`
    INSERT INTO chat_channels (name, slug, type, is_private, created_by, department_id, task_id)
    VALUES ($1, $2, 'channel', true, $3, $4, $5)
    RETURNING *
  `, [
    task.title,
    slug,
    user.id,
    task.department_id || null,
    taskId
  ])

  // Add creator as owner
  await execute(`
    INSERT INTO chat_channel_members (channel_id, user_id, role)
    VALUES ($1, $2, 'owner')
  `, [channel.id, user.id])

  // Add task assignee as member if different from creator
  if (task.assigned_to_id && task.assigned_to_id !== user.id) {
    await execute(`
      INSERT INTO chat_channel_members (channel_id, user_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT DO NOTHING
    `, [channel.id, task.assigned_to_id])
  }

  return channel
})
