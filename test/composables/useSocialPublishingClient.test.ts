import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed, ref } from 'vue'

let mockRoute: { query: Record<string, unknown> }
let mockRouterReplace: ReturnType<typeof vi.fn>
let mockCookie: { value: string | null }

beforeEach(() => {
  mockRoute = { query: {} }
  mockRouterReplace = vi.fn()
  mockCookie = ref<string | null>(null)
  Object.assign(globalThis, {
    computed,
    ref,
    useRoute: () => mockRoute,
    useRouter: () => ({ replace: mockRouterReplace }),
    useCookie: () => mockCookie
  })
})

async function load() {
  const mod = await import('~~/app/composables/useSocialPublishingClient')
  return mod.useSocialPublishingClient()
}

describe('useSocialPublishingClient', () => {
  it('prefers the ?client= query param over the cookie', async () => {
    mockRoute.query = { client: 'c-route' }
    mockCookie.value = 'c-cookie'
    const { clientId } = await load()
    expect(clientId.value).toBe('c-route')
  })

  it('falls back to the sticky cookie when there is no query param', async () => {
    mockCookie.value = 'c-cookie'
    const { clientId } = await load()
    expect(clientId.value).toBe('c-cookie')
  })

  it('is null when neither query param nor cookie is set', async () => {
    const { clientId } = await load()
    expect(clientId.value).toBeNull()
  })

  it('selecting a client writes the cookie and deep-links via the URL', async () => {
    mockRoute.query = { foo: 'bar' }
    const { clientId } = await load()
    clientId.value = 'c-new'
    expect(mockCookie.value).toBe('c-new')
    expect(mockRouterReplace).toHaveBeenCalledWith({ query: { foo: 'bar', client: 'c-new' } })
  })

  it('clearing the client nulls the cookie and drops the param (no history spam)', async () => {
    mockRoute.query = { client: 'c-old', foo: 'bar' }
    mockCookie.value = 'c-old'
    const { clientId } = await load()
    clientId.value = null
    expect(mockCookie.value).toBeNull()
    expect(mockRouterReplace).toHaveBeenCalledWith({ query: { foo: 'bar', client: undefined } })
  })
})
