import { describe, expect, it } from 'vitest'
import { buildSocialInboxConversationListQuery } from '~~/server/utils/socialInbox/conversationList'

describe('buildSocialInboxConversationListQuery', () => {
  it('keeps the existing array response contract while adding pagination parameters', () => {
    const q = buildSocialInboxConversationListQuery({ clientId: 'client-1', status: 'open', limit: 25, offset: 50 })

    expect(q.params).toEqual(['client-1', 'open', 25, 50])
    expect(q.sql).toMatch(/a\.account_name AS social_account_name/)
    expect(q.sql).toMatch(/a\.platform_account_id AS social_account_platform_id/)
    expect(q.sql).toMatch(/LEFT JOIN social_accounts a ON a\.id = c\.social_account_id/)
    expect(q.sql).toMatch(/client\.id = a\.client_id/)
    expect(q.sql).toMatch(/a\.client_id = \$1/)
    expect(q.sql).toMatch(/c\.status = \$2/)
    expect(q.sql).toMatch(/LIMIT \$3/)
    expect(q.sql).toMatch(/OFFSET \$4/)
  })

  it('lists conversations across every active connected account when no client is selected', () => {
    const q = buildSocialInboxConversationListQuery({ clientId: null, status: 'open', limit: 25, offset: 0 })

    expect(q.params).toEqual(['open', 25, 0])
    expect(q.sql).toMatch(/a\.is_active = TRUE/)
    expect(q.sql).not.toMatch(/a\.client_id = \$/)
    expect(q.sql).toMatch(/c\.status = \$1/)
    expect(q.sql).toMatch(/LIMIT \$2/)
    expect(q.sql).toMatch(/OFFSET \$3/)
  })

  it('adds server-side search over participant, preview, and message content', () => {
    const q = buildSocialInboxConversationListQuery({ clientId: 'client-1', search: ' policy  ' })

    expect(q.params).toContain('%policy%')
    expect(q.sql).toMatch(/c\.participant_name ILIKE/)
    expect(q.sql).toMatch(/a\.account_name ILIKE/)
    expect(q.sql).toMatch(/a\.platform_account_id ILIKE/)
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
