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
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  queryRows<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<number>
}

export interface PortalConversationFilters {
  channel?: string
  platform?: string
  status?: string
  limit?: string | number
}

const MAX_LIMIT = 200

export interface PortalConversationRow {
  id: string
  platform: string
  channel_type: string
  permalink: string | null
  participant_name: string | null
  participant_handle?: string | null
  status: string
  rating: number | null
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: string | null
  unread_count: number
  message_count: number
  automation_state?: string | null
  created_at: string
  updated_at: string
}

export interface PortalMessageRow {
  id: string
  direction: string
  author_name: string | null
  message_type: string
  content: string | null
  attachments?: unknown
  ai_generated?: boolean | null
  platform_timestamp: string | null
  created_at: string
}

export interface PortalApprovalRow {
  id: string
  conversation_id: string
  draft_content: string
  confidence: number | null
  created_at: string
  platform: string
  channel_type: string
  participant_name: string | null
  permalink: string | null
  inbound_preview: string | null
  rating: number | null
  recent_messages: unknown
}

/** List a client's conversations, newest activity first. Read-only; client-scoped. */
export async function listPortalConversations(
  db: PortalDb, clientId: string, filters: PortalConversationFilters
): Promise<PortalConversationRow[]> {
  const params: unknown[] = [clientId]
  let sql = `SELECT id, platform, channel_type, permalink, participant_name, participant_handle,
                    status, rating, last_message_at, last_message_preview, last_message_direction,
                    unread_count, message_count, automation_state, created_at, updated_at
               FROM social_conversations
              WHERE client_id = $1`
  // Whitelist: only these request keys map to columns. Unknown keys are dropped entirely,
  // so neither the column name nor the value can be attacker-controlled.
  for (const [col, key] of [['channel_type', 'channel'], ['platform', 'platform'], ['status', 'status']] as const) {
    const v = (filters as Record<string, unknown>)[key]
    if (v) {
      params.push(v)
      sql += ` AND ${col} = $${params.length}`
    }
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
  db: PortalDb, clientId: string, conversationId: string
): Promise<{ conversation: PortalConversationRow, messages: PortalMessageRow[] } | null> {
  const conversation = await db.queryOne<PortalConversationRow>(
    `SELECT id, platform, channel_type, permalink, participant_name, participant_handle,
            status, rating, last_message_at, last_message_preview, last_message_direction,
            unread_count, message_count, automation_state, created_at, updated_at
       FROM social_conversations
      WHERE id = $1 AND client_id = $2`,
    [conversationId, clientId]
  )
  if (!conversation) return null
  const messages = await db.queryRows<PortalMessageRow>(
    `SELECT id, direction, author_name, message_type, content, attachments,
            ai_generated, platform_timestamp, created_at
       FROM social_messages
      WHERE conversation_id = $1 AND is_internal_note = FALSE
      ORDER BY platform_timestamp ASC NULLS FIRST, created_at ASC`,
    [conversationId]
  )
  return { conversation, messages }
}

/** Pending automation drafts routed to the client for approval, with conversation context. */
export async function listPortalApprovals(db: PortalDb, clientId: string): Promise<PortalApprovalRow[]> {
  return db.queryRows<PortalApprovalRow>(
    `SELECT rq.id, rq.conversation_id, rq.draft_content, rq.confidence, rq.created_at,
            c.platform, c.channel_type, c.participant_name, c.permalink,
            c.last_message_preview AS inbound_preview, c.rating,
            COALESCE(ctx.recent_messages, '[]'::jsonb) AS recent_messages
       FROM social_response_queue rq
       JOIN social_conversations c ON c.id = rq.conversation_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'direction', m.direction,
                    'author_name', m.author_name,
                    'content', m.content,
                    'occurred_at', m.occurred_at
                  )
                  ORDER BY m.occurred_at ASC NULLS FIRST
                ) AS recent_messages
           FROM (
             SELECT sm.direction, sm.author_name, sm.content,
                    COALESCE(sm.platform_timestamp, sm.created_at) AS occurred_at
               FROM social_messages sm
              WHERE sm.conversation_id = rq.conversation_id
                AND sm.is_internal_note = FALSE
              ORDER BY COALESCE(sm.platform_timestamp, sm.created_at) DESC NULLS LAST
              LIMIT 5
           ) m
       ) ctx ON TRUE
      WHERE rq.client_id = $1 AND rq.approver_type = 'client' AND rq.status = 'pending'
      ORDER BY rq.created_at DESC
      LIMIT 200`,
    [clientId]
  )
}

/**
 * Load a queue row the client is allowed to act on: it must belong to this client AND have
 * been routed to the client (`approver_type = 'client'`). Returns null otherwise (404 upstream).
 */
export async function loadClientApprovable(
  db: PortalDb, clientId: string, queueId: string
): Promise<{ id: string, status: string, conversation_id: string, draft_content: string } | null> {
  return db.queryOne(
    `SELECT id, status, conversation_id, draft_content
       FROM social_response_queue
      WHERE id = $1 AND client_id = $2 AND approver_type = 'client'`,
    [queueId, clientId]
  )
}
