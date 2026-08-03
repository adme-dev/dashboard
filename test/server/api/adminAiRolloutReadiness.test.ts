import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '20000000-0000-4000-8000-000000000001'
const { createCompanyRolloutReadinessGetHandler } = await import(
  '~~/server/api/admin/ai/governance/rollout.get'
)

describe('GET /api/admin/ai/governance/rollout', () => {
  const requirePermission = vi.fn()
  const setResponseHeader = vi.fn()
  const getReadiness = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    getReadiness.mockResolvedValue({
      readyForPilot: true,
      readyForEnforcement: true,
      activeEmployeeCount: 1,
      coveredEmployeeCount: 1,
      uncoveredEmployees: [],
      departmentCoverage: [],
      blockers: []
    })
  })

  function handler() {
    return createCompanyRolloutReadinessGetHandler({ requirePermission, setResponseHeader, getReadiness })
  }

  it('rejects unauthenticated requests before inspecting readiness', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('Unauthenticated'), { statusCode: 401 }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(getReadiness).not.toHaveBeenCalled()
  })

  it('rejects non-admin requests before inspecting readiness', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(getReadiness).not.toHaveBeenCalled()
  })

  it('returns uncached privacy-safe readiness to administrators', async () => {
    const event = { context: {} } as never
    const result = await handler()(event)
    const serialized = JSON.stringify(result).toLowerCase()

    expect(requirePermission).toHaveBeenCalledWith(event, 'ADMIN')
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
    expect(getReadiness).toHaveBeenCalledOnce()
    for (const forbidden of ['email', 'prompt', 'memory', 'message', 'token', 'credential', 'vendor', 'client']) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
