// server/utils/socialInbox/portal.ts
// Client-portal data layer for the engagement inbox (Slice 2d). This is the CLIENT-FACING
// read + approve surface, so the cardinal rules are baked in here rather than left to each
// endpoint:
//   1. TENANT ISOLATION — every query is scoped to the session client_id passed by the
//      endpoint (derived from requireClientAuth, NEVER from caller input). No clientId arg
//      is ever read from the request body/query.
//   2. NO INTERNAL NOTES — staff-only `is_internal_note` rows are excluded from anything a
//      client can read.
//   3. CLIENT-ROUTED APPROVALS ONLY — clients can only see/act on queue items whose rule
//      routed approval to `approver_type = 'client'`.
// Functions take an injected runner so the scoping logic is unit-testable without a live DB.

export interface PortalDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

export interface PortalConversationFilters {
  channel?: string
  platform?: string
  status?: string
  limit?: string | number
}

const MAX_LIMIT = 200

/** List a client's conversations, newest activity first. Read-only; client-scoped. */
export async function listPortalConversations(
  db: PortalDb, clientId: string, filters: PortalConversationFilters,
): Promise<any[]> {
  const params: any[] = [clientId]
  let sql = `SELECT id, platform, channel_type, permalink, participant_name, participant_handle,
                    status, rating, last_message_at, last_message_preview, last_message_direction,
                    unread_count, message_count, automation_state, created_at, updated_at
               FROM social_conversations
              WHERE client_id = $1`
  // Whitelist: only these request keys map to columns. Unknown keys are dropped entirely,
  // so neither the column name nor the value can be attacker-controlled.
  for (const [col, key] of [['channel_type', 'channel'], ['platform', 'platform'], ['status', 'status']] as const) {
    const v = (filters as Record<string, unknown>)[key]
    if (v) { params.push(v); sql += ` AND ${col} = $${params.length}` }
  }
  params.push(Math.min(Number(filters.limit) || 100, MAX_LIMIT))
  sql += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${params.length}`
  return db.queryRows(sql, params)
}

/**
 * Fetch one conversation (scoped to the client) plus its client-visible messages.
 * Returns null if the conversation does not belong to this client (prevents IDOR).
 * Internal notes are excluded from the message list.
 */
export async function getPortalConversation(
  db: PortalDb, clientId: string, conversationId: string,
): Promise<{ conversation: any; messages: any[] } | null> {
  const conversation = await db.queryOne(
    `SELECT id, platform, channel_type, permalink, participant_name, participant_handle,
            status, rating, last_message_at, last_message_preview, last_message_direction,
            unread_count, message_count, automation_state, created_at, updated_at
       FROM social_conversations
      WHERE id = $1 AND client_id = $2`,
    [conversationId, clientId],
  )
  if (!conversation) return null
  const messages = await db.queryRows(
    `SELECT id, direction, author_name, message_type, content, attachments,
            ai_generated, platform_timestamp, created_at
       FROM social_messages
      WHERE conversation_id = $1 AND is_internal_note = FALSE
      ORDER BY platform_timestamp ASC NULLS FIRST, created_at ASC`,
    [conversationId],
  )
  return { conversation, messages }
}

/** Pending automation drafts routed to the client for approval, with conversation context. */
export async function listPortalApprovals(db: PortalDb, clientId: string): Promise<any[]> {
  return db.queryRows(
    `SELECT rq.id, rq.conversation_id, rq.draft_content, rq.confidence, rq.created_at,
            c.platform, c.channel_type, c.participant_name, c.permalink,
            c.last_message_preview AS inbound_preview, c.rating
       FROM social_response_queue rq
       JOIN social_conversations c ON c.id = rq.conversation_id
      WHERE rq.client_id = $1 AND rq.approver_type = 'client' AND rq.status = 'pending'
      ORDER BY rq.created_at DESC
      LIMIT 200`,
    [clientId],
  )
}

/**
 * Load a queue row the client is allowed to act on: it must belong to this client AND have
 * been routed to the client (`approver_type = 'client'`). Returns null otherwise (404 upstream).
 */
export async function loadClientApprovable(
  db: PortalDb, clientId: string, queueId: string,
): Promise<{ id: string; status: string; conversation_id: string; draft_content: string } | null> {
  return db.queryOne(
    `SELECT id, status, conversation_id, draft_content
       FROM social_response_queue
      WHERE id = $1 AND client_id = $2 AND approver_type = 'client'`,
    [queueId, clientId],
  )
}
