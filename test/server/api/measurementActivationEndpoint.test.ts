import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MeasurementError } from '../../../server/utils/measurement/errors'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const mockRequireActivationAccess = vi.fn()
const mockApprove = vi.fn()
const mockActivate = vi.fn()
const mockRuntime = vi.fn(() => ({ approve: mockApprove, activate: mockActivate }))
let mockBody: Record<string, unknown> = {}

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementActivationAccess: (...args: unknown[]) => mockRequireActivationAccess(...args)
}))

vi.mock('~~/server/utils/measurement/runtime', () => ({
  createMeasurementActivationRuntime: (...args: unknown[]) => mockRuntime(...args)
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => CLIENT_ID,
  readBody: () => mockBody,
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('agency Measurement activation endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {}
    mockRequireActivationAccess.mockResolvedValue({ id: ACTOR_ID, role: 'admin' })
    mockApprove.mockResolvedValue({ approvalKind: 'privacy', configVersion: 3 })
    mockActivate.mockResolvedValue({
      profile: { clientId: CLIENT_ID, enabled: true, environment: 'live', configVersion: 4 },
      activatedDestinations: 1,
      warnings: []
    })
  })

  it('derives approval client and approver identity from route and authentication', async () => {
    mockBody = {
      clientId: '99999999-9999-4999-8999-999999999999',
      expectedConfigVersion: 3,
      approvalKind: 'privacy',
      approvedBy: '99999999-9999-4999-8999-999999999999',
      actor: { type: 'system', id: 'spoofed' },
      reason: 'Consent reviewed'
    }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/approvals.post'
    )).default

    await handler({ context: {} } as never)

    expect(mockRequireActivationAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(mockApprove).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      expectedConfigVersion: 3,
      approvalKind: 'privacy',
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'Consent reviewed'
    })
  })

  it('derives activation state server-side and forwards only the versioned command', async () => {
    mockBody = {
      expectedConfigVersion: 3,
      enabled: true,
      environment: 'live',
      actor: { type: 'system', id: 'spoofed' },
      reason: 'All gates passed'
    }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/activate.post'
    )).default

    await handler({ context: {} } as never)

    expect(mockActivate).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      expectedConfigVersion: 3,
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'All gates passed'
    })
  })

  it('returns stable safe blocker details when activation is not ready', async () => {
    mockBody = { expectedConfigVersion: 3, reason: 'Attempt activation' }
    mockActivate.mockRejectedValue(new MeasurementError(
      'MEASUREMENT_NOT_READY',
      409,
      'Measurement profile is not eligible for live activation',
      { blockers: ['capability_not_ready'] }
    ))
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/activate.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      data: {
        error: {
          code: 'MEASUREMENT_NOT_READY',
          message: 'Measurement profile is not eligible for live activation',
          details: { blockers: ['capability_not_ready'] }
        }
      }
    })
  })
})
