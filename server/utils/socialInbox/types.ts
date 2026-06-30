// server/utils/socialInbox/types.ts
// Shared server-side types for the Social Suite Slice 2 engagement inbox.
export type ChannelType = 'comment' | 'dm' | 'mention' | 'review'
export type Direction = 'in' | 'out'

export interface SocialInboxMessageMetadata {
  source?: 'platform_sync' | 'provider_sync' | 'xeroflow'
  [key: string]: unknown
}

export interface SocialInboxCampaignIdentity {
  linkedSocialCampaignId?: string | null
  paidMediaPlatform?: string | null
  paidMediaConnectionId?: string | null
  paidMediaAccountId?: string | null
  paidMediaCampaignId?: string | null
  paidMediaCampaignName?: string | null
}

/** Output of normalizeEvent — the shape store.ts persists. */
export interface NormalizedEvent {
  platform: string
  channelType: ChannelType
  platformConversationId: string
  permalink?: string
  campaignIdentity?: SocialInboxCampaignIdentity
  participant: { id?: string, name?: string, handle?: string }
  message: {
    platformMessageId: string
    direction: Direction
    authorId?: string
    authorName?: string
    messageType: string
    content: string
    attachments?: Array<{ url: string, type: string }>
    parentPlatformMessageId?: string
    metadata?: SocialInboxMessageMetadata
    platformTimestamp?: string // ISO
  }
  rating?: number // reviews
}

/** One raw item returned by a provider's fetchInbox(). */
export interface InboxItem {
  channelType: ChannelType
  platformConversationId: string
  permalink?: string
  campaignIdentity?: SocialInboxCampaignIdentity
  participant: { id?: string, name?: string, handle?: string }
  platformMessageId: string
  parentPlatformMessageId?: string
  direction?: Direction
  authorId?: string
  authorName?: string
  content: string
  messageType?: string
  attachments?: Array<{ url: string, type: string }>
  metadata?: SocialInboxMessageMetadata
  platformTimestamp?: string
  rating?: number
}
