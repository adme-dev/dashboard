// server/utils/socialListening/ownedProjection.ts
// Pure: project an inbox conversation (Slice 2) into an owned listening mention.
import { bucketSentiment } from '~~/app/utils/socialListeningMatch'
import type { ConversationRow, RawMention } from '~~/server/utils/socialListening/types'

export function projectConversationToMention(c: ConversationRow): RawMention {
  return {
    source: 'owned',
    externalId: `owned:${c.id}`,
    url: c.permalink,
    author: c.participant_name,
    title: null,
    content: c.last_message_preview,
    lang: null,
    publishedAt: c.last_message_at,
    sentiment: bucketSentiment(c.sentiment),
    sentimentScore: c.sentiment,
    raw: { platform: c.platform, channel_type: c.channel_type, conversation_id: c.id },
  }
}
