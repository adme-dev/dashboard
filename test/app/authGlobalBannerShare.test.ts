import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigateTo = vi.fn()
const useCookie = vi.fn(() => ({ value: null }))
vi.stubGlobal('defineNuxtRouteMiddleware', <T>(handler: T) => handler)
vi.stubGlobal('navigateTo', navigateTo)
vi.stubGlobal('useCookie', useCookie)
const { default: authMiddleware } = await import('../../app/middleware/auth.global')
const sharePath = '/share/banner/p_0123456789abcdef0123456789abcdef'

describe('signed-out banner client routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([sharePath, `${sharePath}/`])('opens the token viewer %s without a login redirect', async (path) => {
    await authMiddleware({ path, fullPath: path } as never, {} as never)
    expect(useCookie).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it.each(['/share/banner', '/share/banner/manage', `${sharePath}/edit`, '/creative/banner-studio/view/project'])('keeps %s protected', async (path) => {
    await authMiddleware({ path, fullPath: path } as never, {} as never)
    expect(navigateTo).toHaveBeenCalledWith({ path: '/auth/login', query: { redirect: path } })
  })
})
