import { describe, expect, it } from 'vitest'
import { buildSocialInboxWallQuery } from '~~/server/utils/socialInbox/wall'

describe('buildSocialInboxWallQuery', () => {
  it('groups engagement conversations by source post identity', () => {
    const q = buildSocialInboxWallQuery({ clientId: 'client-1', limit: 25 })

    expect(q.params).toEqual(['client-1', 25])
    expect(q.sql).toMatch(/WITH filtered_conversations AS/)
    expect(q.sql).toMatch(/COALESCE\(c\.source_post_id/)
    expect(q.sql).toMatch(/jsonb_agg/)
    expect(q.sql).toMatch(/latest_conversations/)
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

  it('escapes search wildcards', () => {
    const q = buildSocialInboxWallQuery({ clientId: 'client-1', search: '100%_ok' })

    expect(q.params).toContain('%100\\%\\_ok%')
    expect(q.sql).toContain('ESCAPE \'\\\'')
  })
})
