import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireClientAuth: vi.fn(),
  isEnabled: vi.fn()
}))

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: mocks.requireClientAuth
}))
vi.mock('~~/server/utils/searchAuthority/feature', () => ({
  isSearchAuthorityEnabled: mocks.isEnabled
}))
vi.stubGlobal('eventHandler', (handler: unknown) => handler)

describe('portal Search Authority availability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireClientAuth.mockResolvedValue({
      clientId: '11111111-1111-4111-8111-111111111111',
      permissions: { canViewAnalytics: true }
    })
    mocks.isEnabled.mockResolvedValue(true)
  })

  it('shows the navigation entry only for the authenticated entitled client', async () => {
    const handler = (await import(
      '~~/server/api/portal/search-authority/availability.get'
    )).default

    await expect(handler({} as never)).resolves.toEqual({ available: true })
    expect(mocks.isEnabled).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    )
  })

  it('hides the entry without analytics permission', async () => {
    mocks.requireClientAuth.mockResolvedValue({
      clientId: '11111111-1111-4111-8111-111111111111',
      permissions: { canViewAnalytics: false }
    })
    const handler = (await import(
      '~~/server/api/portal/search-authority/availability.get'
    )).default

    await expect(handler({} as never)).resolves.toEqual({ available: false })
    expect(mocks.isEnabled).not.toHaveBeenCalled()
  })
})
