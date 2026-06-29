export interface SocialInboxClientApprovalDb {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  execute(sql: string, params?: unknown[]): Promise<number>
}

export interface SocialInboxClientApprovalInput {
  content?: unknown
}

export interface SocialInboxClientApprovalRow {
  id: string
  client_id: string
  conversation_id: string
  message_id: string | null
  draft_content: string
  status: string
  approver_type: string
}

export interface SocialInboxApprovalEventInput {
  conversationId: string
  clientId: string
  actorId?: string | null
  eventType: string
  content: string
  metadata?: Record<string, unknown>
}

export class SocialInboxClientApprovalError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'SocialInboxClientApprovalError'
    this.statusCode = statusCode
  }
}

function normalizeDraft(value: unknown) {
  return String(value ?? '').trim()
}

export async function recordSocialInboxApprovalEvent(
  db: SocialInboxClientApprovalDb,
  input: SocialInboxApprovalEventInput
): Promise<{ id: string } | null> {
  return await db.queryOne<{ id: string }>(
    `INSERT INTO social_conversation_events
      (conversation_id, client_id, actor_id, event_type, content, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [
      input.conversationId,
      input.clientId,
      input.actorId || null,
      input.eventType,
      input.content,
      JSON.stringify(input.metadata ?? {})
    ]
  )
}

export async function requestSocialReplyClientApproval(
  db: SocialInboxClientApprovalDb,
  conversationId: string,
  input: SocialInboxClientApprovalInput,
  actorId?: string | null
): Promise<SocialInboxClientApprovalRow> {
  const draft = normalizeDraft(input.content)
  if (!draft) {
    throw new SocialInboxClientApprovalError(400, 'Draft content required')
  }

  const conversation = await db.queryOne<{ id: string, client_id: string, latest_message_id: string | null }>(
    `SELECT c.id, c.client_id,
            (
              SELECT sm.id
                FROM social_messages sm
               WHERE sm.conversation_id = c.id
                 AND sm.direction = 'in'
               ORDER BY sm.platform_timestamp DESC NULLS LAST, sm.created_at DESC
               LIMIT 1
            ) AS latest_message_id
       FROM social_conversations c
      WHERE c.id = $1`,
    [conversationId]
  )

  if (!conversation) {
    throw new SocialInboxClientApprovalError(404, 'Conversation not found')
  }
  if (!conversation.latest_message_id) {
    throw new SocialInboxClientApprovalError(400, 'Conversation has no inbound message to approve')
  }

  const existing = await db.queryOne<SocialInboxClientApprovalRow>(
    `SELECT id, client_id, conversation_id, message_id, draft_content, status, approver_type
       FROM social_response_queue
      WHERE message_id = $1
        AND client_id = $2`,
    [conversation.latest_message_id, conversation.client_id]
  )

  if (existing) {
    if (existing.approver_type === 'client' && existing.status === 'pending') {
      const updated = await db.queryOne<SocialInboxClientApprovalRow>(
        `UPDATE social_response_queue
            SET draft_content = $3,
                guardrail_notes = 'Staff routed this draft to client approval.',
                updated_at = NOW()
          WHERE id = $1
            AND client_id = $2
          RETURNING id, client_id, conversation_id, message_id, draft_content, status, approver_type`,
        [existing.id, conversation.client_id, draft]
      )
      if (!updated) {
        throw new SocialInboxClientApprovalError(409, 'Approval request could not be updated')
      }
      await recordSocialInboxApprovalEvent(db, {
        conversationId,
        clientId: conversation.client_id,
        actorId,
        eventType: 'client_approval_updated',
        content: 'Client approval draft updated.',
        metadata: { response_queue_id: updated.id, message_id: updated.message_id }
      })
      return updated
    }

    throw new SocialInboxClientApprovalError(409, `Reply already queued as ${existing.status}`)
  }

  const row = await db.queryOne<SocialInboxClientApprovalRow>(
    `INSERT INTO social_response_queue
       (client_id, conversation_id, message_id, draft_content, confidence, status, effective_mode, approver_type, guardrail_notes)
     VALUES ($1, $2, $3, $4, NULL, 'pending', 'approval', 'client', 'Staff routed this draft to client approval.')
     ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
     RETURNING id, client_id, conversation_id, message_id, draft_content, status, approver_type`,
    [conversation.client_id, conversationId, conversation.latest_message_id, draft]
  )

  if (!row) {
    throw new SocialInboxClientApprovalError(409, 'Reply already queued')
  }

  await db.execute(
    `UPDATE social_conversations
        SET automation_state = 'awaiting_client_approval',
            updated_at = NOW()
      WHERE id = $1`,
    [conversationId]
  )
  await recordSocialInboxApprovalEvent(db, {
    conversationId,
    clientId: conversation.client_id,
    actorId,
    eventType: 'client_approval_requested',
    content: 'Reply draft sent to client approval.',
    metadata: { response_queue_id: row.id, message_id: row.message_id }
  })

  return row
}
