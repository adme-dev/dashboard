import { describe, expect, it } from 'vitest'
import { buildSocialInboxConversationListQuery } from '~~/server/utils/socialInbox/conversationList'

describe('buildSocialInboxConversationListQuery', () => {
  it('keeps the existing array response contract while adding pagination parameters', () => {
    const q = buildSocialInboxConversationListQuery({ clientId: 'client-1', status: 'open', limit: 25, offset: 50 })

    expect(q.params).toEqual(['client-1', 'open', 25, 50])
    expect(q.sql).toMatch(/c\.client_id = \$1/)
    expect(q.sql).toMatch(/c\.status = \$2/)
    expect(q.sql).toMatch(/LIMIT \$3/)
    expect(q.sql).toMatch(/OFFSET \$4/)
  })

  it('adds server-side search over participant, preview, and message content', () => {
    const q = buildSocialInboxConversationListQuery({ clientId: 'client-1', search: ' policy  ' })

    expect(q.params).toContain('%policy%')
    expect(q.sql).toMatch(/c\.participant_name ILIKE/)
    expect(q.sql).toMatch(/c\.last_message_preview ILIKE/)
    expect(q.sql).toMatch(/EXISTS \(/)
    expect(q.sql).toMatch(/sm\.content ILIKE/)
  })

  it('escapes LIKE wildcards from user search input', () => {
    const q = buildSocialInboxConversationListQuery({ clientId: 'client-1', search: '100%_ok' })

    expect(q.params).toContain('%100\\%\\_ok%')
    expect(q.sql).toContain('ESCAPE \'\\\'')
  })
})
