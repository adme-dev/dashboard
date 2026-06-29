import { describe, expect, it } from 'vitest'
import { buildSocialInboxCaseTimelineQuery } from '~~/server/utils/socialInbox/caseTimeline'

describe('buildSocialInboxCaseTimelineQuery', () => {
  it('aggregates social messages, linked task activity, and linked client request messages', () => {
    const q = buildSocialInboxCaseTimelineQuery('conversation-1', 40)

    expect(q.params).toEqual(['conversation-1', 40])
    expect(q.sql).toMatch(/FROM social_conversations c/)
    expect(q.sql).toMatch(/FROM conv c\s+JOIN social_messages sm ON sm\.conversation_id = c\.id/)
    expect(q.sql).toMatch(/JOIN social_conversation_events sce ON sce\.conversation_id = c\.id AND sce\.client_id = c\.client_id/)
    expect(q.sql).toMatch(/JOIN tasks t ON t\.id = c\.linked_task_id/)
    expect(q.sql).toMatch(/JOIN projects p ON p\.id = t\.project_id AND p\.client_id = c\.client_id/)
    expect(q.sql).toMatch(/JOIN task_activities ta ON ta\.task_id = t\.id/)
    expect(q.sql).toMatch(/JOIN client_requests cr ON cr\.id = c\.linked_client_request_id AND cr\.client_id = c\.client_id/)
    expect(q.sql).toMatch(/JOIN client_request_messages crm ON crm\.request_id = cr\.id/)
    expect(q.sql).toMatch(/ORDER BY occurred_at DESC/)
  })

  it('clamps timeline limits to a safe range', () => {
    expect(buildSocialInboxCaseTimelineQuery('conversation-1', 0).params).toEqual(['conversation-1', 1])
    expect(buildSocialInboxCaseTimelineQuery('conversation-1', 250).params).toEqual(['conversation-1', 100])
    expect(buildSocialInboxCaseTimelineQuery('conversation-1', Number.NaN).params).toEqual(['conversation-1', 50])
  })
})
