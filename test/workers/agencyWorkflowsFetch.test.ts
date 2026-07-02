import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    env: unknown

    constructor(_ctx: unknown, env: unknown) {
      this.env = env
    }
  }
}))

const {
  handleAgencyWorkflowsFetch
} = await import('../../workers/agency-workflows/src/index')

function workflowBinding() {
  return {
    create: vi.fn(async (options: { id?: string, params?: unknown }) => ({
      id: options.id ?? 'generated-id',
      status: async () => ({ status: 'queued' })
    })),
    get: vi.fn(async (id: string) => ({
      id,
      status: async () => ({ status: 'running' })
    }))
  }
}

function workflowEnv(overrides: Record<string, unknown> = {}) {
  return {
    APP_BASE_URL: 'https://agency.example.com',
    AGENCY_WORKFLOWS_ENABLED: 'true',
    WORKFLOW_SERVICE_SECRET: 'workflow-secret',
    WORKFLOW_CALLBACK_SECRET: 'callback-secret',
    SOCIAL_PUBLISHING_WORKFLOW: workflowBinding(),
    SOCIAL_INBOX_AUTOMATION_WORKFLOW: workflowBinding(),
    ...overrides
  }
}

describe('agency workflows worker fetch handler', () => {
  it('advertises the publishing and inbox automation workflows in health', async () => {
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/health'),
      workflowEnv() as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      worker: 'agency-workflows',
      enabled: true,
      workflows: [
        { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW', bindingConfigured: true },
        { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW', bindingConfigured: true }
      ]
    })
  })

  it('reports degraded health when a workflow binding is missing', async () => {
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/health'),
      workflowEnv({ SOCIAL_INBOX_AUTOMATION_WORKFLOW: undefined }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      worker: 'agency-workflows',
      enabled: true,
      workflows: [
        { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW', bindingConfigured: true },
        { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW', bindingConfigured: false }
      ]
    })
  })

  it('starts social inbox automation on the inbox automation binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/start', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer workflow-secret',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workflow: 'social.inbox.automation',
          payload: {
            conversationId: 'conversation-1',
            clientId: 'client-1',
            messageId: 'message-1',
            trigger: 'inbound'
          }
        })
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1',
      status: { status: 'queued' }
    })
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.create).toHaveBeenCalledWith({
      id: 'social-inbox-auto-client-1-conversation-1-message-1',
      params: {
        kind: 'social.inbox.automation',
        conversationId: 'conversation-1',
        clientId: 'client-1',
        messageId: 'message-1',
        trigger: 'inbound'
      }
    })
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.create).not.toHaveBeenCalled()
  })

  it('treats duplicate deterministic social publishing workflow starts as idempotent success', async () => {
    const publishingWorkflow = workflowBinding()
    publishingWorkflow.create.mockRejectedValueOnce(new Error('Workflow instance already exists'))
    const env = workflowEnv({ SOCIAL_PUBLISHING_WORKFLOW: publishingWorkflow })

    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/start', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer workflow-secret',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workflow: 'social.post.publish',
          payload: {
            postId: 'post-1',
            clientId: 'client-1',
            scheduledAt: '2026-07-02T03:00:00.000Z',
            trigger: 'cron'
          }
        })
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'social.post.publish',
      instanceId: 'social-publish-client-1-post-1',
      existing: true,
      status: { status: 'running' }
    })
    expect(publishingWorkflow.get).toHaveBeenCalledWith('social-publish-client-1-post-1')
  })

  it('reads social inbox automation instance status from the inbox binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/status?workflow=social.inbox.automation&instanceId=instance-1', {
        headers: { authorization: 'Bearer workflow-secret' }
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'social.inbox.automation',
      instanceId: 'instance-1',
      status: { status: 'running' }
    })
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.get).toHaveBeenCalledWith('instance-1')
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.get).not.toHaveBeenCalled()
  })
})
