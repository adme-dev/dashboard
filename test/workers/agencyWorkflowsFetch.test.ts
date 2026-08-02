import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    env: unknown

    constructor(_ctx: unknown, env: unknown) {
      this.env = env
    }
  }
}))

vi.mock('cloudflare:workflows', () => ({
  NonRetryableError: class extends Error {}
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
    SOCIAL_SPEND_REVIEW_WORKFLOW: workflowBinding(),
    BRIEF_LIFECYCLE_CHECK_WORKFLOW: workflowBinding(),
    CRM_FOLLOWUP_REVIEW_WORKFLOW: workflowBinding(),
    SITE_INTELLIGENCE_CRAWL_WORKFLOW: workflowBinding(),
    ...overrides
  }
}

describe('agency workflows worker fetch handler', () => {
  it('protects health capability checks with the service credential', async () => {
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/health'),
      workflowEnv() as never
    )

    expect(response.status).toBe(401)
  })

  it('advertises the publishing and inbox automation workflows in health', async () => {
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/health', {
        headers: { authorization: 'Bearer workflow-secret' }
      }),
      workflowEnv() as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      worker: 'agency-workflows',
      enabled: true,
      workflows: [
        { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW', bindingConfigured: true },
        { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW', bindingConfigured: true },
        { kind: 'social.spend.review', binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW', bindingConfigured: true },
        { kind: 'brief.lifecycle.check', binding: 'BRIEF_LIFECYCLE_CHECK_WORKFLOW', bindingConfigured: true },
        { kind: 'crm.followup.review', binding: 'CRM_FOLLOWUP_REVIEW_WORKFLOW', bindingConfigured: true },
        { kind: 'site.intelligence.crawl', binding: 'SITE_INTELLIGENCE_CRAWL_WORKFLOW', bindingConfigured: true }
      ]
    })
  })

  it('reports degraded health when a workflow binding is missing', async () => {
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/health', {
        headers: { authorization: 'Bearer workflow-secret' }
      }),
      workflowEnv({ SOCIAL_INBOX_AUTOMATION_WORKFLOW: undefined }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      worker: 'agency-workflows',
      enabled: true,
      workflows: [
        { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW', bindingConfigured: true },
        { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW', bindingConfigured: false },
        { kind: 'social.spend.review', binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW', bindingConfigured: true },
        { kind: 'brief.lifecycle.check', binding: 'BRIEF_LIFECYCLE_CHECK_WORKFLOW', bindingConfigured: true },
        { kind: 'crm.followup.review', binding: 'CRM_FOLLOWUP_REVIEW_WORKFLOW', bindingConfigured: true },
        { kind: 'site.intelligence.crawl', binding: 'SITE_INTELLIGENCE_CRAWL_WORKFLOW', bindingConfigured: true }
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

  it('starts social spend review on the spend review binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/start', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer workflow-secret',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workflow: 'social.spend.review',
          payload: {
            period: '2026-07',
            scope: 'platform',
            platform: 'google',
            trigger: 'cron'
          }
        })
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'social.spend.review',
      instanceId: 'social-spend-review-2026-07-platform-google_ads',
      status: { status: 'queued' }
    })
    expect(env.SOCIAL_SPEND_REVIEW_WORKFLOW.create).toHaveBeenCalledWith({
      id: 'social-spend-review-2026-07-platform-google_ads',
      params: {
        kind: 'social.spend.review',
        period: '2026-07',
        scope: 'platform',
        platform: 'google_ads',
        trigger: 'cron'
      }
    })
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.create).not.toHaveBeenCalled()
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.create).not.toHaveBeenCalled()
  })

  it('starts brief lifecycle checks on the brief lifecycle binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/start', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer workflow-secret',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workflow: 'brief.lifecycle.check',
          payload: {
            briefId: 'brief-1',
            clientId: 'client-1',
            trigger: 'submit'
          }
        })
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'brief.lifecycle.check',
      instanceId: 'brief-lifecycle-brief-1-submit',
      status: { status: 'queued' }
    })
    expect(env.BRIEF_LIFECYCLE_CHECK_WORKFLOW.create).toHaveBeenCalledWith({
      id: 'brief-lifecycle-brief-1-submit',
      params: {
        kind: 'brief.lifecycle.check',
        briefId: 'brief-1',
        clientId: 'client-1',
        trigger: 'submit'
      }
    })
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.create).not.toHaveBeenCalled()
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.create).not.toHaveBeenCalled()
    expect(env.SOCIAL_SPEND_REVIEW_WORKFLOW.create).not.toHaveBeenCalled()
  })

  it('starts crm follow-up reviews on the crm follow-up review binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/start', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer workflow-secret',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workflow: 'crm.followup.review',
          payload: {
            bucket: '2026-07-04T05:42:00.000Z',
            scope: 'client',
            clientId: 'client-1',
            trigger: 'cron'
          }
        })
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'crm.followup.review',
      instanceId: 'crm-followup-review-2026-07-04T05-client-client-1',
      status: { status: 'queued' }
    })
    expect(env.CRM_FOLLOWUP_REVIEW_WORKFLOW.create).toHaveBeenCalledWith({
      id: 'crm-followup-review-2026-07-04T05-client-client-1',
      params: {
        kind: 'crm.followup.review',
        bucket: '2026-07-04T05',
        scope: 'client',
        clientId: 'client-1',
        trigger: 'cron'
      }
    })
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.create).not.toHaveBeenCalled()
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.create).not.toHaveBeenCalled()
    expect(env.SOCIAL_SPEND_REVIEW_WORKFLOW.create).not.toHaveBeenCalled()
    expect(env.BRIEF_LIFECYCLE_CHECK_WORKFLOW.create).not.toHaveBeenCalled()
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
      instanceId: 'social-publish-client-1-post-1-2026-07-02T03-00-00-000Z',
      existing: true,
      status: { status: 'running' }
    })
    expect(publishingWorkflow.get).toHaveBeenCalledWith('social-publish-client-1-post-1-2026-07-02T03-00-00-000Z')
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

  it('reads social spend review instance status from the spend review binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/status?workflow=social.spend.review&instanceId=spend-instance-1', {
        headers: { authorization: 'Bearer workflow-secret' }
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'social.spend.review',
      instanceId: 'spend-instance-1',
      status: { status: 'running' }
    })
    expect(env.SOCIAL_SPEND_REVIEW_WORKFLOW.get).toHaveBeenCalledWith('spend-instance-1')
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.get).not.toHaveBeenCalled()
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.get).not.toHaveBeenCalled()
  })

  it('reads brief lifecycle check instance status from the brief lifecycle binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/status?workflow=brief.lifecycle.check&instanceId=brief-lifecycle-brief-1-submit', {
        headers: { authorization: 'Bearer workflow-secret' }
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'brief.lifecycle.check',
      instanceId: 'brief-lifecycle-brief-1-submit',
      status: { status: 'running' }
    })
    expect(env.BRIEF_LIFECYCLE_CHECK_WORKFLOW.get).toHaveBeenCalledWith('brief-lifecycle-brief-1-submit')
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.get).not.toHaveBeenCalled()
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.get).not.toHaveBeenCalled()
    expect(env.SOCIAL_SPEND_REVIEW_WORKFLOW.get).not.toHaveBeenCalled()
  })

  it('reads crm follow-up review instance status from the crm follow-up review binding', async () => {
    const env = workflowEnv()
    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/status?workflow=crm.followup.review&instanceId=crm-followup-review-2026-07-04T05-all-all', {
        headers: { authorization: 'Bearer workflow-secret' }
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: 'crm.followup.review',
      instanceId: 'crm-followup-review-2026-07-04T05-all-all',
      status: { status: 'running' }
    })
    expect(env.CRM_FOLLOWUP_REVIEW_WORKFLOW.get).toHaveBeenCalledWith('crm-followup-review-2026-07-04T05-all-all')
    expect(env.SOCIAL_PUBLISHING_WORKFLOW.get).not.toHaveBeenCalled()
    expect(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.get).not.toHaveBeenCalled()
    expect(env.SOCIAL_SPEND_REVIEW_WORKFLOW.get).not.toHaveBeenCalled()
    expect(env.BRIEF_LIFECYCLE_CHECK_WORKFLOW.get).not.toHaveBeenCalled()
  })
})
