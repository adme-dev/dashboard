import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, readonly, ref } from 'vue'

const fetcher = vi.hoisted(() => vi.fn())
vi.mock('../../app/composables/useAuthenticatedFetch', () => ({ useAuthenticatedFetch: () => ({ fetch: fetcher }) }))
const states = new Map<string, ReturnType<typeof ref>>()
const navigate = vi.fn()
const toast = vi.fn()
vi.stubGlobal('useState', (key: string, init: () => unknown) => {
  if (!states.has(key)) states.set(key, ref(init()))
  return states.get(key)
})
vi.stubGlobal('computed', computed)
vi.stubGlobal('readonly', readonly)
vi.stubGlobal('useRouter', () => ({}))
vi.stubGlobal('navigateTo', navigate)
vi.stubGlobal('useToast', () => ({ add: toast }))
vi.stubGlobal('$fetch', fetcher)
const { useAuth } = await import('../../app/composables/useAuth')
const { usePortalAuth } = await import('../../app/composables/usePortalAuth')

describe.each([['agency', useAuth, 'auth-user', '/'], ['portal', usePortalAuth, 'portal-user', '/portal/login']] as const)(
  '%s logout state', (_name, useLogin, key, destination) => {
    beforeEach(() => {
      vi.clearAllMocks()
      states.clear()
    })
    it('retains the signed-in screen and shows retry feedback on server failure', async () => {
      const auth = useLogin()
      states.get(key)!.value = { id: 'current-user' }
      fetcher.mockRejectedValueOnce(new Error('service unavailable'))
      await expect(auth.logout()).rejects.toThrow('service unavailable')
      expect(auth.user.value?.id).toBe('current-user')
      expect(navigate).not.toHaveBeenCalled()
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sign out failed', color: 'error' }))
    })
    it('clears local identity and navigates after server confirmation', async () => {
      const auth = useLogin()
      states.get(key)!.value = { id: 'current-user' }
      fetcher.mockResolvedValueOnce({ success: true })
      await auth.logout()
      expect(auth.user.value).toBeNull()
      expect(navigate).toHaveBeenCalledWith(destination)
    })
  }
)
