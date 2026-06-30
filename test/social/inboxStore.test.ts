import { describe, it, expect } from 'vitest'
import { recordInbound, recordOutbound, type DbRunner } from '~~/server/utils/socialInbox/store'
import type { NormalizedEvent } from '~~/server/utils/socialInbox/types'

const ev: NormalizedEvent = {
  platform: 'youtube', channelType: 'comment', platformConversationId: 'v1',
  participant: { id: 'u1', name: 'Jane' },
  message: { platformMessageId: 'c1', direction: 'in', authorName: 'Jane', messageType: 'comment', content: 'hi' }
}

describe('recordInbound', () => {
  it('ensures the conversation then inserts the message and bumps counters', async () => {
    const calls: string[] = []
    const db: DbRunner = {
      async queryOne<T = unknown>(sql: string) {
        calls.push(sql.trim().split('\n')[0] ?? '')
        return { id: 'conv-1' } as T
      },
      async execute(sql: string) {
        calls.push(sql.trim().split('\n')[0] ?? '')
        return 1
      }
    }
    const res = await recordInbound(db, 'client-1', 'acct-1', ev)
    expect(res.conversationId).toBe('conv-1')
    expect(res.inserted).toBe(true)
    expect(calls[0]).toMatch(/INSERT INTO social_conversations/i)
    expect(calls.some(c => /INSERT INTO social_messages/i.test(c))).toBe(true)
    // genuinely-new message → the counter bump UPDATE runs
    expect(calls.some(c => /UPDATE social_conversations/i.test(c))).toBe(true)
  })

  it('is idempotent — a duplicate platform_message_id inserts no message AND bumps no counters', async () => {
    const calls: string[] = []
    const db: DbRunner = {
      async queryOne<T = unknown>(sql: string) {
        calls.push(sql.trim().split('\n')[0] ?? '')
        return { id: 'conv-1' } as T
      },
      async execute(sql: string) {
        calls.push(sql.trim().split('\n')[0])
        return /INSERT INTO social_messages/i.test(sql) ? 0 : 1 // ON CONFLICT DO NOTHING → 0 rows
      }
    }
    const res = await recordInbound(db, 'client-1', 'acct-1', ev)
    expect(res.inserted).toBe(false)
    // critical: no counter bump when the message was a duplicate
    expect(calls.some(c => /UPDATE social_conversations/i.test(c))).toBe(false)
  })

  it('merges metadata onto duplicate messages without bumping counters', async () => {
    const sqls: string[] = []
    const params: unknown[][] = []
    const db: DbRunner = {
      async queryOne<T = unknown>() {
        return { id: 'conv-1' } as T
      },
      async execute(sql: string, p?: unknown[]) {
        sqls.push(sql)
        if (p) params.push(p)
        return /INSERT INTO social_messages/i.test(sql) ? 0 : 1
      }
    }

    const res = await recordInbound(db, 'client-1', 'acct-1', {
      ...ev,
      message: {
        ...ev.message,
        metadata: {
          sourcePost: {
            id: 'post-1',
            title: 'Monster Sale Weekend',
            imageUrl: 'https://cdn.example.com/post.jpg'
          }
        }
      }
    })

    expect(res.inserted).toBe(false)
    expect(sqls.some(s => /UPDATE social_messages/i.test(s))).toBe(true)
    expect(sqls.some(s => /UPDATE social_conversations/i.test(s))).toBe(false)
    expect(params.flat()).toContain(JSON.stringify({
      sourcePost: {
        id: 'post-1',
        title: 'Monster Sale Weekend',
        imageUrl: 'https://cdn.example.com/post.jpg'
      }
    }))
  })

  it('flags automation_state=pending when a new inbound is recorded', async () => {
    const fullSql: string[] = []
    const db: DbRunner = {
      async queryOne<T = unknown>() {
        return { id: 'conv-1' } as T
      },
      async execute(sql: string) {
        fullSql.push(sql)
        return 1
      }
    }
    await recordInbound(db, 'client-1', 'acct-1', ev)
    expect(fullSql.some(s => /automation_state\s*=\s*'pending'/.test(s))).toBe(true)
  })

  it('uses author identity as the conversation participant fallback', async () => {
    const params: unknown[][] = []
    const db: DbRunner = {
      async queryOne<T = unknown>(_sql: string, p?: unknown[]) {
        if (p) params.push(p)
        return { id: 'conv-1' } as T
      },
      async execute() {
        return 0
      }
    }
    await recordInbound(db, 'client-1', 'acct-1', {
      ...ev,
      participant: {},
      message: { ...ev.message, authorId: 'author-1', authorName: 'Alex' }
    })

    expect(params[0]?.[6]).toBe('author-1')
    expect(params[0]?.[7]).toBe('Alex')
  })

  it('fills a missing participant id when a later payload includes one', async () => {
    let sql = ''
    const db: DbRunner = {
      async queryOne<T = unknown>(s: string) {
        sql = s
        return { id: 'conv-1' } as T
      },
      async execute() {
        return 0
      }
    }
    await recordInbound(db, 'client-1', 'acct-1', ev)

    expect(sql).toMatch(/participant_id = COALESCE\(EXCLUDED\.participant_id, social_conversations\.participant_id\)/)
  })

  it('persists optional campaign identity fields on inbound conversations', async () => {
    const params: unknown[][] = []
    let sql = ''
    const db: DbRunner = {
      async queryOne<T = unknown>(s: string, p?: unknown[]) {
        sql = s
        if (p) params.push(p)
        return { id: 'conv-1' } as T
      },
      async execute() {
        return 0
      }
    }
    await recordInbound(db, 'client-1', 'acct-1', {
      ...ev,
      campaignIdentity: {
        linkedSocialCampaignId: 'f1a191a4-c8d6-47ff-9d8d-5d7c14ec3875',
        paidMediaConnectionId: 'not-a-uuid',
        paidMediaPlatform: 'facebook',
        paidMediaAccountId: 'act_123',
        paidMediaCampaignId: 'camp-1',
        paidMediaCampaignName: 'EOFY Lead Gen'
      }
    })

    expect(sql).toMatch(/paid_media_campaign_id = COALESCE\(EXCLUDED\.paid_media_campaign_id, social_conversations\.paid_media_campaign_id\)/)
    expect(params[0]?.[10]).toBe('f1a191a4-c8d6-47ff-9d8d-5d7c14ec3875')
    expect(params[0]?.[11]).toBe('facebook')
    expect(params[0]?.[12]).toBeNull()
    expect(params[0]?.[13]).toBe('act_123')
    expect(params[0]?.[14]).toBe('camp-1')
    expect(params[0]?.[15]).toBe('EOFY Lead Gen')
  })

  it('links provider-synced outbound replies to their parent platform message and metadata', async () => {
    const sqls: string[] = []
    const params: unknown[][] = []
    const db: DbRunner = {
      async queryOne<T = unknown>(sql: string, p?: unknown[]) {
        sqls.push(sql)
        if (p) params.push(p)
        if (/INSERT INTO social_messages/i.test(sql)) return { inserted: true } as T
        return { id: 'conv-1' } as T
      },
      async execute(sql: string, p?: unknown[]) {
        sqls.push(sql)
        if (p) params.push(p)
        return 1
      }
    }

    const res = await recordInbound(db, 'client-1', 'acct-1', {
      ...ev,
      message: {
        platformMessageId: 'reply-1',
        parentPlatformMessageId: 'c1',
        direction: 'out',
        authorId: 'page-1',
        authorName: 'Northern Peugeot',
        messageType: 'comment_reply',
        content: 'Thanks for asking.',
        metadata: { source: 'platform_sync' }
      }
    })

    const insertSql = sqls.find(s => /INSERT INTO social_messages/i.test(s)) ?? ''
    const insertParams = params.find(p => p[2] === 'reply-1') ?? []
    expect(res.inserted).toBe(true)
    expect(insertSql).toMatch(/parent_message_id/)
    expect(insertSql).toMatch(/SELECT id FROM social_messages/)
    expect(insertSql).toMatch(/metadata/)
    expect(insertParams).toContain('c1')
    expect(insertParams).toContain(JSON.stringify({ source: 'platform_sync' }))
  })

  it('does not mark automation pending for provider-synced outbound replies', async () => {
    const updateSqls: string[] = []
    const db: DbRunner = {
      async queryOne<T = unknown>(sql: string) {
        if (/INSERT INTO social_messages/i.test(sql)) return { inserted: true } as T
        return { id: 'conv-1' } as T
      },
      async execute(sql: string) {
        if (/UPDATE social_conversations/i.test(sql)) updateSqls.push(sql)
        return 1
      }
    }

    await recordInbound(db, 'client-1', 'acct-1', {
      ...ev,
      message: {
        platformMessageId: 'reply-1',
        parentPlatformMessageId: 'c1',
        direction: 'out',
        authorId: 'page-1',
        authorName: 'Northern Peugeot',
        messageType: 'comment_reply',
        content: 'Thanks for asking.',
        metadata: { source: 'platform_sync' }
      }
    })

    expect(updateSqls).toHaveLength(1)
    expect(updateSqls[0]).toMatch(/last_message_direction = 'out'/)
    expect(updateSqls[0]).not.toMatch(/automation_state\s*=\s*'pending'/)
  })

  it('projects source post metadata onto the conversation row', async () => {
    let sql = ''
    const params: unknown[][] = []
    const db: DbRunner = {
      async queryOne<T = unknown>(s: string, p?: unknown[]) {
        sql = s
        if (p) params.push(p)
        return { id: 'conv-1' } as T
      },
      async execute() {
        return 0
      }
    }

    await recordInbound(db, 'client-1', 'acct-1', {
      ...ev,
      message: {
        ...ev.message,
        metadata: {
          sourcePost: {
            id: 'post-1',
            platform: 'facebook',
            title: 'GWS Monster Sale Weekend',
            text: 'Trading hours and offers',
            imageUrl: 'https://cdn.example.com/post.jpg',
            thumbnailUrl: 'https://cdn.example.com/post-thumb.jpg',
            mediaType: 'image',
            permalink: 'https://facebook.com/post/1',
            publishedAt: '2026-06-25T04:00:00Z'
          }
        }
      }
    })

    expect(sql).toMatch(/source_post_id/)
    expect(sql).toMatch(/source_post_media/)
    expect(sql).toMatch(/source_post_published_at/)
    expect(sql).toMatch(/source_post_id = COALESCE/)
    expect(params[0]).toContain('post-1')
    expect(params[0]).toContain('https://facebook.com/post/1')
    expect(params[0]).toContain('GWS Monster Sale Weekend')
    expect(params[0]).toContain('Trading hours and offers')
    expect(params[0]).toContain('2026-06-25T04:00:00Z')
  })

  it('stamps first_response_at (once) on the outbound update', async () => {
    const sqls: string[] = []
    const db: DbRunner = {
      async queryOne<T = unknown>() {
        return { id: 'c1' } as T
      },
      async execute(sql: string) {
        sqls.push(sql)
        return 1
      }
    }
    await recordOutbound(db, 'c1', 'cl1', { platformMessageId: 'p1', content: 'hi', sentByUserId: 'u1' })
    expect(sqls.some(s => /first_response_at = COALESCE\(first_response_at, NOW\(\)\)/.test(s))).toBe(true)
  })
})
