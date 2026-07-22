import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartmentPackReadinessError } from '~~/server/utils/ai/governance/departmentPackReadiness'

const ACTOR_ID = '20000000-0000-4000-8000-000000000001'
const { createDepartmentPackReadinessGetHandler } = await import(
  '~~/server/api/admin/ai/governance/readiness.get'
)

describe('GET /api/admin/ai/governance/readiness', () => {
  const requirePermission = vi.fn()
  const setResponseHeader = vi.fn()
  const getReadiness = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    getReadiness.mockResolvedValue({
      summary: { total: 12, readyForOwnerConfirmation: 1, blocked: 11, missingDepartments: 7 },
      items: [],
      unmappedDepartments: []
    })
  })

  function handler() {
    return createDepartmentPackReadinessGetHandler({ requirePermission, setResponseHeader, getReadiness })
  }

  it('requires company governance permission and returns uncached readiness', async () => {
    const event = { context: {} } as never
    const result = await handler()(event)

    expect(requirePermission).toHaveBeenCalledWith(event, 'ADMIN')
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
    expect(getReadiness).toHaveBeenCalledOnce()
    expect(result.summary).toMatchObject({ total: 12, blocked: 11 })
  })

  it('does not inspect organizational mappings when permission is denied', async () => {
    requirePermission.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(getReadiness).not.toHaveBeenCalled()
  })

  it('redacts internal readiness failures behind a stable response contract', async () => {
    getReadiness.mockRejectedValue(new DepartmentPackReadinessError(
      'blueprint_integrity_error',
      500,
      'internal blueprint detail'
    ))

    await expect(handler()({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'AI department readiness is unavailable',
      data: { code: 'readiness_unavailable' }
    })
  })
})
