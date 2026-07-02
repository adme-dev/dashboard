import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const smoke = await import('../../scripts/agency-workflows-production-smoke.mjs')

const readyPayload = {
  ok: true,
  status: 'ready',
  enabled: true,
  bindingConfigured: true,
  fallbackUrlConfigured: false,
  serviceSecretConfigured: true,
  transport: 'service-binding',
  worker: {
    ok: true,
    enabled: true,
    workflows: [
      { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW', bindingConfigured: true },
      { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW', bindingConfigured: true },
      { kind: 'social.spend.review', binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW', bindingConfigured: true }
    ]
  }
}

describe('agency workflows production smoke script', () => {
  it('is exposed as an explicit package script and does not hardcode auth tokens', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    const script = readFileSync(resolve(ROOT, 'scripts/agency-workflows-production-smoke.mjs'), 'utf8')

    expect(pkg.scripts['smoke:agency-workflows']).toBe('node scripts/agency-workflows-production-smoke.mjs')
    expect(script).toContain('AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN')
    expect(script).toContain('SOCIAL_SMOKE_AUTH_TOKEN')
    expect(script).toContain('SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN')
    expect(script).toContain('AGENCY_WORKFLOWS_SMOKE_COOKIE')
    expect(script).not.toMatch(/eyJ[a-zA-Z0-9_%.-]+/)
  })

  it('fails fast without explicit admin auth input', () => {
    expect(() => smoke.resolveSmokeConfig({})).toThrow(/Missing admin auth input/)
  })

  it('requires status workflow and instance id to be provided together', () => {
    expect(() => smoke.resolveSmokeConfig({
      AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN: 'token',
      AGENCY_WORKFLOWS_SMOKE_STATUS_WORKFLOW: 'social.post.publish'
    })).toThrow(/must be provided together/)
  })

  it('accepts the social smoke auth aliases for operational reuse', () => {
    expect(smoke.resolveSmokeConfig({
      SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN: 'token'
    })).toMatchObject({
      baseUrl: 'https://agency-dashboard-6cm.pages.dev',
      authToken: 'token'
    })
  })

  it('validates production-ready readiness with all required workflow bindings', () => {
    expect(smoke.validateReadinessPayload(readyPayload)).toEqual({
      transport: 'service-binding',
      workflows: ['social.post.publish', 'social.inbox.automation', 'social.spend.review']
    })
  })

  it('rejects degraded readiness and missing workflow bindings', () => {
    expect(() => smoke.validateReadinessPayload({
      ...readyPayload,
      ok: false,
      status: 'degraded',
      worker: {
        ...readyPayload.worker,
        workflows: [
          { kind: 'social.post.publish', binding: 'SOCIAL_PUBLISHING_WORKFLOW', bindingConfigured: true },
          { kind: 'social.inbox.automation', binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW', bindingConfigured: false },
          { kind: 'social.spend.review', binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW', bindingConfigured: true }
        ]
      }
    })).toThrow(/Missing workflow bindings: social\.inbox\.automation/)
  })

  it('runs readiness-only smoke with bearer auth without logging the token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(readyPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    const log = vi.fn()

    await smoke.runAgencyWorkflowsProductionSmoke({
      env: {
        AGENCY_WORKFLOWS_SMOKE_BASE_URL: 'https://agency-dashboard-6cm.pages.dev',
        AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN: 'secret-token'
      },
      fetchImpl,
      log
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agency-dashboard-6cm.pages.dev/api/agency/workflows/readiness',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer secret-token'
        })
      })
    )
    expect(log.mock.calls.flat().join('\n')).not.toContain('secret-token')
    expect(log).toHaveBeenCalledWith('OK readiness transport=service-binding workflows=social.post.publish,social.inbox.automation,social.spend.review')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SKIP status lookup'))
  })

  it('runs optional status lookup for a live workflow instance', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/status?')) {
        return new Response(JSON.stringify({
          ok: true,
          enabled: true,
          transport: 'service-binding',
          workflow: 'social.post.publish',
          instanceId: 'social-publish-client-1-post-1',
          status: { status: 'running' }
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify(readyPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    })
    const log = vi.fn()

    await smoke.runAgencyWorkflowsProductionSmoke({
      env: {
        AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN: 'secret-token',
        AGENCY_WORKFLOWS_SMOKE_STATUS_WORKFLOW: 'social.post.publish',
        AGENCY_WORKFLOWS_SMOKE_STATUS_INSTANCE_ID: 'social-publish-client-1-post-1'
      },
      fetchImpl,
      log
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[1][0])).toBe('https://agency-dashboard-6cm.pages.dev/api/agency/workflows/status?workflow=social.post.publish&instanceId=social-publish-client-1-post-1')
    expect(log).toHaveBeenCalledWith('OK status workflow=social.post.publish instanceId=social-publish-client-1-post-1 state=running')
  })
})
