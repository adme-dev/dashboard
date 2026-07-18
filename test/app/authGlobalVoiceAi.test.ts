import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigateTo = vi.fn()
const useCookie = vi.fn(() => ({ value: null }))

vi.stubGlobal('defineNuxtRouteMiddleware', <T>(handler: T) => handler)
vi.stubGlobal('navigateTo', navigateTo)
vi.stubGlobal('useCookie', useCookie)

const { default: authMiddleware } = await import('../../app/middleware/auth.global')

describe('global auth middleware Voice AI routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows unauthenticated visitors to open the public Voice AI page', async () => {
    const result = await authMiddleware(
      { path: '/voice-ai', fullPath: '/voice-ai' } as never,
      {} as never
    )

    expect(result).toBeUndefined()
    expect(useCookie).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('does not make similarly prefixed app routes public', async () => {
    await authMiddleware(
      { path: '/voice-ai-admin', fullPath: '/voice-ai-admin' } as never,
      {} as never
    )

    expect(useCookie).toHaveBeenCalledTimes(3)
    expect(navigateTo).toHaveBeenCalledWith({
      path: '/auth/login',
      query: { redirect: '/voice-ai-admin' }
    })
  })
})
