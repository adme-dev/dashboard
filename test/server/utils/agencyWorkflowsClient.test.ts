import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkAgencyWorkflowReadiness,
  startSocialInboxAutomationWorkflow,
  startSocialPublishingWorkflow,
  type StartSocialPublishingWorkflowEvent
} from '../../../server/utils/agencyWorkflows/client'

const oldEnv = { ...process.env }
const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

function eventWithEnv(env: Record<string, unknown>): StartSocialPublishingWorkflowEvent {
  return {
    context: {
      cloudflare: { env }
    }
  }
}

describe('agency workflow client', () => {
  beforeEach(() => {
    process.env = { ...oldEnv }
    delete process.env.AGENCY_WORKFLOWS_ENABLED
    delete process.env.AGENCY_WORKFLOWS_URL
    delete process.env.WORKFLOW_SERVICE_SECRET
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = { ...oldEnv }
  })

  it('starts social publishing through the Cloudflare service binding', async () => {
    const bindingFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      workflow: 'social.post.publish',
      instanceId: 'social-publish-client-1-post-1',
      status: { status: 'queued' }
    }), { status: 202, headers: { 'content-type': 'application/json' } }))

    const result = await startSocialPublishingWorkflow(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }), {
      postId: 'post-1',
      clientId: 'client-1',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule',
      requestedBy: 'user-1'
    })

    expect(result).toEqual({
      ok: true,
      enabled: true,
      transport: 'service-binding',
      workflow: 'social.post.publish',
      instanceId: 'social-publish-client-1-post-1',
      status: { status: 'queued' }
    })
    expect(bindingFetch).toHaveBeenCalledOnce()

    const request = bindingFetch.mock.calls[0][0] as Request
    expect(request.url).toBe('https://agency-workflows.internal/workflows/start')
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe('Bearer workflow-secret')
    expect(await request.json()).toEqual({
      workflow: 'social.post.publish',
      payload: {
        kind: 'social.post.publish',
        postId: 'post-1',
        clientId: 'client-1',
        scheduledAt: '2026-07-02T03:00:00.000Z',
        trigger: 'schedule',
        requestedBy: 'user-1'
      }
    })
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      'agency-workflows.social-publishing.start.succeeded',
      expect.objectContaining({ postId: 'post-1', clientId: 'client-1', transport: 'service-binding' })
    )
  })

  it('starts social inbox automation through the Cloudflare service binding', async () => {
    const bindingFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1',
      status: { status: 'queued' }
    }), { status: 202, headers: { 'content-type': 'application/json' } }))

    const result = await startSocialInboxAutomationWorkflow(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }), {
      conversationId: 'conversation-1',
      clientId: 'client-1',
      messageId: 'message-1',
      trigger: 'inbound'
    })

    expect(result).toEqual({
      ok: true,
      enabled: true,
      transport: 'service-binding',
      workflow: 'social.inbox.automation',
      instanceId: 'social-inbox-auto-client-1-conversation-1-message-1',
      status: { status: 'queued' }
    })
    expect(bindingFetch).toHaveBeenCalledOnce()

    const request = bindingFetch.mock.calls[0][0] as Request
    expect(request.url).toBe('https://agency-workflows.internal/workflows/start')
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe('Bearer workflow-secret')
    expect(await request.json()).toEqual({
      workflow: 'social.inbox.automation',
      payload: {
        kind: 'social.inbox.automation',
        conversationId: 'conversation-1',
        clientId: 'client-1',
        messageId: 'message-1',
        trigger: 'inbound'
      }
    })
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      'agency-workflows.social-inbox.automation.start.succeeded',
      expect.objectContaining({ conversationId: 'conversation-1', clientId: 'client-1', transport: 'service-binding' })
    )
  })

  it('stays inert when workflows are not explicitly enabled', async () => {
    const bindingFetch = vi.fn()

    const result = await startSocialPublishingWorkflow(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'false',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }), {
      postId: 'post-1',
      clientId: 'client-1',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule'
    })

    expect(result).toEqual({ ok: false, enabled: false, reason: 'disabled' })
    expect(bindingFetch).not.toHaveBeenCalled()
  })

  it('returns a non-fatal not_configured result without a binding or Worker URL', async () => {
    const result = await startSocialPublishingWorkflow(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret'
    }), {
      postId: 'post-1',
      clientId: 'client-1',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule'
    })

    expect(result).toEqual({ ok: false, enabled: true, reason: 'not_configured' })
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      'agency-workflows.social-publishing.start.failed',
      expect.objectContaining({ postId: 'post-1', clientId: 'client-1', reason: 'not_configured' })
    )
    expect(JSON.stringify(mockConsoleWarn.mock.calls)).not.toContain('workflow-secret')
  })

  it('falls back to an authenticated Worker URL when configured', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      workflow: 'social.post.publish',
      instanceId: 'social-publish-client-1-post-1'
    }), { status: 202, headers: { 'content-type': 'application/json' } }))

    const result = await startSocialPublishingWorkflow(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS_URL: 'https://agency-workflows.example.com'
    }), {
      postId: 'post-1',
      clientId: 'client-1',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule',
      fetchImpl
    })

    expect(result).toMatchObject({ ok: true, enabled: true, transport: 'fetch' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const request = fetchImpl.mock.calls[0][0] as Request
    expect(request.url).toBe('https://agency-workflows.example.com/workflows/start')
    expect(request.headers.get('authorization')).toBe('Bearer workflow-secret')
  })

  it('reports non-2xx Worker responses without throwing', async () => {
    const bindingFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: 'already exists'
    }), { status: 409, headers: { 'content-type': 'application/json' } }))

    const result = await startSocialPublishingWorkflow(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }), {
      postId: 'post-1',
      clientId: 'client-1',
      scheduledAt: '2026-07-02T03:00:00.000Z',
      trigger: 'schedule'
    })

    expect(result).toMatchObject({
      ok: false,
      enabled: true,
      reason: 'bad_response',
      status: 409,
      transport: 'service-binding'
    })
  })

  it('reports readiness as disabled without contacting the Worker', async () => {
    const bindingFetch = vi.fn()

    const result = await checkAgencyWorkflowReadiness(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'false',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }))

    expect(result).toEqual({
      ok: false,
      status: 'disabled',
      enabled: false,
      bindingConfigured: true,
      fallbackUrlConfigured: false,
      serviceSecretConfigured: true
    })
    expect(bindingFetch).not.toHaveBeenCalled()
  })

  it('reports readiness as not_configured when required workflow config is missing', async () => {
    const bindingFetch = vi.fn()

    const result = await checkAgencyWorkflowReadiness(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }))

    expect(result).toEqual({
      ok: false,
      status: 'not_configured',
      enabled: true,
      bindingConfigured: true,
      fallbackUrlConfigured: false,
      serviceSecretConfigured: false
    })
    expect(bindingFetch).not.toHaveBeenCalled()
  })

  it('checks Worker health through the Cloudflare service binding', async () => {
    const bindingFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      worker: 'agency-workflows',
      enabled: true,
      workflows: [
        { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW' },
        { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW' }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await checkAgencyWorkflowReadiness(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }))

    expect(result).toEqual({
      ok: true,
      status: 'ready',
      enabled: true,
      bindingConfigured: true,
      fallbackUrlConfigured: false,
      serviceSecretConfigured: true,
      transport: 'service-binding',
      worker: {
        ok: true,
        worker: 'agency-workflows',
        enabled: true,
        workflows: [
          { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW' },
          { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW' }
        ]
      }
    })
    expect(bindingFetch).toHaveBeenCalledOnce()
    const request = bindingFetch.mock.calls[0][0] as Request
    expect(request.url).toBe('https://agency-workflows.internal/health')
    expect(request.method).toBe('GET')
    expect(request.headers.has('authorization')).toBe(false)
  })

  it('reports degraded readiness when Pages is enabled but the Worker health is disabled', async () => {
    const bindingFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      worker: 'agency-workflows',
      enabled: false,
      workflows: [
        { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW' },
        { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW' }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await checkAgencyWorkflowReadiness(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }))

    expect(result).toMatchObject({
      ok: false,
      status: 'degraded',
      enabled: true,
      transport: 'service-binding',
      worker: { ok: true, enabled: false }
    })
  })

  it('reports degraded readiness when the Worker is missing a required workflow kind', async () => {
    const bindingFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      worker: 'agency-workflows',
      enabled: true,
      workflows: [{ kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await checkAgencyWorkflowReadiness(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }))

    expect(result).toMatchObject({
      ok: false,
      status: 'degraded',
      enabled: true,
      transport: 'service-binding',
      missingWorkflows: ['social.inbox.automation']
    })
  })

  it('falls back to Worker URL health when no service binding is available', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      worker: 'agency-workflows',
      enabled: true,
      workflows: [
        { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW' },
        { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW' }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await checkAgencyWorkflowReadiness(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS_URL: 'https://agency-workflows.example.com'
    }), { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      status: 'ready',
      transport: 'fetch',
      fallbackUrlConfigured: true
    })
    const request = fetchImpl.mock.calls[0][0] as Request
    expect(request.url).toBe('https://agency-workflows.example.com/health')
  })

  it('reports unreachable readiness without leaking the service secret', async () => {
    const bindingFetch = vi.fn(async () => {
      throw new Error('network failed for workflow-secret')
    })

    const result = await checkAgencyWorkflowReadiness(eventWithEnv({
      AGENCY_WORKFLOWS_ENABLED: 'true',
      WORKFLOW_SERVICE_SECRET: 'workflow-secret',
      AGENCY_WORKFLOWS: { fetch: bindingFetch }
    }))

    expect(result).toMatchObject({
      ok: false,
      status: 'unreachable',
      enabled: true,
      transport: 'service-binding'
    })
    expect(JSON.stringify(result)).not.toContain('workflow-secret')
    expect(JSON.stringify(mockConsoleWarn.mock.calls)).not.toContain('workflow-secret')
  })
})
