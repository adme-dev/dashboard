import { beforeEach, describe, expect, it, vi } from 'vitest'

const validateSession = vi.fn()
const acceptGodModeInternalExecution = vi.fn(async () => null)
const kvGet = vi.fn().mockResolvedValue(null)
const kvPut = vi.fn()
const resolveUserPermissions = vi.fn()

vi.mock('../../../server/utils/auth', () => ({
  validateSession,
  acceptGodModeInternalExecution,
  TransientAuthError: class TransientAuthError extends Error {}
}))
vi.mock('../../../server/utils/kv', () => ({ kvGet, kvPut }))
vi.mock('../../../server/utils/roleResolver', () => ({ resolveUserPermissions }))
vi.mock('../../../server/utils/permissions', () => ({ isReadOnlyRole: vi.fn(() => false) }))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRequestURL: (event: any) => URL
  getHeader: (event: any, name: string) => string | undefined
  getCookie: () => undefined
  deleteCookie: () => void
}
testGlobal.defineEventHandler = handler => handler
testGlobal.getRequestURL = event => new URL(`https://app.xeroflow.io${event.path}`)
testGlobal.getHeader = (event, name) => event.headers[name.toLowerCase()]
testGlobal.getCookie = () => undefined
testGlobal.deleteCookie = vi.fn()

const { default: authMiddleware } = await import('../../../server/middleware/auth')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'

function owner(overrides: Record<string, unknown> = {}) {
  return {
    id: OWNER_ID,
    email: 'owner@example.com',
    name: 'Owner',
    role: 'owner',
    is_active: true,
    custom_role_id: 'restricted-custom-role',
    ...overrides
  }
}

function event() {
  return {
    method: 'GET',
    path: '/api/agency/clients',
    headers: { authorization: 'Bearer valid-owner-session' },
    context: {}
  } as any
}

describe('God mode permission cache isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    kvGet.mockResolvedValue(null)
  })

  it('keeps active-owner all-groups request-local instead of caching elevated permissions', async () => {
    validateSession.mockResolvedValue(owner())
    resolveUserPermissions.mockResolvedValue({
      groups: ['ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE'],
      customRoleId: 'restricted-custom-role',
      roleName: 'owner',
      isReadOnly: false,
      godModeElevated: true
    })
    const request = event()

    await authMiddleware(request)

    expect(request.context.user.permissionGroups).toEqual(['ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE'])
    expect(kvPut).not.toHaveBeenCalled()
  })

  it('never writes an owner identity to the fast cache when God mode is disabled', async () => {
    validateSession.mockResolvedValue(owner())
    resolveUserPermissions.mockResolvedValue({
      groups: ['CLIENTS'],
      customRoleId: 'restricted-custom-role',
      roleName: 'Restricted Owner',
      isReadOnly: true
    })

    await authMiddleware(event())

    expect(kvPut).not.toHaveBeenCalled()
  })

  it('revalidates a legacy cached owner so disable then re-enable takes effect per request', async () => {
    kvGet.mockResolvedValue(owner({ permissionGroups: ['CLIENTS'], isCustomReadOnly: true }))
    validateSession.mockResolvedValue(owner())
    resolveUserPermissions
      .mockResolvedValueOnce({
        groups: ['CLIENTS'],
        customRoleId: 'restricted-custom-role',
        roleName: 'Restricted Owner',
        isReadOnly: true
      })
      .mockResolvedValueOnce({
        groups: ['ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE'],
        customRoleId: 'restricted-custom-role',
        roleName: 'Restricted Owner',
        isReadOnly: true,
        godModeElevated: true
      })
    const disabledRequest = event()
    const reenabledRequest = event()

    await authMiddleware(disabledRequest)
    await authMiddleware(reenabledRequest)

    expect(validateSession).toHaveBeenCalledTimes(2)
    expect(disabledRequest.context.user.permissionGroups).toEqual(['CLIENTS'])
    expect(reenabledRequest.context.user.permissionGroups).toEqual(['ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE'])
    expect(kvPut).not.toHaveBeenCalled()
  })

  it('revalidates a legacy cached owner so resolver failure can recover on the next request', async () => {
    kvGet.mockResolvedValue(owner({ permissionGroups: ['CLIENTS'] }))
    validateSession.mockResolvedValue(owner())
    resolveUserPermissions
      .mockResolvedValueOnce({
        groups: ['CLIENTS'],
        customRoleId: 'restricted-custom-role',
        roleName: 'Restricted Owner',
        isReadOnly: true
      })
      .mockResolvedValueOnce({
        groups: ['ADMIN', 'CLIENTS'],
        customRoleId: 'restricted-custom-role',
        roleName: 'Restricted Owner',
        isReadOnly: true,
        godModeElevated: true
      })
    const failedRequest = event()
    const recoveredRequest = event()

    await authMiddleware(failedRequest)
    await authMiddleware(recoveredRequest)

    expect(failedRequest.context.user.permissionGroups).toEqual(['CLIENTS'])
    expect(recoveredRequest.context.user.permissionGroups).toEqual(['ADMIN', 'CLIENTS'])
    expect(resolveUserPermissions).toHaveBeenCalledTimes(2)
  })

  it('rejects a revoked owner session even when a legacy owner cache entry exists', async () => {
    kvGet.mockResolvedValue(owner({ permissionGroups: ['ADMIN'] }))
    validateSession.mockResolvedValue(null)

    await expect(authMiddleware(event())).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'Invalid or expired session'
    })
    expect(validateSession).toHaveBeenCalledOnce()
  })
})
