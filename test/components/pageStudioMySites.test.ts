// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import MySites from '../../app/pages/studio/sites/index.vue'

const data = ref({ sites: [{ id: 'site-a', name: 'Customer website' }], total: 1 })
const error = ref<unknown>(null), launch = vi.fn(), notify = vi.fn(), refresh = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(MySites) }) })
  app.component('UButton', { props: ['to', 'label', 'disabled', 'loading'], emits: ['click'], template: '<a v-if="to" :href="to">{{ label }}</a><button v-else :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p role="alert">{{ title }} {{ description }}</p>' })
  for (const name of ['UCard', 'USkeleton', 'UPagination', 'UIcon']) app.component(name, { template: '<div><slot /></div>' })
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  error.value = null
  data.value = { sites: [{ id: 'site-a', name: 'Customer website' }], total: 1 }
  for (const [key, value] of Object.entries({ ref, computed, definePageMeta: vi.fn(), useHead: vi.fn(), useFetch: vi.fn(async () => ({ data, error, pending: ref(false), refresh })), useToast: () => ({ add: notify }), usePageStudioLauncher: () => ({ launchPageStudio: launch, editorOrigin: ref('https://studio.example') }) })) vi.stubGlobal(key, value)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it('opens the selected site through the customer launcher and retains product navigation', async () => {
  const host = await mount()
  const button = [...host.querySelectorAll('button')].find(x => x.textContent === 'Open Studio')!
  button.click()
  await flush()
  expect(launch).toHaveBeenCalledExactlyOnceWith('site-a', 'portal')
  expect([...host.querySelectorAll('a')].map(x => [x.textContent, x.getAttribute('href')])).toEqual([
    ['Draft history', '/studio/sites/site-a/history'],
    ['Manage website', '/studio/sites/site-a']
  ])
  expect(host.textContent).toContain('Customer website')
})
it('does not display retained site links after an access error', async () => {
  error.value = { statusCode: 403 }
  const host = await mount()
  expect(host.textContent).toContain('Your websites could not be loaded')
  expect(host.querySelector('a')).toBeNull()
  expect(host.textContent).not.toContain('Customer website')
})
it('gives unassigned customers an invitation next step', async () => {
  data.value = { sites: [], total: 0 }
  const host = await mount()
  expect(host.textContent).toContain('No websites are assigned')
  expect(launch).not.toHaveBeenCalled()
})
