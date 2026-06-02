import { describe, it, expect, vi } from 'vitest'
import { upsertMentions, syncOwnedSignals, type ListeningDbRunner } from '~~/server/utils/socialListening/store'
import type { RawMention } from '~~/server/utils/socialListening/types'

function fakeRunner(rows: any[] = []): ListeningDbRunner & { calls: any[] } {
  const calls: any[] = []
  return {
    calls,
    queryRows: vi.fn(async (sql: string, params?: any[]) => { calls.push({ sql, params }); return rows }),
    queryOne: vi.fn(async () => null),
    execute: vi.fn(async (sql: string, params?: any[]) => { calls.push({ sql, params }); return 1 }),
  }
}

const raw = (o: Partial<RawMention> = {}): RawMention => ({
  source: 'owned', externalId: 'owned:c1', url: null, author: null, title: null,
  content: 'x', lang: null, publishedAt: '2026-06-01T00:00:00Z', sentiment: 'positive', raw: {}, ...o,
})

describe('upsertMentions', () => {
  it('returns 0 and runs no SQL for an empty batch', async () => {
    const db = fakeRunner()
    expect(await upsertMentions(db, 'client1', 'q1', [])).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('upserts each mention and sets enriched_at only when sentiment is provided', async () => {
    const db = fakeRunner()
    const n = await upsertMentions(db, 'client1', 'q1', [raw({ sentiment: 'positive' }), raw({ externalId: 'reddit:1', source: 'reddit', sentiment: undefined })])
    expect(n).toBe(2)
    const owned = db.calls.find(c => c.params?.includes('owned:c1'))
    const reddit = db.calls.find(c => c.params?.includes('reddit:1'))
    expect(owned.sql).toContain('ON CONFLICT (source, external_id)')
    expect(owned.sql).toContain('enriched_at')
    expect(reddit.sql).not.toContain('NOW() AS enriched')
  })
})

describe('syncOwnedSignals', () => {
  it('reads conversations for the client and upserts projected mentions', async () => {
    const db = fakeRunner([
      { id: 'c1', platform: 'facebook', channel_type: 'mention', permalink: null, participant_name: 'A', last_message_preview: 'hi', sentiment: 0.5, last_message_at: '2026-06-01T00:00:00Z' },
    ])
    const n = await syncOwnedSignals(db, 'client1')
    expect(n).toBe(1)
    const select = db.calls.find(c => /FROM social_conversations/.test(c.sql))
    expect(select.params).toEqual(['client1'])
  })
})
