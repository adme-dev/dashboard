import type { InboxItem } from './types'
import { normalizeInboxItem } from './normalize'

interface ReviewSyncDb {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

/** Avoid hundreds of writes for the newest page that Google returns on every poll. */
export async function filterChangedGoogleReviews(db: ReviewSyncDb, clientId: string, accountId: string, items: InboxItem[]): Promise<InboxItem[]> {
  if (!items.length) return []
  const ids = [...new Set(items.map(item => item.platformMessageId).filter(Boolean))]
  const rows = await db.queryRows<Record<string, any>>(`SELECT m.platform_message_id, c.platform_conversation_id,
      m.content, m.direction, m.message_type, m.author_id, m.author_name, m.attachments,
      m.metadata, m.platform_timestamp, c.rating, c.participant_name, c.participant_id,
      c.participant_handle, c.permalink, c.priority, c.first_response_at, c.status
    FROM social_messages m JOIN social_conversations c ON c.id = m.conversation_id
    WHERE c.client_id = $1 AND c.social_account_id = $2
      AND c.platform = 'google-business' AND c.channel_type = 'review'
      AND m.platform_message_id = ANY($3::text[])`, [clientId, accountId, ids])
  const existing = new Map(rows.map(row => [JSON.stringify([row.platform_conversation_id, row.platform_message_id]), row]))
  return items.filter(item => {
    const row = existing.get(JSON.stringify([item.platformConversationId, item.platformMessageId]))
    if (!row) return true
    const ev = normalizeInboxItem('google-business', item)
    const m = ev.message
    if (row.content !== (m.content ?? '') || row.direction !== m.direction
      || row.message_type !== m.messageType || row.author_id !== (m.authorId ?? null)
      || row.author_name !== (m.authorName ?? null)
      || canonical(row.attachments ?? []) !== canonical(m.attachments ?? [])) return true
    if (m.platformTimestamp && new Date(row.platform_timestamp).getTime() !== new Date(m.platformTimestamp).getTime()) return true
    if (Object.entries(m.metadata ?? {}).some(([key, value]) => canonical(row.metadata?.[key]) !== canonical(value))) return true
    if (item.rating != null && Number(row.rating) !== item.rating) return true
    if (item.permalink != null && row.permalink !== item.permalink) return true
    if (m.direction === 'in') {
      for (const field of ['id', 'name', 'handle'] as const) {
        if (ev.participant[field] != null && row[`participant_${field}`] !== ev.participant[field]) return true
      }
      // An interrupted previous poll may have saved the message before urgent triage.
      if (item.rating != null && item.rating >= 1 && item.rating <= 3 && !m.metadata?.reviewHasReply
        && !row.first_response_at && row.status !== 'closed' && row.priority !== 'urgent') return true
    }
    return false
  })
}
