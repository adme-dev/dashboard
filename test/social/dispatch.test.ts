import { describe, it, expect, vi } from 'vitest'
import { resolveReplyTarget } from '~~/server/utils/socialInbox/dispatch'

describe('resolveReplyTarget', () => {
  it('review → the conversation platform_conversation_id', async () => {
    const db = { queryOne: vi.fn() }
    const conv = { channel_type: 'review', platform_conversation_id: 'rev-99' }
    expect(await resolveReplyTarget(db as any, 'c1', conv)).toBe('rev-99')
    expect(db.queryOne).not.toHaveBeenCalled()
  })
  it('comment → the latest inbound platform_message_id when present', async () => {
    const db = { queryOne: vi.fn(async () => ({ platform_message_id: 'cmt-7' })) }
    const conv = { channel_type: 'comment', platform_conversation_id: 'post-1' }
    expect(await resolveReplyTarget(db as any, 'c1', conv)).toBe('cmt-7')
  })
  it('comment with no inbound message id → falls back to conversation id', async () => {
    const db = { queryOne: vi.fn(async () => null) }
    const conv = { channel_type: 'comment', platform_conversation_id: 'post-1' }
    expect(await resolveReplyTarget(db as any, 'c1', conv)).toBe('post-1')
  })
})
