import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Conversation ID required' })
  }

  const conv = await queryOne(`
    SELECT id, user_id, title, model, system_context,
           message_count, last_message_at, is_archived,
           created_at, updated_at
    FROM ai_conversations
    WHERE id = $1 AND user_id = $2
  `, [id, user.id])

  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const messageRows = await queryRows(`
    SELECT id, conversation_id, role, content, context_sources,
           token_count, model, latency_ms, is_error, created_at
    FROM ai_messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `, [id])

  const messages = messageRows.map(r => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    contextSources: r.context_sources || [],
    tokenCount: r.token_count,
    model: r.model,
    latencyMs: r.latency_ms,
    isError: r.is_error,
    createdAt: r.created_at,
  }))

  return {
    conversation: {
      id: conv.id,
      userId: conv.user_id,
      title: conv.title,
      model: conv.model,
      systemContext: conv.system_context || {},
      messageCount: conv.message_count,
      lastMessageAt: conv.last_message_at,
      isArchived: conv.is_archived,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    },
    messages,
  }
})
