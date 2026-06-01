import { describe, it, expect, vi } from 'vitest'
import { recordInbound } from '~~/server/utils/socialInbox/store'
import type { NormalizedEvent } from '~~/server/utils/socialInbox/types'

const ev: NormalizedEvent = {
  platform: 'youtube', channelType: 'comment', platformConversationId: 'v1',
  participant: { id: 'u1', name: 'Jane' },
  message: { platformMessageId: 'c1', direction: 'in', authorName: 'Jane', messageType: 'comment', content: 'hi' },
}

describe('recordInbound', () => {
  it('ensures the conversation then inserts the message and bumps counters', async () => {
    const calls: string[] = []
    const db = {
      queryOne: vi.fn(async (sql: string) => { calls.push(sql.trim().split('\n')[0]); return { id: 'conv-1' } }),
      execute: vi.fn(async (sql: string) => { calls.push(sql.trim().split('\n')[0]); return 1 }),
    }
    const res = await recordInbound(db as any, 'client-1', 'acct-1', ev)
    expect(res.conversationId).toBe('conv-1')
    expect(res.inserted).toBe(true)
    expect(calls[0]).toMatch(/INSERT INTO social_conversations/i)
    expect(calls.some(c => /INSERT INTO social_messages/i.test(c))).toBe(true)
    // genuinely-new message → the counter bump UPDATE runs
    expect(calls.some(c => /UPDATE social_conversations/i.test(c))).toBe(true)
  })

  it('is idempotent — a duplicate platform_message_id inserts no message AND bumps no counters', async () => {
    const calls: string[] = []
    const db = {
      queryOne: vi.fn(async (sql: string) => { calls.push(sql.trim().split('\n')[0]); return { id: 'conv-1' } }),
      execute: vi.fn(async (sql: string) => {
        calls.push(sql.trim().split('\n')[0])
        return /INSERT INTO social_messages/i.test(sql) ? 0 : 1 // ON CONFLICT DO NOTHING → 0 rows
      }),
    }
    const res = await recordInbound(db as any, 'client-1', 'acct-1', ev)
    expect(res.inserted).toBe(false)
    // critical: no counter bump when the message was a duplicate
    expect(calls.some(c => /UPDATE social_conversations/i.test(c))).toBe(false)
  })

  it('flags automation_state=pending when a new inbound is recorded', async () => {
    const fullSql: string[] = []
    const db = {
      queryOne: vi.fn(async () => ({ id: 'conv-1' })),
      execute: vi.fn(async (sql: string) => { fullSql.push(sql); return 1 }), // 1 row → genuinely new
    }
    await recordInbound(db as any, 'client-1', 'acct-1', ev)
    expect(fullSql.some(s => /automation_state\s*=\s*'pending'/.test(s))).toBe(true)
  })

  it('stamps first_response_at (once) on the outbound update', async () => {
    const sqls: string[] = []
    const db = { queryOne: async () => ({ id: 'c1' }), execute: async (sql: string) => { sqls.push(sql); return 1 } }
    const { recordOutbound } = await import('~~/server/utils/socialInbox/store')
    await recordOutbound(db as any, 'c1', 'cl1', { platformMessageId: 'p1', content: 'hi', sentByUserId: 'u1' })
    expect(sqls.some(s => /first_response_at = COALESCE\(first_response_at, NOW\(\)\)/.test(s))).toBe(true)
  })
})
