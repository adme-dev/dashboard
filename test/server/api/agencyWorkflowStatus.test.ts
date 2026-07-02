import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockGetAgencyWorkflowStatus = vi.fn()
let mockQuery: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  getAgencyWorkflowStatus: (...args: unknown[]) => mockGetAgencyWorkflowStatus(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getQuery: () => mockQuery,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

interface TestEvent {
  context: Record<string, unknown>
}

const { default: handler } = await import('../../../server/api/agency/workflows/status.get')
const workflowStatus = handler as (event: TestEvent) => Promise<unknown>

describe('agency workflow status endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('rejects missing workflow status query params before contacting the Worker', async () => {
    mockQuery = { workflow: 'social.post.publish' }

    await expect(workflowStatus({ context: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'workflow and instanceId are required'
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
