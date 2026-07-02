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

const { default: handler } = await import('../../../server/api/agency/social/publishing/workflows/readiness.get')
const workflowReadiness = handler as (event: TestEvent) => Promise<unknown>

describe('social publishing workflow readiness endpoint', () => {
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

  it('requires admin role and returns workflow readiness', async () => {
    const event: TestEvent = { context: {} }

    const result = await workflowReadiness(event)

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
})
