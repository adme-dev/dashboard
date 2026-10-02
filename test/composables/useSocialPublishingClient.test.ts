import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed, effectScope, ref, watchEffect } from 'vue'

let mockRoute: { query: Record<string, unknown> }
let mockRouterReplace: ReturnType<typeof vi.fn>
let mockCookie: { value: string | null }
let mockClients: ReturnType<typeof ref<Array<{ id: string; name: string }>>>
let scope: ReturnType<typeof effectScope>

afterEach(() => scope.stop())
beforeEach(() => {
  scope = effectScope()
  mockRoute = { query: {} }
  mockRouterReplace = vi.fn()
  mockCookie = ref<string | null>(null)
  mockClients = ref(['c-route', 'c-cookie', 'c-new', 'c-old'].map(id => ({ id, name: id })))
  Object.assign(globalThis, {
    computed,
    ref,
    watchEffect,
    useRoute: () => mockRoute,
    useRouter: () => ({ replace: mockRouterReplace }),
    useCookie: () => mockCookie,
    useFetch: () => ({ data: mockClients }),
  })
})

async function load() {
  const mod = await import('~~/app/composables/useSocialPublishingClient')
  return scope.run(mod.useSocialPublishingClient)!
}

describe('useSocialPublishingClient', () => {
  it('prefers the accessible ?client= query param over the cookie and refreshes the sticky choice', async () => {
    mockRoute.query = { client: 'c-route' }
    mockCookie.value = 'c-cookie'
    const { clientId } = await load()
    expect(clientId.value).toBe('c-route')
    expect(mockCookie.value).toBe('c-route')
  })

  it('falls back to the accessible sticky cookie when there is no query param', async () => {
    mockCookie.value = 'c-cookie'
    const { clientId } = await load()
    expect(clientId.value).toBe('c-cookie')
  })

  it('is null when neither a selection nor an accessible client is available', async () => {
    mockClients.value = []
    const { clientId } = await load()
    expect(clientId.value).toBeNull()
    expect(mockCookie.value).toBeNull()
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('initially selects the first accessible client only when both query and cookie are absent', async () => {
    const { clientId } = await load()
    expect(clientId.value).toBe('c-route')
    expect(mockCookie.value).toBe('c-route')
    expect(mockRouterReplace).toHaveBeenCalledWith({ query: { client: 'c-route' } })
  })

  it('selecting a client writes the cookie and deep-links via the URL', async () => {
    mockRoute.query = { foo: 'bar' }
    const { clientId } = await load()
    mockRouterReplace.mockClear()
    clientId.value = 'c-new'
    expect(mockCookie.value).toBe('c-new')
    expect(mockRouterReplace).toHaveBeenCalledExactlyOnceWith({ query: { foo: 'bar', client: 'c-new' } })
  })

  it('clearing the client nulls the cookie and drops the param (no history spam)', async () => {
    mockRoute.query = { client: 'c-old', foo: 'bar' }
    mockCookie.value = 'c-old'
    const { clientId } = await load()
    clientId.value = null
    expect(mockCookie.value).toBeNull()
    expect(mockRouterReplace).toHaveBeenCalledExactlyOnceWith({ query: { foo: 'bar', client: undefined } })
  })
})
