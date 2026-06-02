import { describe, it, expect } from 'vitest'
import { projectConversationToMention } from '~~/server/utils/socialListening/ownedProjection'
import type { ConversationRow } from '~~/server/utils/socialListening/types'

const conv = (o: Partial<ConversationRow>): ConversationRow => ({
  id: 'c1', platform: 'facebook', channel_type: 'mention', permalink: 'https://fb/x',
  participant_name: 'Jane', last_message_preview: 'love it', sentiment: 0.6, last_message_at: '2026-06-01T00:00:00Z', ...o,
})

describe('projectConversationToMention', () => {
  it('maps a conversation to an owned RawMention with bucketed sentiment', () => {
    const m = projectConversationToMention(conv({}))
    expect(m.source).toBe('owned')
    expect(m.externalId).toBe('owned:c1')
    expect(m.url).toBe('https://fb/x')
    expect(m.author).toBe('Jane')
    expect(m.content).toBe('love it')
    expect(m.publishedAt).toBe('2026-06-01T00:00:00Z')
    expect(m.sentiment).toBe('positive')
    expect(m.raw.platform).toBe('facebook')
    expect(m.raw.channel_type).toBe('mention')
  })
  it('buckets a negative numeric sentiment and unknown when null', () => {
    expect(projectConversationToMention(conv({ sentiment: -0.5 })).sentiment).toBe('negative')
    expect(projectConversationToMention(conv({ sentiment: null })).sentiment).toBe('unknown')
  })
})
