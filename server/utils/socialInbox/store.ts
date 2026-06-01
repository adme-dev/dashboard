// server/utils/socialInbox/store.ts
// Idempotent persistence for inbox conversations + messages. Takes an injected
// query runner so the upsert logic is unit-testable without a live DB.
import type { NormalizedEvent } from './types'

export interface DbRunner {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  execute(sql: string, params?: any[]): Promise<number>
}

/** Upsert the conversation for an event, returning its id. */
async function upsertConversation(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent): Promise<string> {
  const row = await db.queryOne<{ id: string }>(
    `INSERT INTO social_conversations
       (client_id, social_account_id, platform, channel_type, platform_conversation_id,
        permalink, participant_id, participant_name, participant_handle, rating,
        last_message_at, last_message_preview, last_message_direction, message_count, unread_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, NOW()), $12, $13, 1, 1, NOW())
     ON CONFLICT (social_account_id, channel_type, platform_conversation_id) DO UPDATE SET
       last_message_at = COALESCE(EXCLUDED.last_message_at, social_conversations.last_message_at),
       last_message_preview = EXCLUDED.last_message_preview,
       last_message_direction = EXCLUDED.last_message_direction,
       message_count = social_conversations.message_count + 1,
       unread_count = social_conversations.unread_count + (CASE WHEN EXCLUDED.last_message_direction = 'in' THEN 1 ELSE 0 END),
       status = CASE WHEN social_conversations.status = 'closed' THEN 'open' ELSE social_conversations.status END,
       updated_at = NOW()
     RETURNING id`,
    [clientId, accountId, ev.platform, ev.channelType, ev.platformConversationId,
     ev.permalink ?? null, ev.participant.id ?? null, ev.participant.name ?? null, ev.participant.handle ?? null,
     ev.rating ?? null, ev.message.platformTimestamp ?? null,
     (ev.message.content ?? '').slice(0, 200), ev.message.direction],
  )
  if (!row) throw new Error('upsertConversation: no id returned')
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
     ev.message.content ?? '', JSON.stringify(ev.message.attachments ?? []), ev.message.platformTimestamp ?? null],
  )
}

/** Record an inbound event: upsert conversation, idempotently insert the message. */
export async function recordInbound(db: DbRunner, clientId: string, accountId: string, ev: NormalizedEvent) {
  const conversationId = await upsertConversation(db, clientId, accountId, ev)
  const affected = await insertMessage(db, conversationId, clientId, ev)
  return { conversationId, inserted: affected > 0 }
}

/** Record an outbound reply we just sent (direction='out'); also stamps the conversation. */
export async function recordOutbound(
  db: DbRunner, conversationId: string, clientId: string,
  args: { platformMessageId: string | null; content: string; sentByUserId: string; messageType?: string },
): Promise<void> {
  await db.execute(
    `INSERT INTO social_messages
       (conversation_id, client_id, platform_message_id, direction, message_type, content, sent_by_user_id, platform_timestamp)
     VALUES ($1,$2,$3,'out',$4,$5,$6, NOW())`,
    [conversationId, clientId, args.platformMessageId, args.messageType ?? 'text', args.content, args.sentByUserId],
  )
  await db.execute(
    `UPDATE social_conversations SET
       last_message_at = NOW(), last_message_preview = $2, last_message_direction = 'out',
       message_count = message_count + 1, unread_count = 0, updated_at = NOW()
     WHERE id = $1`,
    [conversationId, args.content.slice(0, 200)],
  )
}
