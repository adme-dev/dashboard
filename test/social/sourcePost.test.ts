import { describe, expect, it } from 'vitest'
import { getSocialInboxSourcePost } from '~/utils/socialInboxSourcePost'
import type { SocialMessage } from '~/types'

const baseMessage: SocialMessage = {
  id: 'm1',
  conversation_id: 'c1',
  platform_message_id: 'pm1',
  direction: 'in',
  author_name: 'Alex',
  message_type: 'comment',
  content: 'Nice post',
  attachments: [],
  is_internal_note: false,
  platform_timestamp: '2026-06-30T00:00:00Z',
  created_at: '2026-06-30T00:00:00Z'
}

describe('getSocialInboxSourcePost', () => {
  it('returns the first usable source post from message metadata', () => {
    const sourcePost = getSocialInboxSourcePost([
      {
        ...baseMessage,
        metadata: {
          sourcePost: {
            id: 'post-1',
            title: 'Monster Sale Weekend',
            text: 'Monster Sale Weekend\nTrading hours',
            imageUrl: 'https://cdn.example.com/post.jpg',
            permalink: 'https://facebook.com/post/1'
          }
        }
      }
    ])

    expect(sourcePost).toEqual({
      id: 'post-1',
      title: 'Monster Sale Weekend',
      text: 'Monster Sale Weekend\nTrading hours',
      imageUrl: 'https://cdn.example.com/post.jpg',
      permalink: 'https://facebook.com/post/1'
    })
  })

  it('ignores empty metadata', () => {
    expect(getSocialInboxSourcePost([{ ...baseMessage, metadata: { sourcePost: {} } }])).toBeNull()
  })
})
