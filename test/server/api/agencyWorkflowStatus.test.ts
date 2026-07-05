import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockGetAgencyWorkflowStatus = vi.fn()
const originalSmokeSecret = process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET
let mockQuery: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  getAgencyWorkflowStatus: (...args: unknown[]) => mockGetAgencyWorkflowStatus(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()],
  getQuery: () => mockQuery,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

interface TestEvent {
  context: Record<string, unknown>
  headers?: Record<string, string>
}

const { default: handler } = await import('../../../server/api/agency/workflows/status.get')
const workflowStatus = handler as (event: TestEvent) => Promise<unknown>

describe('agency workflow status endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET
    mockQuery = {
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1'
    }
    mockRequireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mockGetAgencyWorkflowStatus.mockResolvedValue({
      ok: true,
      enabled: true,
      transport: 'service-binding',
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1',
      status: { status: 'running' }
    })
  })

  afterEach(() => {
    if (originalSmokeSecret) {
      process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET = originalSmokeSecret
    } else {
      delete process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET
    }
  })

  it('requires admin role and proxies a workflow instance status lookup', async () => {
    const event: TestEvent = { context: {} }

    const result = await workflowStatus(event)

    expect(mockRequireRole).toHaveBeenCalledWith(event, ['owner', 'admin'])
    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(event, {
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1'
    })
    expect(result).toEqual({
      ok: true,
      enabled: true,
      transport: 'service-binding',
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1',
      status: { status: 'running' }
    })
  })

  it('accepts the machine smoke shared secret without requiring an admin session', async () => {
    process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET = 'machine-secret'
    const event: TestEvent = {
      context: {},
      headers: { 'x-workflow-smoke-secret': 'machine-secret' }
    }

    const result = await workflowStatus(event)

    expect(mockRequireRole).not.toHaveBeenCalled()
    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(event, {
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1'
    })
    expect(result).toMatchObject({
      ok: true,
      workflow: 'social.inbox.automation'
    })
  })

  it('reads the machine smoke shared secret from Cloudflare Pages bindings', async () => {
    const event: TestEvent = {
      context: {
        cloudflare: {
          env: { AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'pages-secret' }
        }
      },
      headers: { 'x-workflow-smoke-secret': 'pages-secret' }
    }

    const result = await workflowStatus(event)

    expect(mockRequireRole).not.toHaveBeenCalled()
    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(event, {
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1'
    })
    expect(result).toMatchObject({
      ok: true,
      workflow: 'social.inbox.automation'
    })
  })

  it('derives a scheduled publishing workflow instance id from identity query fields', async () => {
    mockQuery = {
      workflow: 'social.post.publish',
      clientId: 'client 1',
      postId: 'post 1',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'cron'
    }
    mockGetAgencyWorkflowStatus.mockResolvedValue({
      ok: true,
      enabled: true,
      transport: 'service-binding',
      workflow: 'social.post.publish',
      instanceId: 'social-publish-client-1-post-1-2026-07-02T03-00-00-000Z',
      status: { status: 'running' }
    })

    await workflowStatus({ context: {} })

    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(expect.anything(), {
      workflow: 'social.post.publish',
      instanceId: 'social-publish-client-1-post-1-2026-07-02T03-00-00-000Z'
    })
  })

  it('derives a social inbox automation workflow instance id from identity query fields', async () => {
    mockQuery = {
      workflow: 'social.inbox.automation',
      clientId: 'client 1',
      conversationId: 'conversation 1',
      messageId: 'message 1'
    }

    await workflowStatus({ context: {} })

    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(expect.anything(), {
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1'
    })
  })

  it('derives a social spend review workflow instance id from identity query fields', async () => {
    mockQuery = {
      workflow: 'social.spend.review',
      period: '2026-07',
      scope: 'platform',
      platform: 'google'
    }

    await workflowStatus({ context: {} })

    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(expect.anything(), {
      workflow: 'social.spend.review',
      instanceId: 'social-spend-review-2026-07-platform-google_ads'
    })
  })

  it('derives a brief lifecycle check workflow instance id from identity query fields', async () => {
    mockQuery = {
      workflow: 'brief.lifecycle.check',
      briefId: 'brief 1',
      trigger: 'submit'
    }

    await workflowStatus({ context: {} })

    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(expect.anything(), {
      workflow: 'brief.lifecycle.check',
      instanceId: 'brief-lifecycle-brief-1-submit'
    })
  })

  it('derives a crm follow-up review workflow instance id from identity query fields', async () => {
    mockQuery = {
      workflow: 'crm.followup.review',
      bucket: '2026-07-04T05:42:00.000Z',
      scope: 'client',
      clientId: 'client 1',
      trigger: 'cron'
    }

    await workflowStatus({ context: {} })

    expect(mockGetAgencyWorkflowStatus).toHaveBeenCalledWith(expect.anything(), {
      workflow: 'crm.followup.review',
      instanceId: 'crm-followup-review-2026-07-04T05-client-client-1'
    })
  })

  it('rejects missing workflow status query params before contacting the Worker', async () => {
    mockQuery = { workflow: 'social.post.publish', clientId: 'client-1' }

    await expect(workflowStatus({ context: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'instanceId or workflow identity fields are required'
    })

    expect(mockGetAgencyWorkflowStatus).not.toHaveBeenCalled()
  })

  it('rejects a missing workflow before contacting the Worker', async () => {
    mockQuery = { instanceId: 'instance-1' }

    await expect(workflowStatus({ context: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'workflow is required'
    })

    expect(mockGetAgencyWorkflowStatus).not.toHaveBeenCalled()
  })

  it('rejects unsupported workflow kinds before contacting the Worker', async () => {
    mockQuery = { workflow: 'unknown.workflow', instanceId: 'instance-1' }

    await expect(workflowStatus({ context: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Unsupported workflow kind'
    })

    expect(mockGetAgencyWorkflowStatus).not.toHaveBeenCalled()
  })
})
