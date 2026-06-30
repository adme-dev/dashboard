import { describe, expect, it } from 'vitest'
import { groupSocialInboxMessages } from '../../app/utils/socialInboxThread'
import type { SocialMessage } from '../../app/types'

function message(overrides: Partial<SocialMessage>): SocialMessage {
  return {
    id: 'm1',
    conversation_id: 'c1',
    platform_message_id: null,
    direction: 'in',
    author_name: null,
    message_type: 'comment',
    content: null,
    attachments: [],
    is_internal_note: false,
    platform_timestamp: null,
    created_at: '2026-06-01T00:00:00Z',
    ...overrides
  }
}

describe('groupSocialInboxMessages', () => {
  it('groups child replies under their parent message without reordering roots', () => {
    const root = message({ id: 'root-1', content: 'Is this still available?' })
    const reply = message({
      id: 'reply-1',
      parent_message_id: 'root-1',
      direction: 'out',
      content: 'Yes, it is still available.',
      metadata: { source: 'platform_sync' }
    })
    const secondRoot = message({ id: 'root-2', content: 'Thanks', platform_timestamp: '2026-06-02T00:00:00Z' })

    const grouped = groupSocialInboxMessages([root, reply, secondRoot])

    expect(grouped).toHaveLength(2)
    expect(grouped[0]?.message.id).toBe('root-1')
    expect(grouped[0]?.replies.map(m => m.id)).toEqual(['reply-1'])
    expect(grouped[1]?.message.id).toBe('root-2')
  })

  it('keeps orphaned child messages visible as root messages', () => {
    const orphan = message({ id: 'reply-1', parent_message_id: 'missing-root' })

    expect(groupSocialInboxMessages([orphan])).toEqual([{ message: orphan, replies: [] }])
  })
})
