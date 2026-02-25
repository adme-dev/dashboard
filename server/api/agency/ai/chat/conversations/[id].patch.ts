import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation ID required' })
  }

  const body = await readBody(event)
  const title = body?.title?.trim()

  if (!title || title.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Title required (max 200 characters)' })
  }

  const row = await queryOne(`
    UPDATE ai_conversations
    SET title = $1, updated_at = NOW()
    WHERE id = $2 AND user_id = $3 AND is_archived = false
    RETURNING id, title, updated_at
  `, [title, id, user.id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  return { id: row.id, title: row.title, updatedAt: row.updated_at }
})
