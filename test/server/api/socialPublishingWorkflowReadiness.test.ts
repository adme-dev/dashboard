import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockCheckAgencyWorkflowReadiness = vi.fn()
const originalSmokeSecret = process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET
const originalSmokeSecretHash = process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256
const machineSecretHash = '6f5df3d61a2290cbda9a27d584fa7e509c2811da8fd67eab0dc5c39c3789bb7e'

interface TestEvent {
  context: Record<string, unknown>
  headers?: Record<string, string>
}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  checkAgencyWorkflowReadiness: (...args: unknown[]) => mockCheckAgencyWorkflowReadiness(...args)
}))

vi.mock('h3', () => ({
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()]
}))

;(globalThis as { defineEventHandler?: <T>(fn: T) => T }).defineEventHandler = <T>(fn: T) => fn

const { default: publishingHandler } = await import('../../../server/api/agency/social/publishing/workflows/readiness.get')
const { default: agencyHandler } = await import('../../../server/api/agency/workflows/readiness.get')
const publishingWorkflowReadiness = publishingHandler as (event: TestEvent) => Promise<unknown>
const agencyWorkflowReadiness = agencyHandler as (event: TestEvent) => Promise<unknown>

describe('agency workflow readiness endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET
    delete process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256
    mockRequireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mockCheckAgencyWorkflowReadiness.mockResolvedValue({
      ok: true,
      status: 'ready',
      enabled: true,
      bindingConfigured: true,
      fallbackUrlConfigured: false,
      serviceSecretConfigured: true,
      transport: 'service-binding'
    })
  })

  afterEach(() => {
    if (originalSmokeSecret) {
      process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET = originalSmokeSecret
    } else {
      delete process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET
    }
    if (originalSmokeSecretHash) {
      process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256 = originalSmokeSecretHash
    } else {
      delete process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256
    }
  })

  it('requires admin role and returns workflow readiness from the canonical agency endpoint', async () => {
    const event: TestEvent = { context: {} }

    const result = await agencyWorkflowReadiness(event)

    expect(mockRequireRole).toHaveBeenCalledWith(event, ['owner', 'admin'])
    expect(mockCheckAgencyWorkflowReadiness).toHaveBeenCalledWith(event)
    expect(result).toEqual({
      ok: true,
      status: 'ready',
      enabled: true,
      bindingConfigured: true,
      fallbackUrlConfigured: false,
      serviceSecretConfigured: true,
      transport: 'service-binding'
    })
  })

  it('keeps the social publishing readiness route as a compatibility alias', async () => {
    const event: TestEvent = { context: {} }

    const result = await publishingWorkflowReadiness(event)

    expect(mockRequireRole).toHaveBeenCalledWith(event, ['owner', 'admin'])
    expect(mockCheckAgencyWorkflowReadiness).toHaveBeenCalledWith(event)
    expect(result).toMatchObject({ ok: true, status: 'ready' })
  })

  it('accepts the machine smoke shared secret without requiring an admin session', async () => {
    process.env.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET = 'machine-secret'
    const event: TestEvent = {
      context: {},
      headers: { 'x-workflow-smoke-secret': 'machine-secret' }
    }

    const result = await agencyWorkflowReadiness(event)

    expect(mockRequireRole).not.toHaveBeenCalled()
    expect(mockCheckAgencyWorkflowReadiness).toHaveBeenCalledWith(event)
    expect(result).toMatchObject({ ok: true, status: 'ready' })
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

    const result = await agencyWorkflowReadiness(event)

    expect(mockRequireRole).not.toHaveBeenCalled()
    expect(mockCheckAgencyWorkflowReadiness).toHaveBeenCalledWith(event)
    expect(result).toMatchObject({ ok: true, status: 'ready' })
  })

  it('accepts a machine smoke shared secret matching the deployed hash verifier', async () => {
    const event: TestEvent = {
      context: {
        cloudflare: {
          env: { AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256: machineSecretHash }
        }
      },
      headers: { 'x-workflow-smoke-secret': 'machine-secret' }
    }

    const result = await agencyWorkflowReadiness(event)

    expect(mockRequireRole).not.toHaveBeenCalled()
    expect(mockCheckAgencyWorkflowReadiness).toHaveBeenCalledWith(event)
    expect(result).toMatchObject({ ok: true, status: 'ready' })
  })
})
