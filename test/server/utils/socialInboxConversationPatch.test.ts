import { describe, expect, it } from 'vitest'
import { buildConversationPatchUpdate } from '~~/server/utils/socialInbox/conversationPatch'

describe('buildConversationPatchUpdate', () => {
  it('supports priority and normalized tags', () => {
    const result = buildConversationPatchUpdate({
      priority: 'high',
      tags: [' sales ', 'Sales', 'policy risk', '', 'a'.repeat(80)]
    })

    expect(result.sets).toEqual(['priority = $1', 'tags = $2'])
    expect(result.params).toEqual(['high', ['sales', 'policy risk', 'a'.repeat(40)]])
    expect(result.broadcastWorthy).toBe(true)
  })

  it('clears invalid priority values safely', () => {
    const result = buildConversationPatchUpdate({ priority: 'critical' })

    expect(result.sets).toEqual(['priority = $1'])
    expect(result.params).toEqual([null])
  })

  it('does not broadcast pure mark-read updates', () => {
    const result = buildConversationPatchUpdate({ markRead: true })

    expect(result.sets).toEqual(['unread_count = 0'])
    expect(result.broadcastWorthy).toBe(false)
  })
})
