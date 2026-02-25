import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { processUserMessage } from '~~/server/utils/aiChatEngine'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation ID required' })
  }

  const body = await readBody(event)
  const content = body?.content?.trim()

  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Message content required' })
  }

  if (content.length > 10000) {
    throw createError({ statusCode: 400, statusMessage: 'Message too long (max 10,000 characters)' })
  }

  // Verify ownership
  const conv = await queryOne(`
    SELECT id FROM ai_conversations
    WHERE id = $1 AND user_id = $2 AND is_archived = false
  `, [id, user.id])

  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  try {
    const result = await processUserMessage(id, user.id, user.role, content)
    return result
  } catch (err: any) {
    console.error('Failed to process AI message:', err)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process message',
    })
  }
})
