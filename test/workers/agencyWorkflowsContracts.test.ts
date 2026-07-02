import { describe, expect, it } from 'vitest'

import {
  SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
  buildSocialInboxAutomationWorkflowInstanceId,
  buildSocialPublishingWorkflowInstanceId,
  buildSocialSpendReviewWorkflowInstanceId,
  normalizeSocialInboxAutomationWorkflowPayload,
  normalizeSocialPublishingWorkflowPayload,
  normalizeSocialSpendReviewWorkflowPayload,
  parseWorkflowRequestBody,
  workflowFeatureEnabled
} from '../../workers/agency-workflows/src/contracts'

describe('agency workflow contracts', () => {
  it('normalizes a social publishing workflow payload', () => {
    const payload = normalizeSocialPublishingWorkflowPayload({
      postId: ' post-123 ',
      clientId: ' client-456 ',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule',
      requestedBy: 'user-1'
    })

    expect(payload).toEqual({
      kind: SOCIAL_PUBLISHING_WORKFLOW_KIND,
      postId: 'post-123',
      clientId: 'client-456',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule',
      requestedBy: 'user-1'
    })
  })

  it('rejects missing identifiers and malformed scheduled timestamps', () => {
    expect(() => normalizeSocialPublishingWorkflowPayload({ clientId: 'client-1' }))
      .toThrow('postId required')
    expect(() => normalizeSocialPublishingWorkflowPayload({ postId: 'post-1' }))
      .toThrow('clientId required')
    expect(() => normalizeSocialPublishingWorkflowPayload({
      postId: 'post-1',
      clientId: 'client-1',
      scheduledAt: 'soon'
    })).toThrow('scheduledAt must be a valid ISO datetime')
  })

  it('builds a deterministic workflow instance id per social post schedule attempt', () => {
    const payload = normalizeSocialPublishingWorkflowPayload({
      postId: 'Post_123',
      clientId: 'Client_456',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule'
    })

    expect(buildSocialPublishingWorkflowInstanceId(payload)).toBe('social-publish-Client_456-Post_123-2026-07-02T03-00-00-000Z')
  })

  it('keeps manual social publishing workflow ids stable per post', () => {
    const payload = normalizeSocialPublishingWorkflowPayload({
      postId: 'Post_123',
      clientId: 'Client_456',
      trigger: 'manual'
    })

    expect(buildSocialPublishingWorkflowInstanceId(payload)).toBe('social-publish-Client_456-Post_123')
  })

  it('normalizes a social inbox automation workflow payload', () => {
    const payload = normalizeSocialInboxAutomationWorkflowPayload({
      conversationId: ' conversation-123 ',
      clientId: ' client-456 ',
      messageId: ' message-789 ',
      trigger: 'inbound',
      requestedBy: 'automation'
    })

    expect(payload).toEqual({
      kind: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
      conversationId: 'conversation-123',
      clientId: 'client-456',
      messageId: 'message-789',
      trigger: 'inbound',
      requestedBy: 'automation'
    })
  })

  it('rejects malformed social inbox automation payloads', () => {
    expect(() => normalizeSocialInboxAutomationWorkflowPayload({ clientId: 'client-1' }))
      .toThrow('conversationId required')
    expect(() => normalizeSocialInboxAutomationWorkflowPayload({ conversationId: 'conversation-1' }))
      .toThrow('clientId required')
    expect(() => normalizeSocialInboxAutomationWorkflowPayload({
      conversationId: 'conversation-1',
      clientId: 'client-1',
      trigger: 'publish'
    })).toThrow('Unsupported trigger: publish')
  })

  it('builds a Cloudflare-compliant deterministic workflow instance id for inbox automation', () => {
    const payload = normalizeSocialInboxAutomationWorkflowPayload({
      conversationId: 'Conversation With Spaces',
      clientId: 'Client/456',
      messageId: 'Message#789',
      trigger: 'inbound'
    })
    const instanceId = buildSocialInboxAutomationWorkflowInstanceId(payload)

    expect(instanceId).toBe('social-inbox-auto-Client-456-Conversation-With-Spaces-Message-789')
    expect(instanceId.length).toBeLessThanOrEqual(100)
  })

  it('normalizes a social spend review workflow payload', () => {
    const payload = normalizeSocialSpendReviewWorkflowPayload({
      period: '2026-07',
      trigger: 'manual',
      scope: 'platform',
      platform: 'google',
      requestedBy: 'user-1'
    })

    expect(payload).toEqual({
      kind: SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
      period: '2026-07',
      trigger: 'manual',
      scope: 'platform',
      platform: 'google_ads',
      requestedBy: 'user-1'
    })
  })

  it('rejects malformed social spend review workflow payloads', () => {
    expect(() => normalizeSocialSpendReviewWorkflowPayload({ trigger: 'cron', scope: 'all' }))
      .toThrow('period required')
    expect(() => normalizeSocialSpendReviewWorkflowPayload({ period: '2026-13', trigger: 'cron', scope: 'all' }))
      .toThrow('period must be YYYY-MM')
    expect(() => normalizeSocialSpendReviewWorkflowPayload({ period: '2026-07', trigger: 'cron', scope: 'client' }))
      .toThrow('clientId required for client scope')
    expect(() => normalizeSocialSpendReviewWorkflowPayload({ period: '2026-07', trigger: 'cron', scope: 'platform' }))
      .toThrow('platform required for platform scope')
  })

  it('builds a deterministic workflow instance id for spend review automation', () => {
    const payload = normalizeSocialSpendReviewWorkflowPayload({
      period: '2026-07',
      trigger: 'cron',
      scope: 'client',
      clientId: 'Client/456'
    })

    expect(buildSocialSpendReviewWorkflowInstanceId(payload)).toBe('social-spend-review-2026-07-client-Client-456')
  })

  it('parses the stable start-workflow request envelope', () => {
    const body = parseWorkflowRequestBody({
      workflow: SOCIAL_PUBLISHING_WORKFLOW_KIND,
      payload: { postId: 'post-1', clientId: 'client-1' }
    })

    expect(body.workflow).toBe(SOCIAL_PUBLISHING_WORKFLOW_KIND)
    expect(body.payload.postId).toBe('post-1')
  })

  it('parses the social inbox automation workflow request envelope', () => {
    const body = parseWorkflowRequestBody({
      workflow: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
      payload: { conversationId: 'conversation-1', clientId: 'client-1', messageId: 'message-1', trigger: 'inbound' }
    })

    expect(body.workflow).toBe(SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND)
    expect(body.payload.conversationId).toBe('conversation-1')
    expect(body.payload.messageId).toBe('message-1')
  })

  it('parses the social spend review workflow request envelope', () => {
    const body = parseWorkflowRequestBody({
      workflow: SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
      payload: { period: '2026-07', scope: 'all', trigger: 'cron' }
    })

    expect(body.workflow).toBe(SOCIAL_SPEND_REVIEW_WORKFLOW_KIND)
    expect(body.payload.period).toBe('2026-07')
    expect(body.payload.scope).toBe('all')
  })

  it('keeps workflow starts disabled unless explicitly enabled', () => {
    expect(workflowFeatureEnabled({})).toBe(false)
    expect(workflowFeatureEnabled({ AGENCY_WORKFLOWS_ENABLED: 'false' })).toBe(false)
    expect(workflowFeatureEnabled({ AGENCY_WORKFLOWS_ENABLED: 'true' })).toBe(true)
  })
})
