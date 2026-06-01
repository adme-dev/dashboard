// server/utils/socialInbox/normalize.ts
// Pure mappers: turn provider-fetched items and Meta webhook changes into NormalizedEvents.
import type { InboxItem, NormalizedEvent } from './types'

/** Map a provider-fetched InboxItem (already half-normalized) into a NormalizedEvent. */
export function normalizeInboxItem(platform: string, item: InboxItem): NormalizedEvent {
  return {
    platform,
    channelType: item.channelType,
    platformConversationId: item.platformConversationId,
    permalink: item.permalink,
    participant: item.participant ?? {},
    rating: item.rating,
    message: {
      platformMessageId: item.platformMessageId,
      direction: 'in',
      authorId: item.authorId,
      authorName: item.authorName ?? item.participant?.name,
      messageType: item.messageType ?? (item.channelType === 'review' ? 'review' : 'comment'),
      content: item.content,
      attachments: item.attachments,
      platformTimestamp: item.platformTimestamp,
    },
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
      platformTimestamp: v.created_time ? new Date(v.created_time * 1000).toISOString() : undefined,
    },
  }
}
