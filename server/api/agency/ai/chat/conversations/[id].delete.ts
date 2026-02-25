import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation ID required' })
  }

  // Verify ownership
  const conv = await queryOne(`
    SELECT id FROM ai_conversations
    WHERE id = $1 AND user_id = $2
  `, [id, user.id])

  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  // Soft delete
  await execute(`
    UPDATE ai_conversations
    SET is_archived = true, updated_at = NOW()
    WHERE id = $1
  `, [id])

  return { success: true }
})
