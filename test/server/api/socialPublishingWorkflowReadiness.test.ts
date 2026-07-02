import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireRole = vi.fn()
const mockCheckAgencyWorkflowReadiness = vi.fn()

interface TestEvent {
  context: Record<string, unknown>
}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  checkAgencyWorkflowReadiness: (...args: unknown[]) => mockCheckAgencyWorkflowReadiness(...args)
}))

;(globalThis as { defineEventHandler?: <T>(fn: T) => T }).defineEventHandler = <T>(fn: T) => fn

const { default: publishingHandler } = await import('../../../server/api/agency/social/publishing/workflows/readiness.get')
const { default: agencyHandler } = await import('../../../server/api/agency/workflows/readiness.get')
const publishingWorkflowReadiness = publishingHandler as (event: TestEvent) => Promise<unknown>
const agencyWorkflowReadiness = agencyHandler as (event: TestEvent) => Promise<unknown>

describe('agency workflow readiness endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
