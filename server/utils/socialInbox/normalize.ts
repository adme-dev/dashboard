// server/utils/socialInbox/normalize.ts
// Pure mappers: turn provider-fetched items and Meta webhook changes into NormalizedEvents.
import type { InboxItem, NormalizedEvent } from './types'

/** Map a provider-fetched InboxItem (already half-normalized) into a NormalizedEvent. */
export function normalizeInboxItem(platform: string, item: InboxItem): NormalizedEvent {
  const participant = {
    ...(item.participant ?? {}),
    id: item.participant?.id ?? item.authorId,
    name: item.participant?.name ?? item.authorName
  }

  return {
    platform,
    channelType: item.channelType,
    platformConversationId: item.platformConversationId,
    permalink: item.permalink,
    campaignIdentity: item.campaignIdentity,
    participant,
    rating: item.rating,
    message: {
      platformMessageId: item.platformMessageId,
      direction: 'in',
      authorId: item.authorId,
      authorName: item.authorName ?? item.participant?.name,
      messageType: item.messageType ?? (item.channelType === 'review' ? 'review' : 'comment'),
      content: item.content,
      attachments: item.attachments,
      platformTimestamp: item.platformTimestamp
    }
  }
}

/**
 * Map one Meta webhook `mention` change into a NormalizedEvent (Slice 2d, App-Review-gated).
 * Fires when the connected Page/IG account is @-tagged. FB `mention` field value:
 *   { item: 'post'|'comment', post_id?, comment_id?, sender_id, sender_name, message, created_time }
 * Returns null if it isn't a mention we can anchor to an object id.
 */
export function normalizeMetaMentionWebhook(platform: string, change: any): NormalizedEvent | null {
  if (change?.field !== 'mention' && change?.field !== 'mentions') return null
  const v = change?.value
  if (!v) return null
  // Anchor the conversation on whatever object id the mention carries (comment > post > media).
  const objectId = v.comment_id ?? v.post_id ?? v.media_id ?? v.media?.id
  if (!objectId) return null
  return {
    platform,
    channelType: 'mention',
    platformConversationId: String(objectId),
    permalink: v.permalink_url ?? v.media?.permalink,
    participant: { id: v.sender_id ?? v.from?.id, name: v.sender_name ?? v.from?.name },
    message: {
      platformMessageId: String(objectId),
      direction: 'in',
      authorId: v.sender_id ?? v.from?.id,
      authorName: v.sender_name ?? v.from?.name,
      messageType: 'mention',
      content: v.message ?? v.text ?? '',
      platformTimestamp: v.created_time ? new Date(v.created_time * 1000).toISOString() : undefined
    }
  }
}

/**
 * Map one Meta Messenger / IG-DM webhook event into a NormalizedEvent (Slice 2d, App-Review-gated).
 * These arrive under `entry.messaging[]` (NOT `entry.changes[]`):
 *   { sender:{id}, recipient:{id}, timestamp, message:{ mid, text, is_echo?, attachments? } }
 * The conversation is keyed by the participant PSID (one DM thread per person). Outbound echoes
 * (our own sends reflected back) and delivery/read receipts are skipped — only inbound text/media.
 */
export function normalizeMetaMessageWebhook(platform: string, messaging: any): NormalizedEvent | null {
  const m = messaging?.message
  if (!m || m.is_echo) return null // echo = our own outbound reflected back; ignore
  if (!m.mid) return null
  const senderId = messaging?.sender?.id
  if (!senderId) return null
  const attachments = Array.isArray(m.attachments)
    ? m.attachments.map((a: any) => ({ url: a?.payload?.url ?? '', type: a?.type ?? 'file' })).filter((a: any) => a.url)
    : undefined
  const content = m.text ?? ''
  if (!content && !attachments?.length) return null // nothing renderable (e.g. a bare reaction)
  return {
    platform,
    channelType: 'dm',
    platformConversationId: String(senderId),
    participant: { id: String(senderId) },
    message: {
      platformMessageId: String(m.mid),
      direction: 'in',
      authorId: String(senderId),
      messageType: attachments?.length ? (attachments[0]!.type || 'file') : 'text',
      content,
      attachments,
      platformTimestamp: messaging?.timestamp ? new Date(Number(messaging.timestamp)).toISOString() : undefined
    }
  }
}

/** Map one Meta webhook `feed` change into a NormalizedEvent, or null if not a comment add. */
export function normalizeMetaCommentWebhook(platform: string, change: any): NormalizedEvent | null {
  const v = change?.value
  if (change?.field !== 'feed' || v?.item !== 'comment' || v?.verb !== 'add') return null
  if (!v.comment_id || !v.post_id) return null
  return {
    platform,
    channelType: 'comment',
    platformConversationId: String(v.post_id),
    permalink: v.permalink_url,
    participant: { id: v.from?.id, name: v.from?.name },
    message: {
      platformMessageId: String(v.comment_id),
      direction: 'in',
      authorId: v.from?.id,
      authorName: v.from?.name,
      messageType: 'comment',
      content: v.message ?? '',
      platformTimestamp: v.created_time ? new Date(v.created_time * 1000).toISOString() : undefined
    }
  }
}

/**
 * Map one Instagram webhook `comments` change into a NormalizedEvent. IG comments use a DIFFERENT
 * shape than the FB `feed` change: field `comments`, value { id, text, from:{id,username}, media:{id} },
 * no item/verb. The conversation threads on the media id; the message id is the comment id (which
 * `instagramProvider.reply` posts under via the /{id}/replies edge). Returns null if not an IG comment.
 */
export function normalizeIgCommentWebhook(change: any): NormalizedEvent | null {
  if (change?.field !== 'comments') return null
  const v = change?.value
  if (!v?.id) return null
  return {
    platform: 'instagram',
    channelType: 'comment',
    platformConversationId: String(v.media?.id ?? v.id),
    participant: { id: v.from?.id, name: v.from?.username, handle: v.from?.username },
    message: {
      platformMessageId: String(v.id),
      direction: 'in',
      authorId: v.from?.id,
      authorName: v.from?.username,
      messageType: 'comment',
      content: v.text ?? ''
    }
  }
}
