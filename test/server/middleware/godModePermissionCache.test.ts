import { describe, expect, it, vi } from 'vitest'

const validateSession = vi.fn()
const kvGet = vi.fn().mockResolvedValue(null)
const kvPut = vi.fn()
const resolveUserPermissions = vi.fn()

vi.mock('../../../server/utils/auth', () => ({
  validateSession,
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

describe('God mode permission cache isolation', () => {
  it('keeps active-owner all-groups request-local instead of caching elevated permissions', async () => {
    validateSession.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'owner',
      is_active: true,
      custom_role_id: 'restricted-custom-role'
    })
    resolveUserPermissions.mockResolvedValue({
      groups: ['ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE'],
      customRoleId: 'restricted-custom-role',
      roleName: 'owner',
      isReadOnly: false,
      godModeElevated: true
    })
    const event = {
      method: 'GET',
      path: '/api/agency/clients',
      headers: { authorization: 'Bearer valid-owner-session' },
      context: {}
    } as any

    await authMiddleware(event)

    expect(event.context.user.permissionGroups).toEqual(['ADMIN', 'HR_ADMIN', 'MANAGEMENT', 'FINANCE'])
    expect(kvPut).not.toHaveBeenCalled()
  })
})
