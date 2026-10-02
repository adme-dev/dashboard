import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref, watchEffect } from 'vue'
import { useSocialPublishingClient as createClientContext } from '~~/app/composables/useSocialPublishingClient'

const clients = ref<any>([{ id: 'adme', name: 'ADME' }, { id: 'news', name: 'DriveAgent News' }])
const route = reactive<{ query: Record<string, unknown> }>({ query: {} })
const cookie = ref<string | null>(null)
const replace = vi.fn(({ query }) => { route.query = query })
let scope = effectScope()
const useSocialPublishingClient = () => scope.run(createClientContext)!
afterEach(() => scope.stop())

beforeEach(() => {
  scope = effectScope()
  route.query = {}
  cookie.value = null
  clients.value = [{ id: 'adme', name: 'ADME' }, { id: 'news', name: 'DriveAgent News' }]
  replace.mockClear()
  Object.assign(globalThis, { computed, watchEffect, useRoute: () => route,
    useRouter: () => ({ replace }), useCookie: () => cookie,
    useFetch: () => ({ data: clients }) })
})

describe('social publishing client context', () => {
  it('keeps explicit News ahead of the first ADME client and sticky selection', () => {
    route.query = { client: 'news', status: 'unread' }
    cookie.value = 'adme'
    const header = useSocialPublishingClient()
    const body = useSocialPublishingClient()
    expect(header.clientId.value).toBe('news')
    expect(body.clientId.value).toBe('news')
    expect(cookie.value).toBe('news')
    body.clientId.value = 'adme'
    expect(header.clientId.value).toBe('adme')
    expect(route.query.status).toBe('unread')
  })

  it('uses the valid cookie across Accounts, Compose and News navigation', () => {
    cookie.value = 'news'
    expect(useSocialPublishingClient().clientId.value).toBe('news')
  })

  it.each(['unknown', ['news', 'adme'], ''])('does not silently use ADME for an invalid explicit query %j', value => {
    cookie.value = 'adme'
    route.query = { client: value }
    const context = useSocialPublishingClient()
    expect(context.clientId.value).toBeNull()
    expect(cookie.value).toBe('adme')
    expect(replace).not.toHaveBeenCalled()
  })

  it('requires selection when the sticky client is no longer available', () => {
    cookie.value = 'removed'
    expect(useSocialPublishingClient().clientId.value).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not issue a client ID before the accessible list is loaded', () => {
    clients.value = null
    route.query = { client: 'news' }
    expect(useSocialPublishingClient().clientId.value).toBeNull()
  })
})
