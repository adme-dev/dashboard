import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuth = vi.fn()
const requirePermission = vi.fn()
const isCrmAiEnabled = vi.fn(() => false)
const resolveGodModeAuthority = vi.fn()
const appendGodModeAuditEvent = vi.fn()

vi.mock('../../../server/utils/auth', () => ({ requireAuth, requirePermission }))
vi.mock('../../../server/utils/crm/aiConfig', () => ({ isCrmAiEnabled }))
vi.mock('../../../server/utils/godMode/audit', () => ({ appendGodModeAuditEvent }))
vi.mock('../../../server/utils/godMode/authority', () => ({
  resolveGodModeAuthority,
  isActiveGodModeAuthority: (authority: unknown, actorUserId: string) => {
    const candidate = authority as Record<string, unknown> | null
    return candidate?.active === true
      && candidate.actorUserId === actorUserId
      && candidate.reason === 'active_owner'
      && candidate.emergencyDisabled === false
  }
}))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
}
testGlobal.defineEventHandler = handler => handler

const { default: handler } = await import('../../../server/api/crm/ai/status.get')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'

function event() {
  const request = {
    method: 'GET',
    path: '/api/crm/ai/status?detail=1',
    context: { user: { id: OWNER_ID, role: 'owner' } },
    node: {
      req: {
        originalUrl: '/api/crm/ai/status?detail=1',
        headers: {
          host: 'app.xeroflow.test',
          authorization: 'Bearer owner-session-secret'
        },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
  return request
}

describe('CRM AI status God mode feature gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appendGodModeAuditEvent.mockResolvedValue(undefined)
    isCrmAiEnabled.mockReturnValue(false)
    resolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: OWNER_ID,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    requireAuth.mockImplementation(async request => request.context.user)
    requirePermission.mockImplementation(async request => request.context.user)
  })

  it('uses the reviewed application feature adapter for an audited active-owner read', async () => {
    await expect(handler(event())).resolves.toEqual({ enabled: true })
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'CLIENTS')
    expect(isCrmAiEnabled).toHaveBeenCalledOnce()
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ phase: 'attempt' }))
    expect(appendGodModeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'bypass',
      bypassedControls: ['feature_flag']
    }))
  })

  it('does not enable the application feature for a non-owner', async () => {
    resolveGodModeAuthority.mockResolvedValue({
      active: false,
      actorUserId: OWNER_ID,
      reason: 'not_owner',
      emergencyDisabled: false
    })

    await expect(handler(event())).resolves.toEqual({ enabled: false })
    expect(appendGodModeAuditEvent).not.toHaveBeenCalled()
  })
})
