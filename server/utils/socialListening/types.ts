// server/utils/socialListening/types.ts
import type { Sentiment } from '~~/app/utils/socialListeningMatch'

export type MentionSource = 'reddit' | 'news' | 'youtube' | 'bluesky' | 'mastodon' | 'owned'

/** A normalized hit, pre-persist. Adapters (4b) and the owned projection both emit this. */
export interface RawMention {
  source: MentionSource
  externalId: string
  url: string | null
  author: string | null
  title: string | null
  content: string | null
  lang: string | null
  publishedAt: string | null          // ISO
  sentiment?: Sentiment               // set for owned (known); left undefined for external (4c enriches)
  sentimentScore?: number | null
  raw: Record<string, unknown>
}

/** Row shape of social_conversations (subset used by the owned projection). */
export interface ConversationRow {
  id: string
  platform: string
  channel_type: string
  permalink: string | null
  participant_name: string | null
  last_message_preview: string | null
  sentiment: number | null
  last_message_at: string | null
}
