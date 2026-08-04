import { beforeEach, describe, expect, it, vi } from 'vitest'

const validateSession = vi.fn()
const acceptGodModeInternalExecution = vi.fn(async () => null)
const kvGet = vi.fn()
const kvPut = vi.fn()
const kvDelete = vi.fn()
const queryOne = vi.fn()
const resolveGodModeAuthority = vi.fn()
const appendGodModeAuditEvent = vi.fn()

vi.mock('../../../server/utils/auth', () => ({
  validateSession,
  acceptGodModeInternalExecution,
  TransientAuthError: class TransientAuthError extends Error {}
}))
vi.mock('../../../server/utils/kv', () => ({ kvGet, kvPut, kvDelete }))
vi.mock('../../../server/utils/db', () => ({ queryOne }))
vi.mock('../../../server/utils/godMode/authority', () => ({ resolveGodModeAuthority }))
vi.mock('../../../server/utils/godMode/audit', () => ({ appendGodModeAuditEvent }))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRequestURL: (event: any) => URL
  getHeader: (event: any, name: string) => string | undefined
  getCookie: () => undefined
  deleteCookie: () => void
}
testGlobal.defineEventHandler = handler => handler
testGlobal.getRequestURL = event => new URL(event.node.req.originalUrl, 'https://app.xeroflow.test')
testGlobal.getHeader = (event, name) => event.node.req.headers[name.toLowerCase()]
testGlobal.getCookie = () => undefined
testGlobal.deleteCookie = vi.fn()

const { default: authMiddleware } = await import('../../../server/middleware/auth')
const { handleGodModeRequest } = await import('../../../server/middleware/godMode')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'

function event() {
  return {
    method: 'POST',
    path: '/api/agency/clients',
    context: {},
    node: {
      req: {
        originalUrl: '/api/agency/clients',
        headers: {
          host: 'app.xeroflow.test',
          authorization: 'Bearer owner-session'
        },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as any
}

describe('active owner with a custom read-only role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    kvGet.mockResolvedValue(null)
    validateSession.mockResolvedValue({
      id: OWNER_ID,
      email: 'owner@example.com',
      name: 'Owner',
      role: 'owner',
      is_active: true,
      custom_role_id: 'restricted-owner-role'
    })
    queryOne.mockResolvedValue({
      name: 'Restricted Owner',
      is_read_only: true,
      permission_groups: ['CLIENTS']
    })
    resolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: OWNER_ID,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    appendGodModeAuditEvent.mockResolvedValue(undefined)
  })

  it('preserves custom read-only state and denies an unregistered POST before its handler', async () => {
    const request = event()

    await authMiddleware(request)
    expect(request.context.user.isCustomReadOnly).toBe(true)

    await expect(handleGodModeRequest(request)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'God mode mutation coordination required'
    })
    expect(appendGodModeAuditEvent).toHaveBeenCalledOnce()
  })
})
