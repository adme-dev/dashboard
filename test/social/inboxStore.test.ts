import { describe, it, expect, vi } from 'vitest'
import { recordInbound } from '~~/server/utils/socialInbox/store'
import type { NormalizedEvent } from '~~/server/utils/socialInbox/types'

const ev: NormalizedEvent = {
  platform: 'youtube', channelType: 'comment', platformConversationId: 'v1',
  participant: { id: 'u1', name: 'Jane' },
  message: { platformMessageId: 'c1', direction: 'in', authorName: 'Jane', messageType: 'comment', content: 'hi' },
}

describe('recordInbound', () => {
  it('upserts the conversation then inserts the message and bumps counters', async () => {
    const calls: string[] = []
    const db = {
      queryOne: vi.fn(async (sql: string) => {
        calls.push(sql.trim().split('\n')[0])
        return { id: 'conv-1' }
      }),
      execute: vi.fn(async (sql: string) => { calls.push(sql.trim().split('\n')[0]); return 1 }),
    }
    const res = await recordInbound(db as any, 'client-1', 'acct-1', ev)
    expect(res.conversationId).toBe('conv-1')
    expect(calls[0]).toMatch(/INSERT INTO social_conversations/i)
    expect(calls.some(c => /INSERT INTO social_messages/i.test(c))).toBe(true)
  })

  it('is idempotent — a duplicate platform_message_id inserts no second message', async () => {
    const db = {
      queryOne: vi.fn(async () => ({ id: 'conv-1' })),
      execute: vi.fn(async (sql: string) => (/INSERT INTO social_messages/i.test(sql) ? 0 : 1)),
    }
    const res = await recordInbound(db as any, 'client-1', 'acct-1', ev)
    expect(res.inserted).toBe(false)
  })
})
