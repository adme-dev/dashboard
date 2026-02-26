import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event) || {}

  const title = body.title || null

  const row = await queryOne(`
    INSERT INTO ai_conversations (user_id, title)
    VALUES ($1, $2)
    RETURNING *
  `, [user.id, title])

  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create conversation' })
  }

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    model: row.model,
    systemContext: row.system_context || {},
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    isArchived: row.is_archived,
    isPinned: row.is_pinned || false,
    pinnedAt: row.pinned_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
})
