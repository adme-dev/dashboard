import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
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
})
