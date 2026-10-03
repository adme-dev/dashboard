// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onScopeDispose, reactive, ref, Suspense, watch, watchEffect } from 'vue'
import Wall from '~~/app/pages/agency/social/publishing/wall.vue'

const clients = ref<unknown>(null)
const route = reactive<{ query: Record<string, unknown> }>({ query: {} })
const cookie = ref<string | null>('product')
const fetchMock = vi.fn()
const cleanups: (() => void)[] = []
Object.assign(globalThis, { computed, ref, watch, watchEffect, onScopeDispose,
  useRoute: () => route, useRouter: () => ({ replace: ({ query }: typeof route) => { route.query = query } }),
  useCookie: () => cookie, useFetch: () => ({ data: clients }), $fetch: fetchMock,
  useAuth: () => ({ isManager: true, canWrite: true }) })

async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Wall) }) })
  app.component('SocialPublishingShell', { template: '<main><slot name="actions"/><slot/></main>' })
  app.component('UButton', { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' })
  app.component('UBadge', { template: '<span><slot/></span>' })
  for (const name of ['UInput', 'USelectMenu', 'USkeleton', 'UIcon', 'SocialPublishingPostHistory', 'SocialPublishingLivePostManager']) app.component(name, { template: '<span/>' })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}
function hydrate() {
  clients.value = [{ id: 'product', name: 'DriveAgent' }, { id: 'news', name: 'DriveAgent News' }]
}
function post(content: string) {
  return { id: content, content, status: 'published', platforms: ['facebook'], accounts: [], metrics: {}, media_urls: [] }
}
beforeEach(() => {
  clients.value = null
  cookie.value = 'product'
  route.query = {}
  fetchMock.mockReset().mockResolvedValue([])
})
afterEach(() => cleanups.splice(0).forEach(fn => fn()))

it('waits for the saved client to hydrate, then loads automatically without a refresh', async () => {
  fetchMock.mockResolvedValue([post('Product publication')])
  const host = mount()
  await flush()
  expect(fetchMock).not.toHaveBeenCalled()
  hydrate()
  await flush()
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/agency/social/publishing/wall', { query: { clientId: 'product', limit: 180 } })
  expect(host.textContent).toContain('Product publication')
})
it('honours a deep-linked client over the saved client once the list loads', async () => {
  route.query = { client: 'news' }
  mount()
  await flush()
  hydrate()
  await flush()
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/agency/social/publishing/wall', { query: { clientId: 'news', limit: 180 } })
})
it('does not request posts for an invalid client or silently select another client', async () => {
  route.query = { client: 'unavailable' }
  hydrate()
  const host = mount()
  await flush()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('Could not load social wall')
})
it.each(['success', 'failure'])('ignores a late %s from the previous client', async (outcome) => {
  hydrate()
  let resolve!: (value: unknown) => void
  let reject!: (error: Error) => void
  fetchMock.mockImplementationOnce(() => new Promise((yes, no) => {
    resolve = yes
    reject = no
  }))
    .mockResolvedValueOnce([post('News publication')])
  const host = mount()
  await flush()
  route.query = { client: 'news' }
  await flush()
  if (outcome === 'success') resolve([post('Old product publication')])
  else reject(new Error('Previous client failed'))
  await flush()
  expect(host.textContent).toContain('News publication')
  expect(host.textContent).not.toContain('Old product publication')
  expect(host.textContent).not.toContain('Previous client failed')
})
