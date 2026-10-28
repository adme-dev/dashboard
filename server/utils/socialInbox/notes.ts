// Staff-only internal notes on an inbox conversation (never sent to the platform). Shared by the
// browser note route and the marketing department MCP so both write the same row and fan out the
// same mention notifications.
import { createNotification } from '~~/server/utils/notifications'

interface NoteDb {
  // pg row shape (transaction client).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export async function insertInternalNote(
  db: NoteDb,
  input: { conversationId: string, clientId: string, content: string, authorId: string }
): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO social_messages (conversation_id, client_id, direction, message_type, content, is_internal_note, sent_by_user_id, platform_timestamp)
     VALUES ($1,$2,'out','note',$3, TRUE, $4, NOW()) RETURNING id`,
    [input.conversationId, input.clientId, input.content, input.authorId])
  return String(rows[0].id)
}

/** Best-effort post-commit mention fan-out; never notifies the author. */
export async function notifyNoteMentions(
  input: { conversationId: string, content: string, authorId: string, mentionUserIds: unknown }
): Promise<void> {
  for (const uid of (Array.isArray(input.mentionUserIds) ? input.mentionUserIds : [])) {
    if (uid && uid !== input.authorId) {
      await createNotification({
        userId: String(uid), type: 'social_assigned', actorId: input.authorId,
        title: 'Mentioned in a social note', message: input.content.slice(0, 140),
        link: `/agency/social/inbox?c=${input.conversationId}`, metadata: { conversationId: input.conversationId }
      })
    }
  }
}
