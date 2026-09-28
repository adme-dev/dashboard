import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canAccessQrCodes } from '../../shared/qr/permissions'

const mocks = vi.hoisted(() => ({ validate: vi.fn(), fresh: vi.fn(), resolve: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.validate, requireAuth: vi.fn(), TransientAuthError: class extends Error {} }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.fresh, queryOne: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/roleResolver', () => ({ resolveUserPermissions: mocks.resolve }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: async () => ({ active: false }) }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), getHeader: () => undefined }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getCookie', () => 'synthetic-cookie')
const { default: me } = await import('../../server/api/auth/me.get')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.validate.mockResolvedValue({ id: 'tina', role: 'member', is_active: true, email: 'member@example.invalid' })
  mocks.resolve.mockResolvedValue({ groups: [], isReadOnly: false })
})
describe('team QR permission reaches navigation', () => {
  it('exposes QR access to the menu without widening cached general permissions', async () => {
    mocks.fresh.mockResolvedValue({ allowed: true })
    const result = await me({} as H3Event)
    expect(result.user.qrCodeAccess).toBe(true)
    expect(canAccessQrCodes(result.user)).toBe(true)
    expect(result.user.permissionGroups).toEqual([])
    mocks.fresh.mockResolvedValue(null)
    const afterRemoval = await me({} as H3Event)
    expect(afterRemoval.user.qrCodeAccess).toBe(false)
    expect(canAccessQrCodes(afterRemoval.user)).toBe(false)
  })
})
