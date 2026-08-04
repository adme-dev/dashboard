import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getCookie: ReturnType<typeof vi.fn>
  deleteCookie: ReturnType<typeof vi.fn>
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getCookie = vi.fn()
testGlobal.deleteCookie = vi.fn()

const mockGetHeader = vi.fn()
const mockValidateSession = vi.fn()
const mockResolveUserPermissions = vi.fn()
const mockResolveGodModeAuthority = vi.fn()

vi.mock('h3', () => ({
  getHeader: (...args: unknown[]) => mockGetHeader(...args)
}))

vi.mock('~~/server/utils/auth', () => ({
  validateSession: (...args: unknown[]) => mockValidateSession(...args),
  TransientAuthError: class TransientAuthError extends Error {}
}))

vi.mock('~~/server/utils/roleResolver', () => ({
  resolveUserPermissions: (...args: unknown[]) => mockResolveUserPermissions(...args)
}))

vi.mock('~~/server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: (...args: unknown[]) => mockResolveGodModeAuthority(...args)
}))

const { default: meHandler } = await import('../../../../server/api/auth/me.get')

describe('auth me God mode state', () => {
  const event = { context: {} } as any

  beforeEach(() => {
    vi.clearAllMocks()
    testGlobal.getCookie.mockImplementation((_event: unknown, name: string) => name === 'auth_token' ? 'session-token' : undefined)
    mockGetHeader.mockReturnValue(undefined)
    mockValidateSession.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
      name: 'Owner User',
      role: 'owner',
      avatar_url: null,
      is_active: true,
      custom_role_id: null
    })
    mockResolveUserPermissions.mockResolvedValue({ groups: ['ADMIN'], isReadOnly: false })
  })

  it('returns only the client-safe active God mode label after server authority resolution', async () => {
    mockResolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: '11111111-1111-4111-8111-111111111111',
      reason: 'active_owner',
      emergencyDisabled: false
    })

    const result = await meHandler(event)

    expect(mockResolveGodModeAuthority).toHaveBeenCalledWith(
      event,
      '11111111-1111-4111-8111-111111111111'
    )
    expect(result.user.godMode).toEqual({ active: true, label: 'God mode active' })
    expect(result.user.godMode).not.toHaveProperty('reason')
    expect(result.user.godMode).not.toHaveProperty('emergencyDisabled')
    expect(result.user).not.toHaveProperty('actorUserId')
  })

  it('returns inactive client-safe God mode state without exposing denial evidence', async () => {
    mockResolveGodModeAuthority.mockResolvedValue({
      active: false,
      actorUserId: '11111111-1111-4111-8111-111111111111',
      reason: 'verification_failed',
      emergencyDisabled: false
    })

    const result = await meHandler(event)

    expect(result.user.godMode).toEqual({ active: false, label: 'God mode active' })
    expect(result.user.godMode).not.toHaveProperty('reason')
    expect(result.user.godMode).not.toHaveProperty('emergencyDisabled')
  })
})
