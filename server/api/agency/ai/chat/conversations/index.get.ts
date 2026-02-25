import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const rows = await queryRows(`
    SELECT id, user_id, title, model, system_context,
           message_count, last_message_at, is_archived,
           created_at, updated_at
    FROM ai_conversations
    WHERE user_id = $1 AND is_archived = false
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 50
  `, [user.id])

  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    model: r.model,
    systemContext: r.system_context || {},
    messageCount: r.message_count,
    lastMessageAt: r.last_message_at,
    isArchived: r.is_archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
})
