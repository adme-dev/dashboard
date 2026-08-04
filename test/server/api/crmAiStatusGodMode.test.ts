import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuth = vi.fn()
const isCrmAiEnabled = vi.fn(() => false)
const resolveGodModeAuthority = vi.fn()

vi.mock('../../../server/utils/auth', () => ({ requireAuth }))
vi.mock('../../../server/utils/crm/aiConfig', () => ({ isCrmAiEnabled }))
vi.mock('../../../server/utils/godMode/authority', () => ({ resolveGodModeAuthority }))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
}
testGlobal.defineEventHandler = handler => handler

const { seedGodModeRouteAuditState } = await import('../../../server/utils/godMode/featureGate')
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
        headers: { host: 'app.xeroflow.test' },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
  seedGodModeRouteAuditState(request, {
    actorUserId: OWNER_ID,
    correlationId: '22222222-2222-4222-8222-222222222222',
    sessionDigest: 'a'.repeat(64),
    routeOrTool: 'GET /api/crm/ai/status',
    emergencyDisabled: false
  })
  return request
}

describe('CRM AI status God mode feature gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isCrmAiEnabled.mockReturnValue(false)
    resolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: OWNER_ID,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    requireAuth.mockImplementation(async request => request.context.user)
  })

  it('uses the reviewed application feature adapter for an audited active-owner read', async () => {
    await expect(handler(event())).resolves.toEqual({ enabled: true })
    expect(isCrmAiEnabled).toHaveBeenCalledOnce()
  })

  it('does not enable the application feature for a non-owner', async () => {
    resolveGodModeAuthority.mockResolvedValue({
      active: false,
      actorUserId: OWNER_ID,
      reason: 'not_owner',
      emergencyDisabled: false
    })

    await expect(handler(event())).resolves.toEqual({ enabled: false })
  })
})
