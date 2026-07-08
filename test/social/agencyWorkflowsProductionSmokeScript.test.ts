import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const smoke = await import('../../scripts/agency-workflows-production-smoke.mjs')
const ciSmokeGate = await import('../../scripts/agency-workflows-ci-smoke-gate.mjs')

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
      { kind: 'social.spend.review', binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW', bindingConfigured: true },
      { kind: 'brief.lifecycle.check', binding: 'BRIEF_LIFECYCLE_CHECK_WORKFLOW', bindingConfigured: true },
      { kind: 'crm.followup.review', binding: 'CRM_FOLLOWUP_REVIEW_WORKFLOW', bindingConfigured: true }
    ]
  }
}

describe('agency workflows production smoke script', () => {
  it('is exposed as an explicit package script and does not hardcode auth tokens', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    const script = readFileSync(resolve(ROOT, 'scripts/agency-workflows-production-smoke.mjs'), 'utf8')

    expect(pkg.scripts['smoke:agency-workflows']).toBe('node scripts/agency-workflows-production-smoke.mjs')
    expect(script).toContain('AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET')
    expect(script).toContain('AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN')
    expect(script).toContain('SOCIAL_SMOKE_AUTH_TOKEN')
    expect(script).toContain('SOCIAL_PUBLISHING_SMOKE_AUTH_TOKEN')
    expect(script).toContain('AGENCY_WORKFLOWS_SMOKE_COOKIE')
    expect(script).not.toMatch(/eyJ[a-zA-Z0-9_%.-]+/)
  })

  it('wires the CI smoke gate through package scripts and GitHub Actions', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8')

    expect(pkg.scripts['smoke:agency-workflows:ci']).toBe('node scripts/agency-workflows-ci-smoke-gate.mjs')
    expect(workflow).toContain('pnpm run smoke:agency-workflows:ci')
    expect(workflow).not.toContain('Skipping authenticated Workflows smoke')
  })

  it('fails fast without explicit smoke auth input', () => {
    expect(() => smoke.resolveSmokeConfig({})).toThrow(/Missing Workflows smoke auth input/)
  })

  it('requires status workflow and instance id to be provided together', () => {
    expect(() => smoke.resolveSmokeConfig({
      AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret',
      AGENCY_WORKFLOWS_SMOKE_STATUS_WORKFLOW: 'social.post.publish'
    })).toThrow(/must be provided together/)
  })

  it('accepts a dedicated machine smoke shared secret before user auth fallbacks', () => {
    expect(smoke.resolveSmokeConfig({
      AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret',
      AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN: 'admin-token',
      AGENCY_WORKFLOWS_SMOKE_READINESS_ATTEMPTS: '3',
      AGENCY_WORKFLOWS_SMOKE_READINESS_RETRY_DELAY_MS: '25'
    })).toMatchObject({
      baseUrl: 'https://agency-dashboard-6cm.pages.dev',
      sharedSecret: 'machine-secret',
      authToken: 'admin-token',
      readinessAttempts: 3,
      readinessRetryDelayMs: 25
    })

    expect(smoke.authHeaders({
      sharedSecret: 'machine-secret',
      authToken: 'admin-token',
      cookie: 'auth_token=admin'
    })).toEqual({
      'accept': 'application/json',
      authorization: 'Bearer machine-secret',
      'x-workflow-smoke-secret': 'machine-secret'
    })
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
      workflows: ['social.post.publish', 'social.inbox.automation', 'social.spend.review', 'brief.lifecycle.check', 'crm.followup.review']
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
          { kind: 'social.spend.review', binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW', bindingConfigured: true },
          { kind: 'brief.lifecycle.check', binding: 'BRIEF_LIFECYCLE_CHECK_WORKFLOW', bindingConfigured: true },
          { kind: 'crm.followup.review', binding: 'CRM_FOLLOWUP_REVIEW_WORKFLOW', bindingConfigured: true }
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
    expect(log).toHaveBeenCalledWith('OK readiness transport=service-binding workflows=social.post.publish,social.inbox.automation,social.spend.review,brief.lifecycle.check,crm.followup.review')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SKIP status lookup'))
  })

  it('runs readiness-only smoke with the machine shared secret without logging it', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(readyPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    const log = vi.fn()

    await smoke.runAgencyWorkflowsProductionSmoke({
      env: {
        AGENCY_WORKFLOWS_SMOKE_BASE_URL: 'https://agency-dashboard-6cm.pages.dev',
        AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret'
      },
      fetchImpl,
      log
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://agency-dashboard-6cm.pages.dev/api/agency/workflows/readiness',
      expect.objectContaining({
        headers: {
          'accept': 'application/json',
          authorization: 'Bearer machine-secret',
          'x-workflow-smoke-secret': 'machine-secret'
        }
      })
    )
    expect(log.mock.calls.flat().join('\n')).not.toContain('machine-secret')
  })

  it('retries readiness while the production alias is still serving stale auth code', async () => {
    const staleAuthPayload = {
      error: true,
      statusCode: 401,
      statusMessage: 'Authentication required',
      message: 'Authentication required'
    }
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(staleAuthPayload), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(readyPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }))
    const log = vi.fn()
    const waitImpl = vi.fn(async () => undefined)

    await smoke.runAgencyWorkflowsProductionSmoke({
      env: {
        AGENCY_WORKFLOWS_SMOKE_BASE_URL: 'https://agency-dashboard-6cm.pages.dev',
        AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret',
        AGENCY_WORKFLOWS_SMOKE_READINESS_ATTEMPTS: '2',
        AGENCY_WORKFLOWS_SMOKE_READINESS_RETRY_DELAY_MS: '10'
      },
      fetchImpl,
      log,
      waitImpl
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(waitImpl).toHaveBeenCalledWith(10)
    expect(log).toHaveBeenCalledWith('WAIT readiness attempt 1/2 returned HTTP 401; retrying in 10ms.')
    expect(log.mock.calls.flat().join('\n')).not.toContain('machine-secret')
    expect(log).toHaveBeenCalledWith('OK readiness transport=service-binding workflows=social.post.publish,social.inbox.automation,social.spend.review,brief.lifecycle.check,crm.followup.review')
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

  it('lets CI skip authenticated smoke only while Workflow cutover flags stay dormant', () => {
    expect(ciSmokeGate.evaluateCiSmokeGate({
      env: {},
      pagesVars: {
        AGENCY_WORKFLOWS_ENABLED: 'true',
        AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY: 'false'
      }
    })).toMatchObject({
      ok: true,
      status: 'skipped',
      authConfigured: false,
      activeCutoverFlags: []
    })
  })

  it('blocks CI when a Workflow primary/write cutover flag is enabled without smoke auth', () => {
    expect(ciSmokeGate.evaluateCiSmokeGate({
      env: {},
      pagesVars: {
        AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: 'true',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'true',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY: 'false'
      }
    })).toMatchObject({
      ok: false,
      status: 'blocked',
      authConfigured: false,
      activeCutoverFlags: [
        'AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED',
        'AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY'
      ]
    })
  })

  it('can require CI smoke auth even before a cutover flag is enabled', () => {
    expect(ciSmokeGate.evaluateCiSmokeGate({
      env: { AGENCY_WORKFLOWS_CI_REQUIRE_SMOKE_AUTH: 'true' },
      pagesVars: {
        AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY: 'false'
      }
    })).toMatchObject({
      ok: false,
      status: 'blocked',
      authConfigured: false,
      activeCutoverFlags: []
    })
  })

  it('runs the existing production smoke when CI shared-secret auth is configured', async () => {
    const smokeRunner = vi.fn(async () => undefined)
    const log = vi.fn()

    await ciSmokeGate.runCiSmokeGate({
      env: { AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret' },
      pagesVars: {
        AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY: 'false'
      },
      smokeRunner,
      log
    })

    expect(smokeRunner).toHaveBeenCalledWith({
      env: { AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret' },
      log
    })
    expect(log.mock.calls.flat().join('\n')).toContain('AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET')
    expect(log.mock.calls.flat().join('\n')).not.toContain('machine-secret')
  })

  it('warns instead of blocking when optional CI smoke fails while cutovers are dormant', async () => {
    const smokeRunner = vi.fn(async () => {
      throw new Error('Readiness returned HTTP 401')
    })
    const log = vi.fn()

    await expect(ciSmokeGate.runCiSmokeGate({
      env: { AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret' },
      pagesVars: {
        AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY: 'false'
      },
      smokeRunner,
      log
    })).resolves.toMatchObject({
      ok: true,
      status: 'warn'
    })

    expect(log.mock.calls.flat().join('\n')).toContain('WARN Authenticated Workflows smoke failed')
  })

  it('still blocks when required CI smoke fails for an active cutover', async () => {
    const smokeRunner = vi.fn(async () => {
      throw new Error('Readiness returned HTTP 401')
    })

    await expect(ciSmokeGate.runCiSmokeGate({
      env: { AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret' },
      pagesVars: {
        AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: 'true',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: 'false',
        AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY: 'false'
      },
      smokeRunner,
      log: vi.fn()
    })).rejects.toThrow(/Readiness returned HTTP 401/)
  })
})
