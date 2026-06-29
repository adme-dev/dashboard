// server/utils/socialInbox/store.ts
// Idempotent persistence for inbox conversations + messages. Takes an injected
// query runner so the upsert logic is unit-testable without a live DB.
//
// Idempotency contract: the conversation's counters (message_count/unread_count) and
// last_message_* fields are only advanced when a message row is ACTUALLY new. A duplicate
// delivery (webhook retry / overlapping poll window) inserts no message row and must not
// move any counter — so the conversation bump runs AFTER, gated on rows-affected.
import type { NormalizedEvent } from './types'

export interface DbRunner {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  execute(sql: string, params?: unknown[]): Promise<number>
}

/** Ensure the conversation exists (identity/profile fields only — NO counter/last_message bump). */
async function ensureConversation(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent): Promise<string> {
  const participantId = ev.participant.id ?? ev.message.authorId ?? null
  const participantName = ev.participant.name ?? ev.message.authorName ?? null

  const row = await db.queryOne<{ id: string }>(
    `INSERT INTO social_conversations
       (client_id, social_account_id, platform, channel_type, platform_conversation_id,
        permalink, participant_id, participant_name, participant_handle, rating, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
     ON CONFLICT (social_account_id, channel_type, platform_conversation_id) DO UPDATE SET
       participant_id = COALESCE(EXCLUDED.participant_id, social_conversations.participant_id),
       participant_name = COALESCE(EXCLUDED.participant_name, social_conversations.participant_name),
       participant_handle = COALESCE(EXCLUDED.participant_handle, social_conversations.participant_handle),
       permalink = COALESCE(EXCLUDED.permalink, social_conversations.permalink),
       rating = COALESCE(EXCLUDED.rating, social_conversations.rating),
       updated_at = NOW()
    RETURNING id`,
    [clientId, accountId, ev.platform, ev.channelType, ev.platformConversationId,
      ev.permalink ?? null, participantId, participantName, ev.participant.handle ?? null,
      ev.rating ?? null]
  )
  if (!row) throw new Error('ensureConversation: no id returned')
  return row.id
}

/** Insert a message; ON CONFLICT DO NOTHING makes it idempotent. Returns rows affected. */
async function insertMessage(db: DbRunner, conversationId: string, clientId: string, ev: NormalizedEvent): Promise<number> {
  return db.execute(
    `INSERT INTO social_messages
       (conversation_id, client_id, platform_message_id, direction, author_id, author_name,
        message_type, content, attachments, platform_timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
     ON CONFLICT (conversation_id, platform_message_id) WHERE platform_message_id IS NOT NULL DO NOTHING`,
    [conversationId, clientId, ev.message.platformMessageId, ev.message.direction,
      ev.message.authorId ?? null, ev.message.authorName ?? null, ev.message.messageType,
      ev.message.content ?? '', JSON.stringify(ev.message.attachments ?? []), ev.message.platformTimestamp ?? null]
  )
}

/** Advance conversation counters + last_message snapshot for a genuinely-new inbound message. */
async function bumpConversationForInbound(db: DbRunner, conversationId: string, ev: NormalizedEvent): Promise<void> {
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = GREATEST(COALESCE(last_message_at, '-infinity'::timestamptz), COALESCE($2::timestamptz, NOW())),
       last_message_preview = $3,
       last_message_direction = 'in',
       message_count = message_count + 1,
       unread_count = unread_count + 1,
       status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
       automation_state = 'pending',
       updated_at = NOW()
     WHERE id = $1`,
    [conversationId, ev.message.platformTimestamp ?? null, (ev.message.content ?? '').slice(0, 200)]
  )
}

/**
 * Record an inbound event: ensure the conversation, idempotently insert the message,
 * and only bump counters/last_message when the message was actually new.
 */
export async function recordInbound(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent) {
  const conversationId = await ensureConversation(db, clientId, accountId, ev)
  const affected = await insertMessage(db, conversationId, clientId, ev)
  if (affected > 0) await bumpConversationForInbound(db, conversationId, ev)
  return { conversationId, inserted: affected > 0 }
}

/** Record an outbound reply we just sent (direction='out'); always a genuinely-new row. */
export async function recordOutbound(
  db: DbRunner, conversationId: string, clientId: string,
  args: { platformMessageId: string | null, content: string, sentByUserId: string, messageType?: string }
): Promise<void> {
  await db.execute(
    `INSERT INTO social_messages
       (conversation_id, client_id, platform_message_id, direction, message_type, content, sent_by_user_id, platform_timestamp)
     VALUES ($1,$2,$3,'out',$4,$5,$6, NOW())`,
    [conversationId, clientId, args.platformMessageId, args.messageType ?? 'text', args.content, args.sentByUserId]
  )
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = NOW(), last_message_preview = $2, last_message_direction = 'out',
       message_count = message_count + 1, unread_count = 0,
       first_response_at = COALESCE(first_response_at, NOW()),
       updated_at = NOW()
     WHERE id = $1`,
    [conversationId, args.content.slice(0, 200)]
  )
}
