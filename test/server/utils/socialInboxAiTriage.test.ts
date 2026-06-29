import { describe, expect, it } from 'vitest'
import {
  buildSocialInboxAiTriagePrompt,
  parseSocialInboxAiTriageResponse
} from '~~/server/utils/socialInbox/aiTriage'

describe('parseSocialInboxAiTriageResponse', () => {
  it('parses strict triage JSON and keeps only allowed task candidates', () => {
    const parsed = parseSocialInboxAiTriageResponse(
      JSON.stringify({
        summary: 'Negative public comment needs a staff follow-up.',
        sentiment: 'negative',
        riskLevel: 'high',
        suggestedPriority: 'urgent',
        suggestedTags: [' complaint ', 'facebook', 'complaint'],
        approvalRecommended: true,
        actions: [
          { type: 'link_task', taskId: 'task-1', reason: 'Existing complaint task.' },
          { type: 'link_task', taskId: 'other-client-task', reason: 'Should be ignored.' },
          { type: 'create_social_case', title: 'Follow up social complaint', description: 'Customer is upset.', reason: 'No matching task.' },
          { type: 'client_approval', reason: 'Sensitive public wording.' }
        ]
      }),
      new Set(['task-1'])
    )

    expect(parsed).toMatchObject({
      summary: 'Negative public comment needs a staff follow-up.',
      sentiment: 'negative',
      riskLevel: 'high',
      suggestedPriority: 'urgent',
      approvalRecommended: true
    })
    expect(parsed.suggestedTags).toEqual(['complaint', 'facebook'])
    expect(parsed.actions).toEqual([
      { type: 'link_task', taskId: 'task-1', reason: 'Existing complaint task.' },
      { type: 'create_social_case', title: 'Follow up social complaint', description: 'Customer is upset.', reason: 'No matching task.' },
      { type: 'client_approval', reason: 'Sensitive public wording.' }
    ])
  })

  it('fails safe on malformed output', () => {
    const parsed = parseSocialInboxAiTriageResponse('not json', new Set())
    expect(parsed).toMatchObject({
      summary: 'No AI triage summary available.',
      sentiment: 'neutral',
      riskLevel: 'medium',
      suggestedPriority: null,
      suggestedTags: [],
      approvalRecommended: false,
      actions: []
    })
  })
})

describe('buildSocialInboxAiTriagePrompt', () => {
  it('includes the selected conversation and candidate task ids for constrained recommendations', () => {
    const prompt = buildSocialInboxAiTriagePrompt({
      conversation: {
        id: 'conversation-1',
        clientName: 'Acme',
        platform: 'facebook',
        channelType: 'comment',
        participantName: 'Sam',
        rating: null,
        priority: null,
        tags: [],
        linkedTaskId: null,
        linkedClientRequestId: null
      },
      messages: [{ direction: 'in', authorName: 'Sam', content: 'This is poor service', occurredAt: '2026-06-30T00:00:00Z', isInternal: false }],
      candidateTasks: [{ id: 'task-1', title: 'Facebook complaint', statusName: 'Open', projectName: 'Retainer' }]
    })

    expect(prompt).toContain('conversation-1')
    expect(prompt).toContain('Acme')
    expect(prompt).toContain('task-1')
    expect(prompt).toContain('Respond with STRICT JSON')
  })
})
