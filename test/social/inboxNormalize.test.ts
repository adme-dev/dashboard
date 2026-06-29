import { describe, it, expect } from 'vitest'
import { normalizeInboxItem, normalizeMetaCommentWebhook } from '~~/server/utils/socialInbox/normalize'
import type { InboxItem } from '~~/server/utils/socialInbox/types'

describe('normalizeInboxItem', () => {
  it('maps a polled YouTube comment to a NormalizedEvent', () => {
    const item: InboxItem = {
      channelType: 'comment',
      platformConversationId: 'video_abc',
      permalink: 'https://youtu.be/abc',
      participant: { id: 'u1', name: 'Jane' },
      platformMessageId: 'cmt_1',
      authorId: 'u1', authorName: 'Jane',
      content: 'Great video!',
      platformTimestamp: '2026-06-01T00:00:00Z',
    }
    const ev = normalizeInboxItem('youtube', item)
    expect(ev.platform).toBe('youtube')
    expect(ev.channelType).toBe('comment')
    expect(ev.platformConversationId).toBe('video_abc')
    expect(ev.message.direction).toBe('in')
    expect(ev.message.platformMessageId).toBe('cmt_1')
    expect(ev.message.content).toBe('Great video!')
  })

  it('carries rating through for reviews', () => {
    const item: InboxItem = {
      channelType: 'review', platformConversationId: 'rev_9', participant: { name: 'Bob' },
      platformMessageId: 'rev_9', content: 'Five stars', rating: 5,
    }
    const ev = normalizeInboxItem('google-business', item)
    expect(ev.rating).toBe(5)
    expect(ev.message.messageType).toBe('review')
  })

  it('uses the message author as the participant fallback', () => {
    const item: InboxItem = {
      channelType: 'comment',
      platformConversationId: 'post_1',
      platformMessageId: 'comment_1',
      authorId: 'author_1',
      authorName: 'Alex',
      content: 'Nice car',
    }

    const ev = normalizeInboxItem('facebook', item)
    expect(ev.participant).toMatchObject({ id: 'author_1', name: 'Alex' })
  })
})

describe('normalizeMetaCommentWebhook', () => {
  it('extracts a comment from a page feed change', () => {
    const change = {
      field: 'feed',
      value: {
        item: 'comment', verb: 'add', comment_id: 'c_1', post_id: 'p_1',
        message: 'Nice!', from: { id: 'fb_u', name: 'Ann' }, created_time: 1735689600,
      },
    }
    const ev = normalizeMetaCommentWebhook('facebook', change)
    expect(ev?.channelType).toBe('comment')
    expect(ev?.platformConversationId).toBe('p_1')
    expect(ev?.message.platformMessageId).toBe('c_1')
    expect(ev?.message.content).toBe('Nice!')
    expect(ev?.participant.name).toBe('Ann')
  })

  it('returns null for non-comment changes', () => {
    expect(normalizeMetaCommentWebhook('facebook', { field: 'feed', value: { item: 'like', verb: 'add' } })).toBeNull()
  })
})
