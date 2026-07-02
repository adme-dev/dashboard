import { describe, expect, it } from 'vitest'

import {
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  buildSocialPublishingWorkflowInstanceId,
  normalizeSocialPublishingWorkflowPayload,
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

  it('builds a deterministic workflow instance id per social post', () => {
    const payload = normalizeSocialPublishingWorkflowPayload({
      postId: 'Post_123',
      clientId: 'Client_456'
    })

    expect(buildSocialPublishingWorkflowInstanceId(payload)).toBe('social-publish-Client_456-Post_123')
  })

  it('parses the stable start-workflow request envelope', () => {
    const body = parseWorkflowRequestBody({
      workflow: SOCIAL_PUBLISHING_WORKFLOW_KIND,
      payload: { postId: 'post-1', clientId: 'client-1' }
    })

    expect(body.workflow).toBe(SOCIAL_PUBLISHING_WORKFLOW_KIND)
    expect(body.payload.postId).toBe('post-1')
  })

  it('keeps workflow starts disabled unless explicitly enabled', () => {
    expect(workflowFeatureEnabled({})).toBe(false)
    expect(workflowFeatureEnabled({ AGENCY_WORKFLOWS_ENABLED: 'false' })).toBe(false)
    expect(workflowFeatureEnabled({ AGENCY_WORKFLOWS_ENABLED: 'true' })).toBe(true)
  })
})
