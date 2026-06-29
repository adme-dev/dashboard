import { describe, expect, it } from 'vitest'
import { buildSocialInboxConversationDetailQuery } from '~~/server/utils/socialInbox/conversationDetail'

describe('buildSocialInboxConversationDetailQuery', () => {
  it('falls back to latest inbound author identity for legacy unknown conversations', () => {
    const q = buildSocialInboxConversationDetailQuery('conv-1')

    expect(q.params).toEqual(['conv-1'])
    expect(q.sql).toMatch(/COALESCE\(c\.participant_id, latest_in\.author_id\) AS participant_id/)
    expect(q.sql).toMatch(/COALESCE\(c\.participant_name, latest_in\.author_name\) AS participant_name/)
    expect(q.sql).toMatch(/m\.direction = 'in'/)
    expect(q.sql).toMatch(/ORDER BY m\.platform_timestamp DESC NULLS LAST, m\.created_at DESC/)
  })
})
