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
           is_pinned, pinned_at,
           created_at, updated_at
    FROM ai_conversations
    WHERE id = $1 AND user_id = $2
  `, [id, user.id])

  if (!conv) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const query = getQuery(event)
  const limit = Math.min(Math.max(parseInt(query.limit as string) || 50, 1), 200)
  const before = query.before as string | undefined

  const messageParams: any[] = [id, limit]
  let messageQuery = `
    SELECT id, conversation_id, role, content, context_sources,
           token_count, model, latency_ms, is_error, tool_calls, created_at
    FROM ai_messages
    WHERE conversation_id = $1`

  if (before) {
    messageQuery += ` AND created_at < $3`
    messageParams.push(before)
  }

  // Fetch in DESC order so we get the most recent, then reverse for display
  messageQuery += ` ORDER BY created_at DESC LIMIT $2`

  const messageRows = await queryRows(messageQuery, messageParams)
  messageRows.reverse()

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
    toolCalls: r.tool_calls || null,
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
      isPinned: conv.is_pinned || false,
      pinnedAt: conv.pinned_at,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
    },
    messages,
    hasMore: messages.length === limit,
  }
})
