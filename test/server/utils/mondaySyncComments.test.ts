import { describe, expect, it } from 'vitest'
import { normalizeMondayComments } from '../../../server/utils/mondaySync'

describe('normalizeMondayComments', () => {
  it('normalizes updates and replies with stable provenance and parent links', () => {
    const comments = normalizeMondayComments([{
      id: 'update-1',
      creator_id: 'person-1',
      created_at: '2026-07-10T01:00:00Z',
      text_body: '  Main update  ',
      replies: [{
        id: 'reply-1',
        creator_id: 'person-2',
        created_at: '2026-07-10T02:00:00Z',
        text_body: ' Reply '
      }]
    }] as any)

    expect(comments).toEqual([
      expect.objectContaining({ sourceId: 'update-1', parentSourceId: null, content: 'Main update' }),
      expect.objectContaining({ sourceId: 'reply-1', parentSourceId: 'update-1', content: 'Reply' })
    ])
  })

  it('drops empty comments and bounds untrusted Monday content', () => {
    const comments = normalizeMondayComments([
      { id: 'empty', created_at: '2026-07-10T01:00:00Z', text_body: '   ' },
      { id: 'large', created_at: 'invalid', text_body: 'x'.repeat(60_000) }
    ] as any)

    expect(comments).toHaveLength(1)
    expect(comments[0]?.sourceId).toBe('large')
    expect(comments[0]?.content).toHaveLength(50_000)
    expect(comments[0]?.createdAt).toBeNull()
  })
})
