import { describe, expect, it, vi } from 'vitest'
import { filterChangedGoogleReviews } from '~~/server/utils/socialInbox/reviewSyncChanges'
import type { InboxItem } from '~~/server/utils/socialInbox/types'

const item: InboxItem = { channelType: 'review', platformConversationId: 'accounts/a/locations/l/reviews/r', platformMessageId: 'r', participant: { name: 'Jane' }, authorName: 'Jane', content: 'Great service', rating: 5, platformTimestamp: '2026-09-09T01:00:00.123456Z', metadata: { reviewHasReply: false, authorAvatarUrl: 'https://example.com/avatar' } }
function row(overrides = {}) {
  return { platform_message_id: 'r', platform_conversation_id: item.platformConversationId, content: item.content, direction: 'in', message_type: 'review', author_id: null, author_name: 'Jane', attachments: [], metadata: { authorAvatarUrl: 'https://example.com/avatar', reviewHasReply: false }, platform_timestamp: new Date(item.platformTimestamp!), rating: 5, participant_name: 'Jane', participant_id: null, participant_handle: null, permalink: null, priority: 'normal', first_response_at: null, status: 'open', ...overrides }
}

describe('Google review repeat sync', () => {
  it('skips unchanged reviews in one account/client-scoped read, including JSON key order and timestamp precision differences', async () => {
    const queryRows = vi.fn().mockResolvedValue([row()])
    expect(await filterChangedGoogleReviews({ queryRows }, 'client', 'account', [item])).toEqual([])
    expect(queryRows).toHaveBeenCalledOnce()
    expect(queryRows.mock.calls[0][1]).toEqual(['client', 'account', ['r']])
  })
  it.each([
    { content: 'Changed review text' }, { rating: 1 }, { authorName: 'Janet', participant: { name: 'Janet' } },
    { metadata: { reviewHasReply: true } }, { platformTimestamp: '2026-09-09T02:00:00Z' }
  ])('retains changed reviews for persistence and safety checks: %j', async change => {
    const changed = { ...item, ...change }
    expect(await filterChangedGoogleReviews({ queryRows: vi.fn().mockResolvedValue([row()]) }, 'client', 'account', [changed])).toEqual([changed])
  })
  it('retains new owner replies and never matches a message in a different conversation', async () => {
    const reply = { ...item, platformMessageId: 'r:reply', direction: 'out' as const }
    expect(await filterChangedGoogleReviews({ queryRows: vi.fn().mockResolvedValue([row({ platform_conversation_id: 'other' })]) }, 'client', 'account', [item, reply])).toEqual([item, reply])
  })
  it('retains unchanged low reviews when urgent triage has not yet been persisted', async () => {
    const low = { ...item, rating: 3 }
    const queryRows = vi.fn().mockResolvedValue([row({ rating: 3 })])
    expect(await filterChangedGoogleReviews({ queryRows }, 'client', 'account', [low])).toEqual([low])
    queryRows.mockResolvedValue([row({ rating: 3, priority: 'urgent' })])
    expect(await filterChangedGoogleReviews({ queryRows }, 'client', 'account', [low])).toEqual([])
  })
  it('retains existing owner replies when their content changes', async () => {
    const reply = { ...item, direction: 'out' as const, content: 'Updated owner response', messageType: 'review_reply', participant: {}, authorName: 'Owner response' }
    expect(await filterChangedGoogleReviews({ queryRows: vi.fn().mockResolvedValue([row({ direction: 'out', message_type: 'review_reply', author_name: 'Owner response' })]) }, 'client', 'account', [reply])).toEqual([reply])
  })
  it('does not query an empty page', async () => {
    const queryRows = vi.fn()
    expect(await filterChangedGoogleReviews({ queryRows }, 'client', 'account', [])).toEqual([])
    expect(queryRows).not.toHaveBeenCalled()
  })
})
