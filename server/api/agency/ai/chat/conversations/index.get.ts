import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const PAGE_SIZE = 50

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  const offset = Math.max(0, parseInt(query.offset as string) || 0)

  const [rows, countRow] = await Promise.all([
    queryRows(`
      SELECT id, user_id, title, model, system_context,
             message_count, last_message_at, is_archived,
             is_pinned, pinned_at,
             created_at, updated_at
      FROM ai_conversations
      WHERE user_id = $1 AND is_archived = false
      ORDER BY is_pinned DESC, pinned_at DESC NULLS LAST, last_message_at DESC NULLS LAST
      LIMIT $2 OFFSET $3
    `, [user.id, PAGE_SIZE, offset]),
    queryOne(`
      SELECT COUNT(*)::int as total
      FROM ai_conversations
      WHERE user_id = $1 AND is_archived = false
    `, [user.id]),
  ])

  const total = countRow?.total || 0

  return {
    conversations: rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      model: r.model,
      systemContext: r.system_context || {},
      messageCount: r.message_count,
      lastMessageAt: r.last_message_at,
      isArchived: r.is_archived,
      isPinned: r.is_pinned || false,
      pinnedAt: r.pinned_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total,
    hasMore: offset + rows.length < total,
  }
})
