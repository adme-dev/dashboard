import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { processUserMessage } from '~~/server/utils/aiChatEngine'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { action, context } = body

  if (!action || typeof action !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Action text required' })
  }

  // Find or create a "quick-action" conversation for this user
  let conversation = await queryOne<any>(`
    SELECT id FROM ai_conversations
    WHERE user_id = $1 AND title = 'Quick Actions' AND is_archived = false
    ORDER BY created_at DESC
    LIMIT 1
  `, [user.id])

  if (!conversation) {
    conversation = await queryOne<any>(`
      INSERT INTO ai_conversations (user_id, title, system_context)
      VALUES ($1, 'Quick Actions', $2::jsonb)
      RETURNING id
    `, [user.id, JSON.stringify({ type: 'quick-action' })])
  }

  // Enrich the action with page context
  let enrichedContent = action

  if (context?.boardId) {
    // Try to fetch board summary for richer context
    try {
      const board = await queryOne<any>(`
        SELECT d.name,
               COUNT(t.id) FILTER (WHERE t.parent_task_id IS NULL) as total_tasks,
               COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.parent_task_id IS NULL) as done_tasks,
               COUNT(t.id) FILTER (WHERE t.due_date < NOW() AND t.status NOT IN ('done', 'complete', 'skipped') AND t.parent_task_id IS NULL) as overdue_tasks
        FROM departments d
        LEFT JOIN tasks t ON t.department_id = d.id
        WHERE d.id = $1 OR d.slug = $1
        GROUP BY d.id, d.name
      `, [context.boardId])

      if (board) {
        enrichedContent += `\n\n[Context: Viewing the "${board.name}" board with ${board.total_tasks} tasks (${board.done_tasks} done, ${board.overdue_tasks} overdue)]`
      } else {
        enrichedContent += `\n\n[Context: The user is currently viewing board ID ${context.boardId}]`
      }
    } catch {
      enrichedContent += `\n\n[Context: The user is currently viewing board ID ${context.boardId}]`
    }
  }
  if (context?.briefId) {
    enrichedContent += `\n\n[Context: The user is currently viewing brief ID ${context.briefId}]`
  }
  if (context?.pageRoute) {
    enrichedContent += `\n\n[Context: The user is currently on page ${context.pageRoute}]`
  }

  const result = await processUserMessage(conversation.id, user.id, user.role, enrichedContent, event, undefined, context?.boardId)

  // Return a synthetic user message for the widget UI
  const userMessage = {
    id: `quick-${Date.now()}`,
    conversationId: conversation.id,
    role: 'user',
    content: action,
    contextSources: [],
    tokenCount: null,
    model: null,
    latencyMs: null,
    isError: false,
    createdAt: new Date().toISOString(),
  }

  return {
    conversationId: conversation.id,
    userMessage,
    message: result.message,
    contextSources: result.contextSources,
  }
})
