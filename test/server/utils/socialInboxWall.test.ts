import { describe, expect, it } from 'vitest'
import { buildSocialInboxWallQuery, normalizeSocialInboxWallRows } from '~~/server/utils/socialInbox/wall'

describe('buildSocialInboxWallQuery', () => {
  it('groups engagement conversations by source post identity', () => {
    const q = buildSocialInboxWallQuery({ clientId: 'client-1', limit: 25 })

    expect(q.params).toEqual(['client-1', 25])
    expect(q.sql).toMatch(/WITH filtered_conversations AS/)
    expect(q.sql).toMatch(/COALESCE\(c\.source_post_id/)
    expect(q.sql).toMatch(/c\.source_post_id IS NOT NULL/)
    expect(q.sql).toMatch(/c\.source_post_url IS NOT NULL/)
    expect(q.sql).toMatch(/c\.linked_social_post_id IS NOT NULL/)
    expect(q.sql).toMatch(/jsonb_agg/)
    expect(q.sql).toMatch(/latest_conversations/)
    expect(q.sql).toMatch(/ROW_NUMBER\(\) OVER/)
    expect(q.sql).toMatch(/PARTITION BY fc\.wall_key/)
    expect(q.sql).toMatch(/WHERE rc\.rn <= 5/)
    expect(q.sql).toMatch(/ORDER BY MAX\(fc\.last_message_at\) DESC NULLS LAST/)
  })

  it('adds platform, account, status, assignee, and search filters', () => {
    const q = buildSocialInboxWallQuery({
      clientId: 'client-1',
      platform: 'facebook',
      accountId: 'acct-1',
      status: 'open',
      assignedTo: 'user-1',
      search: 'monster sale',
      limit: 10
    })

    expect(q.params).toEqual([
      'client-1',
      'facebook',
      'acct-1',
      'open',
      'user-1',
      '%monster sale%',
      10
    ])
    expect(q.sql).toMatch(/c\.platform = \$2/)
    expect(q.sql).toMatch(/c\.social_account_id = \$3/)
    expect(q.sql).toMatch(/c\.status = \$4/)
    expect(q.sql).toMatch(/c\.assigned_to = \$5/)
    expect(q.sql).toMatch(/source_post_content ILIKE \$6/)
  })

  it('trims text filters and caps long search terms', () => {
    const q = buildSocialInboxWallQuery({
      clientId: ' client-1 ',
      platform: ' facebook ',
      status: ' open ',
      search: ` ${'x'.repeat(200)} `
    })

    expect(q.params[0]).toBe('client-1')
    expect(q.params[1]).toBe('facebook')
    expect(q.params[2]).toBe('open')
    expect(q.params[3]).toBe(`%${'x'.repeat(160)}%`)
  })

  it('clamps API page size defensively', () => {
    expect(buildSocialInboxWallQuery({ clientId: 'client-1', limit: 9999 }).params.at(-1)).toBe(120)
    expect(buildSocialInboxWallQuery({ clientId: 'client-1', limit: -10 }).params.at(-1)).toBe(1)
    expect(buildSocialInboxWallQuery({ clientId: 'client-1' }).params.at(-1)).toBe(60)
  })

  it('escapes search wildcards', () => {
    const q = buildSocialInboxWallQuery({ clientId: 'client-1', search: '100%_ok' })

    expect(q.params).toContain('%100\\%\\_ok%')
    expect(q.sql).toContain('ESCAPE \'\\\'')
  })
})

describe('normalizeSocialInboxWallRows', () => {
  it('returns a stable response shape from raw database rows', () => {
    const rows = normalizeSocialInboxWallRows([
      {
        key: 'post-1',
        client_id: 'client-1',
        platform: 'facebook',
        social_account_id: 'acct-1',
        source_post_media: JSON.stringify([
          { url: ' https://cdn.example.com/post.jpg ', type: 'image', thumbnailUrl: 'https://cdn.example.com/thumb.jpg' },
          { type: 'image' }
        ]),
        status_summary: { open: '2', snoozed: null, closed: 1 },
        unread_count: '3',
        conversation_count: '4',
        message_count: '12',
        latest_conversations: [
          {
            id: 'conv-1',
            channel_type: 'comment',
            status: 'open',
            unread_count: '2',
            rating: '5',
            latest_author_name: 'Alex'
          },
          { channel_type: 'comment' }
        ]
      },
      { key: null, client_id: 'client-1', platform: 'facebook' }
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'post-1',
      client_id: 'client-1',
      platform: 'facebook',
      status_summary: { open: 2, snoozed: 0, closed: 1 },
      unread_count: 3,
      conversation_count: 4,
      message_count: 12,
      latest_conversations: [{ id: 'conv-1', rating: 5, latest_author_name: 'Alex' }]
    })
    expect(rows[0]?.source_post_media).toEqual([
      { url: 'https://cdn.example.com/post.jpg', type: 'image', thumbnailUrl: 'https://cdn.example.com/thumb.jpg' }
    ])
  })
})
