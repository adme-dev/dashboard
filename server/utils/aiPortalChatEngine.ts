import type { H3Event } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { runPortalToolLoop } from '~~/server/utils/ai/portalLoop'
import { getEnabledPortalApps } from '~~/server/utils/ai/portalTools/appAssignment'

/**
 * Client-portal chat engine (portal-agent spec §8). The customer-facing analog of aiChatEngine —
 * deliberately lean (no LoRA / L2 controller / agency context retrieval) and HARD tenant-scoped:
 * every turn runs `runPortalToolLoop` with `clientScope = session.clientId`, over the SEPARATE portal
 * registry. Conversations live in `ai_conversations` (portal columns from mig 184), owned by the
 * `client_user_id` — an agency `user_id` is never set on a portal row.
 */

export interface PortalChatResult {
  conversationId: string
  reply: string
  toolCalls: Array<{ name: string, args: unknown }>
  /** Present when the assistant proposed a Tier-2 write awaiting the customer's confirmation. */
  proposedAction?: { proposalId: string, resolved: unknown, toolName: string } | null
}

/** Load (verifying client-user ownership) or create a portal conversation. */
async function resolveConversation(
  conversationId: string | undefined, clientUserId: string, clientId: string, firstMessage: string,
): Promise<string> {
  if (conversationId) {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM ai_conversations
       WHERE id = $1 AND client_user_id = $2 AND client_id = $3 AND is_archived = false`,
      [conversationId, clientUserId, clientId],
    )
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
    return row.id
  }
  const title = firstMessage.length > 60 ? firstMessage.slice(0, 57) + '...' : firstMessage
  const created = await queryOne<{ id: string }>(
    `INSERT INTO ai_conversations (client_user_id, client_id, title)
     VALUES ($1, $2, $3) RETURNING id`,
    [clientUserId, clientId, title],
  )
  if (!created) throw createError({ statusCode: 500, statusMessage: 'Could not start conversation' })
  return created.id
}

export async function processPortalMessage(input: {
  conversationId?: string
  clientUserId: string
  clientId: string
  /** The portal user's per-user permission flags — enforced on the toolset (mirrors the REST RBAC). */
  permissions?: Record<string, boolean>
  content: string
  event: H3Event
}): Promise<PortalChatResult> {
  const { clientUserId, clientId, permissions, content, event } = input
  if (!clientId) throw createError({ statusCode: 403, statusMessage: 'No client scope' })

  const conversationId = await resolveConversation(input.conversationId, clientUserId, clientId, content)

  // Recent history (last 10), oldest-first for the model.
  const historyRows = await queryRows<{ role: string, content: string }>(
    `SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [conversationId],
  )
  const messages = historyRows.reverse()
    .map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }))
    .concat([{ role: 'user' as const, content }])

  // Persist the user turn before calling the model (so a model failure still records the question).
  await execute(
    `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
    [conversationId, content],
  )

  const startedAt = Date.now()
  let reply = ''
  let toolCalls: Array<{ name: string, args: unknown }> = []
  let proposedAction: { proposalId: string, resolved: unknown, toolName: string } | null = null
  let isError = false
  try {
    // Toolset = the client's assigned apps ∩ portal-safe tools (null = default-all). Fail-safe to all.
    const enabledApps = await getEnabledPortalApps(clientId, { queryOne })
    const loop = await runPortalToolLoop({
      ctx: { clientScope: clientId, clientUserId, permissions, conversationId, event },
      messages,
      seed: conversationId,
      enabledApps,
    })
    reply = loop.text?.trim() || (loop.proposedAction
      ? 'I’ve prepared that — please review and confirm below.'
      : 'I looked into that but didn’t find anything to report.')
    toolCalls = loop.toolCalls
    proposedAction = loop.proposedAction
  } catch (err) {
    console.error('Portal AI loop failed:', err)
    reply = 'Sorry — I had trouble with that just now. Please try again in a moment.'
    isError = true
  }

  await execute(
    `INSERT INTO ai_messages (conversation_id, role, content, latency_ms, is_error, tool_calls)
     VALUES ($1, 'assistant', $2, $3, $4, $5::jsonb)`,
    [conversationId, reply, Date.now() - startedAt, isError, toolCalls.length ? JSON.stringify(toolCalls) : null],
  )

  await execute(
    `UPDATE ai_conversations
     SET message_count = COALESCE(message_count, 0) + 2, last_message_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [conversationId],
  )

  return { conversationId, reply, toolCalls, proposedAction }
}
