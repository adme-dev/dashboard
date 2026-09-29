import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const user = ref<unknown>(null)
const fetchUser = vi.fn(), navigate = vi.fn()
vi.stubGlobal('defineNuxtRouteMiddleware', (fn: unknown) => fn)
vi.stubGlobal('usePortalAuth', () => ({ user, fetchUser }))
vi.stubGlobal('navigateTo', navigate)
const { default: guard } = await import('../../app/middleware/studio-auth')

beforeEach(() => {
  vi.clearAllMocks()
  user.value = null
})
describe('independent Studio sign-in', () => {
  it('retains the requested content destination when sign-in is required', async () => {
    fetchUser.mockResolvedValueOnce(null)
    await guard({ fullPath: '/studio/sites/site-a/content' } as never, {} as never)
    expect(navigate).toHaveBeenCalledWith({ path: '/studio', query: { redirect: '/studio/sites/site-a/content' } })
  })
  it('admits an existing native customer session without an agency login', async () => {
    fetchUser.mockResolvedValueOnce({ user: { id: 'customer' } })
    await guard({ fullPath: '/studio/sites' } as never, {} as never)
    expect(fetchUser).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
  })
})
