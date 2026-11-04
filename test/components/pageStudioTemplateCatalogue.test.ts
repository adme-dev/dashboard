// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import Catalogue from '~~/app/components/page-studio/TemplateCatalogue.client.vue'

let app: ReturnType<typeof createApp> | undefined
const data = ref<unknown>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const refresh = vi.fn()
const fetcher = vi.fn()
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  data.value = null
  error.value = null
  pending.value = false
})
async function mount(endpoint: '/api/portal/page-studio/templates' | '/api/portal/page-studio/customer/templates' = '/api/portal/page-studio/templates') {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('ref', ref)
  fetcher.mockResolvedValue({ data, pending, error, refresh })
  vi.stubGlobal('useFetch', fetcher)
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Suspense, null, { default: () => h(Catalogue, { endpoint }) }) })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' })
  for (const name of ['UCard', 'UBadge']) app.component(name, { template: '<div><slot /></div>' })
  app.component('USkeleton', { template: '<div />' })
  app.mount(host)
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
  return host
}
const card = { id: 'template_one', versionId: 'version_one', name: 'Allowed automotive design', category: 'automotive', format: 'code-pages', status: 'preparing', thumbnail: null, canPreview: false, canUse: false, unavailableReason: 'This template is being prepared.' }
it('renders only returned templates with disabled actions and no preview URL', async () => {
  data.value = { items: [card], nextCursor: null }
  const host = await mount()
  expect(host.textContent).toContain(card.name)
  expect(host.textContent).toContain(card.unavailableReason)
  expect(host.textContent).not.toContain('Kia')
  const actions = [...host.querySelectorAll('button')].filter(button => ['Preview', 'Use template'].includes(button.textContent ?? ''))
  expect(actions).toHaveLength(2)
  expect(actions.every(button => button.disabled)).toBe(true)
  expect(host.querySelector('iframe,a')).toBeNull()
})
it('shows an honest empty state', async () => {
  data.value = { items: [], nextCursor: null }
  expect((await mount()).textContent).toContain('No templates are available to this account yet')
})
it('shows loading before empty state', async () => {
  pending.value = true
  const host = await mount()
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
  expect(host.textContent).not.toContain('No templates are available')
})
it('hides stale cards after access fails and retries the read', async () => {
  data.value = { items: [card], nextCursor: null }
  error.value = new Error('denied')
  const host = await mount()
  expect(host.textContent).not.toContain(card.name)
  expect(host.textContent).toContain('Templates could not be loaded')
  ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Try again')?.click()
  expect(refresh).toHaveBeenCalledOnce()
})
it('uses the native customer adapter when provided by its page', async () => {
  data.value = { items: [], nextCursor: null }
  await mount('/api/portal/page-studio/customer/templates')
  expect(fetcher.mock.calls[0][0]()).toBe('/api/portal/page-studio/customer/templates')
})

it('uses opaque cursors without changing the account endpoint', async () => {
  data.value = { items: [card], nextCursor: '20000000-0000-4000-8000-000000000002' }
  const host = await mount()
  ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Next page')?.click()
  await nextTick()
  expect(fetcher.mock.calls[0][1].query.value).toEqual({ cursor: '20000000-0000-4000-8000-000000000002', limit: 20 })
  ;[...host.querySelectorAll('button')].find(button => button.textContent === 'First page')?.click()
  await nextTick()
  expect(fetcher.mock.calls[0][1].query.value).toEqual({ limit: 20 })
})
