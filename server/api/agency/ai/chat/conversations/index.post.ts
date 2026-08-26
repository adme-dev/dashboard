import { requireAuth } from '~~/server/utils/auth'
import { executeGodModeChatConversationCreate } from '~~/server/utils/ai/godModeMutationFamily'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event) || {}

  const title = body.title || null

  const row = await executeGodModeChatConversationCreate(event, async (db) => {
    const inserted = await db.query(`
      INSERT INTO ai_conversations (user_id, title)
      VALUES ($1, $2)
      RETURNING *
    `, [user.id, title])
    return inserted.rows[0]
  }, async (db, resultReference) => {
    const replayed = await db.query(
      `SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2`,
      [resultReference, user.id]
    )
    const existing = replayed.rows[0]
    if (!existing) {
      throw createError({ statusCode: 409, statusMessage: 'Conversation replay is unavailable' })
    }
    return existing
  })

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
    updatedAt: row.updated_at
  }
})
