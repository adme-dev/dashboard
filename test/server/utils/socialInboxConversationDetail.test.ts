import { describe, expect, it } from 'vitest'
import { buildSocialInboxConversationDetailQuery } from '~~/server/utils/socialInbox/conversationDetail'

describe('buildSocialInboxConversationDetailQuery', () => {
  it('falls back to latest inbound author identity for legacy unknown conversations', () => {
    const q = buildSocialInboxConversationDetailQuery('conv-1')

    expect(q.params).toEqual(['conv-1'])
    expect(q.sql).toMatch(/COALESCE\(c\.participant_id, latest_in\.author_id\) AS participant_id/)
    expect(q.sql).toMatch(/COALESCE\(c\.participant_name, latest_in\.author_name\) AS participant_name/)
    expect(q.sql).toMatch(/a\.account_name AS social_account_name/)
    expect(q.sql).toMatch(/a\.platform_account_id AS social_account_platform_id/)
    expect(q.sql).toMatch(/LEFT JOIN social_accounts a ON a\.id = c\.social_account_id/)
    expect(q.sql).toMatch(/m\.direction = 'in'/)
    expect(q.sql).toMatch(/ORDER BY m\.platform_timestamp DESC NULLS LAST, m\.created_at DESC/)
  })

  it('surfaces native task and client request summaries scoped to the conversation client', () => {
    const q = buildSocialInboxConversationDetailQuery('conv-1')

    expect(q.sql).toMatch(/LEFT JOIN tasks linked_task ON linked_task\.id = c\.linked_task_id/)
    expect(q.sql).toMatch(/LEFT JOIN projects linked_project ON linked_project\.id = linked_task\.project_id AND linked_project\.client_id = c\.client_id/)
    expect(q.sql).toMatch(/LEFT JOIN client_requests linked_request ON linked_request\.id = c\.linked_client_request_id AND linked_request\.client_id = c\.client_id/)
    expect(q.sql).toMatch(/END AS linked_task/)
    expect(q.sql).toMatch(/END AS linked_client_request/)
  })
})
